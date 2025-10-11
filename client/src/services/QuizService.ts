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
   * Load cached quiz from backend API for instant loading
   */
  async loadCachedQuiz(
    listId: string,
    variant: number = 0,
    quizType: 'cloze' | 'passage' | 'mixed' = 'mixed'
  ): Promise<QuizSession | null> {
    try {
      console.log(`🔍 Loading cached quiz - listId: ${listId}, variant: ${variant}, quizType: ${quizType}`);
      
      const response = await fetch(
        `/api/quiz/cached/${listId}?variant=${variant}&quizType=${quizType}`,
        {
          credentials: 'include'
        }
      );

      if (!response.ok) {
        console.warn(`⚠️ Cached quiz API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      // Log cache hit/miss
      if (data.cacheHit) {
        console.log(`✅ CACHE HIT: Quiz loaded in <1s - quizId: ${data.quizId}`);
      } else {
        console.log(`⚠️ CACHE MISS: Backend generated fresh quiz - quizId: ${data.quizId}`);
      }

      // Process cached quiz data into QuizSession format
      return this.processCachedQuizResponse(data);
    } catch (error) {
      console.error("Error loading cached quiz:", error);
      return null;
    }
  }

  /**
   * Process cached quiz API response into QuizSession format
   * Returns null if validation fails, triggering fallback to fresh generation
   */
  private processCachedQuizResponse(data: any): QuizSession | null {
    // The cached API returns all questions in a flat array
    // We need to separate them into cloze and passage questions
    const allQuestions = data.questions || [];
    
    // Separate questions by type (detect by structure since questionType is not included)
    const clozeQuestions: ClozeQuizQuestion[] = [];
    const passageBlanks: any[] = [];
    let passageData: any = null;
    
    let questionNumber = 1;

    allQuestions.forEach((q: any) => {
      // Detect cloze questions by presence of sentence1/sentence2
      if (q.sentence1 && q.sentence2) {
        clozeQuestions.push({
          id: q.id || q.wordId,
          wordId: q.wordId,
          sentence1: q.sentence1,
          sentence2: q.sentence2,
          correctAnswer: q.correctAnswer,
          distractors: [], // Not provided by cached API, choices are pre-shuffled
          createdAt: new Date(),
          choices: q.choices || [],
          questionType: 'cloze' as const,
          questionNumber: questionNumber++
        });
      } 
      // Detect passage questions by presence of passage and blanks
      else if (q.passage && q.blanks) {
        // Store passage data
        passageData = q.passage;
        
        // Process each blank as a separate question
        q.blanks.forEach((blank: any) => {
          passageBlanks.push({
            id: blank.wordId || `blank-${blank.blankNumber}`,
            blankNumber: blank.blankNumber,
            wordId: blank.wordId,
            correctAnswer: blank.correctAnswer,
            choices: blank.choices || [],
            questionNumber: questionNumber++
          });
        });
      }
    });

    // Build passage question if we have blanks
    const passageQuestion: PassageQuizQuestion | null = passageBlanks.length > 0 && passageData ? {
      questionType: 'passage' as const,
      passage: passageData,
      blanks: passageBlanks.sort((a, b) => (a.blankNumber || 0) - (b.blankNumber || 0))
    } : null;

    // CRITICAL VALIDATION: Ensure quiz data is complete before returning
    const validationErrors: string[] = [];
    
    // Validate cloze questions (minimum 6 required)
    if (clozeQuestions.length < 6) {
      validationErrors.push(`Insufficient cloze questions: got ${clozeQuestions.length}, need at least 6`);
    }
    
    // Validate passage question exists
    if (!passageQuestion) {
      validationErrors.push('Missing passage question');
    } else if (!passageQuestion.blanks || passageQuestion.blanks.length === 0) {
      validationErrors.push('Passage question has no blanks');
    }
    
    // Validate total question count (should be 12: 6 cloze + 6 passage blanks)
    const totalQuestions = clozeQuestions.length + (passageQuestion?.blanks.length || 0);
    if (totalQuestions !== 12) {
      validationErrors.push(`Incorrect total question count: got ${totalQuestions}, expected 12`);
    }
    
    // Extract words from question data for validation
    const clozeWords = clozeQuestions.map(q => q.correctAnswer);
    const passageWords = passageQuestion?.blanks.map(b => b.correctAnswer) || [];
    const allWords = [...clozeWords, ...passageWords];
    
    // Validate words array is not empty
    if (allWords.length === 0) {
      validationErrors.push('No words found in quiz data');
    } else if (allWords.length !== 12) {
      validationErrors.push(`Incorrect word count: got ${allWords.length}, expected 12`);
    }
    
    // Check for duplicate words (all 12 should be unique)
    const uniqueWords = new Set(allWords);
    if (uniqueWords.size !== allWords.length) {
      validationErrors.push(`Duplicate words found: ${allWords.length} total, ${uniqueWords.size} unique`);
    }
    
    // If validation fails, log errors and return null to trigger fresh generation
    if (validationErrors.length > 0) {
      console.error('❌ Cached quiz validation FAILED:', {
        errors: validationErrors,
        clozeCount: clozeQuestions.length,
        passageExists: !!passageQuestion,
        passageBlanksCount: passageQuestion?.blanks.length || 0,
        totalQuestions,
        wordCount: allWords.length,
        uniqueWordCount: uniqueWords.size,
        listId: data.listId,
        variant: data.variant
      });
      return null; // Triggers fallback to fresh generation
    }
    
    // Validation passed - log success
    console.log('✅ Cached quiz validation PASSED:', {
      clozeQuestions: clozeQuestions.length,
      passageBlanks: passageQuestion?.blanks.length || 0,
      totalQuestions,
      uniqueWords: uniqueWords.size,
      listId: data.listId,
      variant: data.variant
    });

    // Note: words array is empty since backend doesn't return full word objects
    // The words parameter is still passed to generateComprehensiveQuiz for validation
    const words: WordWithProgress[] = [];

    return {
      clozeQuestions,
      passageQuestion,
      words,
      listId: data.listId,
      generatedAt: new Date(data.generatedAt).getTime(),
      variant: data.variant
    };
  }

  /**
   * Generate a comprehensive quiz with both cloze and passage questions
   * Now uses cached quiz API first for instant loading
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

    const currentListId = listId || (words.length > 0 ? words[0].listId : null);
    if (!currentListId) {
      throw new Error("Unable to determine vocabulary list for quiz generation");
    }

    // Try cached quiz API first (unless force regenerate is requested)
    if (!options.forceRegenerate) {
      const variant = options.variant !== undefined ? options.variant : 0;
      const quizType = 'mixed'; // Default to mixed quiz type
      
      const cachedQuiz = await this.loadCachedQuiz(currentListId, variant, quizType);
      if (cachedQuiz) {
        console.log("🚀 Using cached quiz from backend for instant loading!");
        return cachedQuiz;
      }
    }

    // Fallback: Check localStorage cache if enabled
    if (options.useCache !== false && !options.forceRegenerate) {
      const localCachedQuiz = this.getCachedQuiz(words);
      if (localCachedQuiz) {
        console.log("🚀 Using localStorage cached quiz for instant loading!");
        return localCachedQuiz;
      }
    }

    // Final fallback: Generate fresh quiz
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
        warnings.push(`Duplicate words found: ${Array.from(new Set(duplicates)).join(', ')}`);
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
      // Use choices array already provided by server (pre-shuffled)
      choices: q.choices || []
    }));

    // Process passage question with proper data structure
    const passageQuestion: PassageQuizQuestion | null = passageData.blanks ? {
      questionType: 'passage' as const,
      passage: passageData.passage || passageData, // Handle both data shapes
      blanks: passageData.blanks
        .sort((a: any, b: any) => (a.blankNumber || 0) - (b.blankNumber || 0)) // Ensure proper ordering
        .map((blank: any) => ({
          ...blank,
          // Use choices array already provided by server (pre-shuffled)
          choices: blank.choices || [],
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
      credentials: 'include', // Include session cookies for authentication
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
      credentials: 'include', // Include session cookies for authentication
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