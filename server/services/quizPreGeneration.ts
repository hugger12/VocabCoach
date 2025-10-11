import { storage } from "../storage.js";
import { aiService } from "./ai.js";
import type { Word } from "@shared/schema.js";

/**
 * Server-side quiz pre-generation service
 * Automatically generates and caches quiz variants when an instructor activates a vocabulary list
 */

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Pre-generate quiz variants for a vocabulary list
 * Creates 3 variants (0, 1, 2) with cloze and passage quizzes
 * 
 * @param listId - The vocabulary list ID
 * @param instructorId - The instructor ID who owns the list
 */
export async function preGenerateQuizVariants(listId: string, instructorId: string): Promise<void> {
  const startTime = Date.now();
  console.log(`🎯 Starting quiz pre-generation for list ${listId} (instructor: ${instructorId})`);

  try {
    // 1. Fetch all words from the vocabulary list
    const allWords = await storage.getWords(listId, instructorId);
    
    if (allWords.length < 12) {
      console.log(`⚠️  List ${listId} has only ${allWords.length} words - need at least 12 for full quiz generation`);
      // Still generate with what we have, but log the limitation
    }

    console.log(`📚 Found ${allWords.length} words in list ${listId}`);

    // 2. Generate 3 quiz variants (0, 1, 2)
    const variantCount = 3;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    for (let variant = 0; variant < variantCount; variant++) {
      console.log(`\n🔄 Generating variant ${variant} for list ${listId}...`);
      
      try {
        // Shuffle words for this variant to get random selection
        const shuffledWords = shuffleArray(allWords);
        
        // Select 6 words for cloze questions (questions 1-6)
        const clozeWords = shuffledWords.slice(0, Math.min(6, shuffledWords.length));
        
        // Select 6 different words for passage quiz (questions 7-12)
        // If we have enough words, use the next 6. Otherwise, reuse from the beginning but shuffle again
        let passageWords: Word[];
        if (shuffledWords.length >= 12) {
          passageWords = shuffledWords.slice(6, 12);
        } else {
          // Not enough unique words, so shuffle again and take different ones
          const secondShuffle = shuffleArray(allWords);
          passageWords = secondShuffle.slice(0, Math.min(6, secondShuffle.length));
        }

        // Generate cloze questions
        console.log(`  📝 Generating ${clozeWords.length} cloze questions for variant ${variant}...`);
        const clozeStartTime = Date.now();
        
        const clozeQuestionsData = await aiService.generateOptimizedClozeQuestions(
          clozeWords.map(w => ({
            text: w.text,
            partOfSpeech: w.partOfSpeech,
            kidDefinition: w.kidDefinition
          }))
        );
        
        console.log(`  ✅ Generated cloze questions in ${Date.now() - clozeStartTime}ms`);

        // Create quiz cache entry for cloze variant
        const clozeCacheKey = `${listId}-${variant}-cloze`;
        const clozeCache = await storage.createQuizCache({
          listId,
          variant,
          quizType: 'cloze',
          questionCount: clozeQuestionsData.length,
          expiresAt,
          cacheKey: clozeCacheKey
        });

        console.log(`  💾 Created cloze cache entry: ${clozeCache.id} (key: ${clozeCacheKey})`);

        // Store individual cloze questions
        for (let i = 0; i < clozeQuestionsData.length; i++) {
          const questionData = clozeQuestionsData[i];
          const wordData = clozeWords[i];
          
          await storage.createQuizQuestion({
            quizCacheId: clozeCache.id,
            questionNumber: i + 1, // Questions 1-6
            questionType: 'cloze',
            questionData: {
              sentence1: questionData.sentence1,
              sentence2: questionData.sentence2,
              correctAnswer: questionData.correctAnswer,
              distractors: questionData.distractors,
              choices: [questionData.correctAnswer, ...questionData.distractors].sort(() => Math.random() - 0.5)
            },
            wordId: wordData?.id || null
          });
        }

        console.log(`  ✅ Stored ${clozeQuestionsData.length} cloze questions`);

        // Generate passage quiz
        console.log(`  📖 Generating passage quiz with ${passageWords.length} words for variant ${variant}...`);
        const passageStartTime = Date.now();
        
        const passageData = await aiService.generateValidatedPassageQuiz(
          passageWords.map(w => ({
            text: w.text,
            partOfSpeech: w.partOfSpeech,
            kidDefinition: w.kidDefinition
          }))
        );
        
        console.log(`  ✅ Generated passage quiz in ${Date.now() - passageStartTime}ms`);

        // Create quiz cache entry for passage variant
        const passageCacheKey = `${listId}-${variant}-passage`;
        const passageCache = await storage.createQuizCache({
          listId,
          variant,
          quizType: 'passage',
          questionCount: passageData.blanks.length,
          expiresAt,
          cacheKey: passageCacheKey
        });

        console.log(`  💾 Created passage cache entry: ${passageCache.id} (key: ${passageCacheKey})`);

        // Store individual passage questions
        for (let i = 0; i < passageData.blanks.length; i++) {
          const blankData = passageData.blanks[i];
          const wordData = passageWords[i];
          
          await storage.createQuizQuestion({
            quizCacheId: passageCache.id,
            questionNumber: blankData.blankNumber, // Questions 7-12 (or 1-6 if standalone)
            questionType: 'passage',
            questionData: {
              passageText: passageData.passageText,
              title: passageData.title,
              blankNumber: blankData.blankNumber,
              correctAnswer: blankData.correctAnswer,
              distractors: blankData.distractors,
              choices: [blankData.correctAnswer, ...blankData.distractors].sort(() => Math.random() - 0.5)
            },
            wordId: wordData?.id || null
          });
        }

        console.log(`  ✅ Stored ${passageData.blanks.length} passage questions`);
        console.log(`✅ Completed variant ${variant} for list ${listId}`);

      } catch (variantError) {
        console.error(`❌ Error generating variant ${variant} for list ${listId}:`, variantError);
        // Continue with next variant even if this one fails
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`\n🎉 Quiz pre-generation completed for list ${listId} in ${totalTime}ms`);
    console.log(`   - Generated ${variantCount} variants`);
    console.log(`   - Total questions: ${variantCount * 12} (6 cloze + 6 passage per variant)`);
    console.log(`   - Cache expires: ${expiresAt.toISOString()}`);

  } catch (error) {
    console.error(`❌ Fatal error in quiz pre-generation for list ${listId}:`, error);
    throw error;
  }
}

/**
 * Check if quiz variants already exist for a list
 * Returns true if all variants are already cached and not expired
 */
export async function hasValidQuizCache(listId: string): Promise<boolean> {
  try {
    const variantCount = 3;
    const quizTypes = ['cloze', 'passage'];
    
    for (let variant = 0; variant < variantCount; variant++) {
      for (const quizType of quizTypes) {
        const cache = await storage.getQuizCacheByListId(listId, variant, quizType);
        
        // Check if cache exists and is not expired
        if (!cache) {
          return false;
        }
        
        if (cache.expiresAt && new Date(cache.expiresAt) < new Date()) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking quiz cache for list ${listId}:`, error);
    return false;
  }
}
