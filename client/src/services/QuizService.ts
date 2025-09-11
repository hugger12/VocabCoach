import type { 
  ClozeQuestion, 
  PassageQuestion, 
  PassageBlank, 
  WordWithProgress 
} from "@shared/schema";

export interface ClozeQuizQuestion extends ClozeQuestion {
  choices: string[];
  questionType: 'cloze';
  questionNumber: number;
}

export interface PassageQuizQuestion {
  questionType: 'passage';
  passage: PassageQuestion;
  blanks: (PassageBlank & { choices: string[]; questionNumber: number })[];
}

export type QuizQuestion = ClozeQuizQuestion | PassageQuizQuestion;

export interface QuizAttempt {
  questionId: string;
  questionNumber: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface QuizGenerationOptions {
  useCache?: boolean;
  forceRegenerate?: boolean;
  variant?: number;
}

export interface QuizSession {
  clozeQuestions: ClozeQuizQuestion[];
  passageQuestion: PassageQuizQuestion | null;
  words: WordWithProgress[];
  listId?: string;
  generatedAt: number;
  variant?: number;
}

export interface QuizValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface QuizScore {
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  score: number; // percentage
  timeSpent?: number;
  attempts: QuizAttempt[];
}

/**
 * Domain service for quiz-related business logic
 * Handles quiz generation, validation, scoring, and question creation
 */
export class QuizService {
  private readonly CACHE_KEY_PREFIX = 'preGeneratedQuiz_';
  private readonly CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_VARIANTS = 3;

  /**
   * Generate a comprehensive quiz with both cloze and passage questions
   */
  async generateComprehensiveQuiz(
    words: WordWithProgress[],
    listId?: string,
    options: QuizGenerationOptions = {}
  ): Promise<QuizSession> {
    // Validate input
    const validation = this.validateQuizInput(words, listId);
    if (!validation.isValid) {
      throw new Error(`Quiz validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for cached quiz if enabled
    if (options.useCache !== false && !options.forceRegenerate) {
      const cachedQuiz = this.getCachedQuiz(words);
      if (cachedQuiz) {
        console.log("🚀 Using cached quiz for instant loading!");
        return cachedQuiz;
      }
    }

    // Generate new quiz
    console.log("🎯 Generating fresh comprehensive quiz...");
    return await this.generateFreshQuiz(words, listId);
  }

  /**
   * Generate quiz variants in background for future use
   */
  async generateQuizVariantsInBackground(
    words: WordWithProgress[],
    listId?: string
  ): Promise<void> {
    try {
      console.log("🎯 Starting background quiz generation with", words.length, "words...");
      console.log("📚 Generating 3 quiz variants for the week...");
      
      if (words.length !== 12) {
        console.log("⚠️ Background quiz generation skipped: need exactly 12 words, got", words.length);
        return;
      }

      const wordIds = words.map(w => w.id).sort().join(',');
      const currentListId = listId || (words.length > 0 ? words[0].listId : null);
      
      if (!currentListId) {
        console.log("⚠️ Background quiz generation skipped: no list ID found");
        return;
      }

      // Check existing variants
      const existingVariants = this.getExistingVariantCount(wordIds);
      
      if (existingVariants >= this.MAX_VARIANTS) {
        console.log("✅ 3 quiz variants already cached, skipping generation");
        return;
      }

      console.log(`📝 Found ${existingVariants}/${this.MAX_VARIANTS} variants, generating ${this.MAX_VARIANTS - existingVariants} more...`);

      // Generate missing variants
      for (let variant = existingVariants + 1; variant <= this.MAX_VARIANTS; variant++) {
        try {
          console.log(`🔄 Generating variant ${variant}/${this.MAX_VARIANTS}...`);
          
          // Create unique shuffle for each variant
          const shuffledWords = this.shuffleWords([...words]);
          const clozeWords = shuffledWords.slice(0, 6);
          const passageWords = shuffledWords.slice(6, 12);

          // Generate both question types in parallel
          const [clozeData, passageData] = await Promise.all([
            this.generateClozeQuestions(clozeWords),
            this.generatePassageQuestions(passageWords, currentListId)
          ]);

          if (clozeData && passageData) {
            this.cacheQuizVariant(wordIds, {
              clozeData,
              passageData,
              words: shuffledWords,
              listId: currentListId,
              generatedAt: Date.now(),
              variant,
              ready: true
            });
            console.log(`✅ Variant ${variant}/${this.MAX_VARIANTS} generated and cached!`);
          } else {
            console.log(`⚠️ Variant ${variant} generation failed: incomplete data`);
          }
        } catch (variantError) {
          console.log(`⚠️ Error generating variant ${variant}:`, variantError);
        }
      }

      console.log("🎉 Multi-variant quiz generation complete!");
      
      // Clean up old expired caches
      this.cleanupExpiredCaches(wordIds);
      
    } catch (error) {
      console.log("⚠️ Multi-variant quiz generation failed:", error);
    }
  }

  /**
   * Validate quiz input data
   */
  validateQuizInput(words: WordWithProgress[], listId?: string): QuizValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate words array
    if (!words || !Array.isArray(words)) {
      errors.push("Words array is required");
    } else if (words.length === 0) {
      errors.push("At least one word is required for quiz generation");
    } else if (words.length !== 12) {
      errors.push(`Quiz requires exactly 12 words, but got ${words.length}`);
    }

    // Validate word structure
    if (words) {
      words.forEach((word, index) => {
        if (!word.id) {
          errors.push(`Word ${index + 1} is missing ID`);
        }
        if (!word.text || !word.text.trim()) {
          errors.push(`Word ${index + 1} is missing text`);
        }
        if (!word.kidDefinition || !word.kidDefinition.trim()) {
          errors.push(`Word ${index + 1} is missing kid definition`);
        }
        if (!word.partOfSpeech) {
          warnings.push(`Word ${index + 1} is missing part of speech`);
        }
      });
    }

    // Check for duplicates
    if (words && words.length > 0) {
      const wordTexts = words.map(w => w.text?.toLowerCase()).filter(Boolean);
      const duplicates = wordTexts.filter((text, index) => wordTexts.indexOf(text) !== index);
      if (duplicates.length > 0) {
        warnings.push(`Duplicate words found: ${[...new Set(duplicates)].join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Calculate quiz score from attempts
   */
  calculateQuizScore(attempts: QuizAttempt[], timeSpent?: number): QuizScore {
    const totalQuestions = attempts.length;
    const correctAnswers = attempts.filter(attempt => attempt.isCorrect).length;
    const incorrectAnswers = totalQuestions - correctAnswers;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    return {
      totalQuestions,
      correctAnswers,
      incorrectAnswers,
      score,
      timeSpent,
      attempts
    };
  }

  /**
   * Process quiz data consistently between cached and fresh generation
   */
  processQuizData(clozeData: any, passageData: any): {
    clozeQuestions: ClozeQuizQuestion[];
    passageQuestion: PassageQuizQuestion | null;
  } {
    // Process cloze questions with proper choice construction
    const clozeQuestions: ClozeQuizQuestion[] = clozeData.questions.map((q: any, index: number) => ({
      ...q,
      questionType: 'cloze' as const,
      questionNumber: index + 1,
      // Build choices from correctAnswer + distractors, then shuffle
      choices: [q.correctAnswer, ...(q.distractors || [])].sort(() => Math.random() - 0.5)
    }));

    // Process passage question with proper data structure
    const passageQuestion: PassageQuizQuestion | null = passageData.blanks ? {
      questionType: 'passage' as const,
      passage: passageData.passage || passageData, // Handle both data shapes
      blanks: passageData.blanks
        .sort((a: any, b: any) => (a.blankNumber || 0) - (b.blankNumber || 0)) // Ensure proper ordering
        .map((blank: any) => ({
          ...blank,
          choices: [blank.correctAnswer, ...(blank.distractors || [])].sort(() => Math.random() - 0.5),
          questionNumber: blank.blankNumber || 7
        }))
    } : null;

    return { clozeQuestions, passageQuestion };
  }

  /**
   * Validate cached quiz data for correctness
   */
  validateCachedQuiz(cachedQuiz: any, expectedWords: WordWithProgress[]): boolean {
    if (!cachedQuiz || !cachedQuiz.ready) {
      return false;
    }

    const { clozeData, passageData, words: shuffledWords } = cachedQuiz;
    
    // Check basic structure
    if (!clozeData?.questions || !passageData?.blanks || !shuffledWords) {
      console.warn("⚠️ Cached quiz missing required data structure");
      return false;
    }

    // Validate word uniqueness
    const cachedClozeAnswers = clozeData.questions?.map((q: any) => q.correctAnswer) || [];
    const cachedPassageAnswers = passageData.blanks?.map((b: any) => b.correctAnswer) || [];
    const cachedAllAnswers = [...cachedClozeAnswers, ...cachedPassageAnswers];
    const cachedExpectedWords = shuffledWords.map((w: any) => w.text);
    
    console.log("🔍 Validating cached quiz for word uniqueness...");
    
    // Check for exact match between expected and actual words in cache
    const cachedAnswerSet = new Set(cachedAllAnswers);
    const cachedExpectedSet = new Set(cachedExpectedWords);
    
    if (cachedAllAnswers.length !== 12 || cachedAnswerSet.size !== 12 || 
        !Array.from(cachedAnswerSet).every(word => cachedExpectedSet.has(word))) {
      console.warn("⚠️ Cached quiz failed validation - contains duplicates or missing words!");
      console.warn("Expected words:", cachedExpectedWords);
      console.warn("Cached answers:", cachedAllAnswers);
      return false;
    }

    console.log("✅ Cached quiz validation passed: All 12 words used exactly once");
    return true;
  }

  /**
   * Get cached quiz if available and valid
   */
  private getCachedQuiz(words: WordWithProgress[]): QuizSession | null {
    try {
      const wordIds = words.map(w => w.id).sort().join(',');
      
      // Look for available variants (1, 2, 3)
      for (let variant = 1; variant <= this.MAX_VARIANTS; variant++) {
        const cacheKey = `${this.CACHE_KEY_PREFIX}${wordIds}_variant_${variant}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
          const preGenerated = JSON.parse(cached);
          
          // Check if cache is still valid
          if (Date.now() - preGenerated.generatedAt < this.CACHE_MAX_AGE && 
              this.validateCachedQuiz(preGenerated, words)) {
            
            console.log(`🎯 Using variant ${variant} - consuming cache entry`);
            
            // Remove this variant so next quiz uses a different one
            localStorage.removeItem(cacheKey);
            
            // Process the cached data
            const { clozeData, passageData, words: shuffledWords } = preGenerated;
            const processedData = this.processQuizData(clozeData, passageData);
            
            return {
              clozeQuestions: processedData.clozeQuestions,
              passageQuestion: processedData.passageQuestion,
              words: shuffledWords,
              listId: preGenerated.listId,
              generatedAt: preGenerated.generatedAt,
              variant
            };
          } else {
            // Clean up invalid/expired cache
            localStorage.removeItem(cacheKey);
            console.log(`Cleaned up invalid variant ${variant}`);
          }
        }
      }
      
      return null;
    } catch (error) {
      console.log("Error checking for cached quiz:", error);
      return null;
    }
  }

  /**
   * Generate fresh quiz data
   */
  private async generateFreshQuiz(words: WordWithProgress[], listId?: string): Promise<QuizSession> {
    const currentListId = listId || (words.length > 0 ? words[0].listId : null);
    
    if (!currentListId) {
      throw new Error("Unable to determine vocabulary list for quiz generation");
    }

    // Shuffle words for quiz generation
    const shuffledWords = this.shuffleWords([...words]);
    const clozeWords = shuffledWords.slice(0, 6);
    const passageWords = shuffledWords.slice(6, 12);

    // Generate both question types in parallel
    const [clozeData, passageData] = await Promise.all([
      this.generateClozeQuestions(clozeWords),
      this.generatePassageQuestions(passageWords, currentListId)
    ]);

    // Process the generated data
    const processedData = this.processQuizData(clozeData, passageData);

    return {
      clozeQuestions: processedData.clozeQuestions,
      passageQuestion: processedData.passageQuestion,
      words: shuffledWords,
      listId: currentListId,
      generatedAt: Date.now()
    };
  }

  /**
   * Generate cloze questions via API
   */
  private async generateClozeQuestions(words: WordWithProgress[]): Promise<any> {
    const response = await fetch("/api/quiz/cloze/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        words: words.map(word => ({
          id: word.id,
          text: word.text,
          partOfSpeech: word.partOfSpeech,
          kidDefinition: word.kidDefinition,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate cloze questions: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate passage questions via API
   */
  private async generatePassageQuestions(words: WordWithProgress[], listId: string): Promise<any> {
    const response = await fetch("/api/quiz/passage/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        words: words.map(word => ({
          id: word.id,
          text: word.text,
          partOfSpeech: word.partOfSpeech,
          kidDefinition: word.kidDefinition,
        })),
        listId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate passage questions: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleWords<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Cache quiz variant in localStorage
   */
  private cacheQuizVariant(wordIds: string, quizData: any): void {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${wordIds}_variant_${quizData.variant}`;
      localStorage.setItem(cacheKey, JSON.stringify(quizData));
    } catch (error) {
      console.log("Failed to cache quiz variant:", error);
    }
  }

  /**
   * Get count of existing cached variants
   */
  private getExistingVariantCount(wordIds: string): number {
    let count = 0;
    for (let variant = 1; variant <= this.MAX_VARIANTS; variant++) {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${wordIds}_variant_${variant}`;
      if (localStorage.getItem(cacheKey)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCaches(currentWordIds: string): void {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.CACHE_KEY_PREFIX) && !key.includes(`_${currentWordIds}_`)) {
          try {
            const oldCache = JSON.parse(localStorage.getItem(key) || '{}');
            if (Date.now() - oldCache.generatedAt > this.CACHE_MAX_AGE) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.log("Error during cache cleanup:", error);
    }
  }
}

// Export singleton instance
export const quizService = new QuizService();