import { queryClient } from "@/lib/queryClient";
import { quizService, type QuizSession } from "./QuizService";
import { studentProgressService } from "./StudentProgressService";
import { vocabularyService } from "./VocabularyService";
import type { WordWithProgress, StudySession, Student } from "@shared/schema";

export interface LearningSessionOptions {
  studentId?: string;
  listId?: string;
  words?: WordWithProgress[]; // Optional: pass words directly to avoid re-fetching
  sessionType?: 'study' | 'review' | 'quiz' | 'assessment';
  adaptiveDifficulty?: boolean;
  timeLimit?: number; // in minutes
}

export interface LearningSessionState {
  sessionId: string;
  currentIndex: number;
  words: WordWithProgress[];
  sessionType: 'study' | 'review' | 'quiz' | 'assessment';
  startTime: Date;
  endTime?: Date;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  performance: {
    correctAnswers: number;
    totalAttempts: number;
    averageTime: number;
  };
}

export interface AdaptiveLearningData {
  recommendedWords: WordWithProgress[];
  difficultyLevel: 'easy' | 'medium' | 'hard';
  estimatedTime: number;
  focusAreas: string[];
  skipWords: string[];
}

export interface LearningPath {
  currentLevel: number;
  nextMilestone: string;
  recommendedActivities: Array<{
    type: 'study' | 'review' | 'quiz';
    priority: 'high' | 'medium' | 'low';
    estimatedTime: number;
    description: string;
  }>;
  progressTowardsGoal: number;
}

/**
 * Domain service for learning flow orchestration and session management
 * Handles adaptive learning, session state, progress tracking, and learning path optimization
 */
export class LearningService {
  private activeSessions: Map<string, LearningSessionState> = new Map();
  private sessionCallbacks: Map<string, {
    onProgress?: (progress: number) => void;
    onComplete?: (results: any) => void;
    onError?: (error: string) => void;
  }> = new Map();

  /**
   * Start a new learning session
   */
  async startLearningSession(options: LearningSessionOptions = {}): Promise<LearningSessionState> {
    try {
      // Generate unique session ID
      const sessionId = this.generateSessionId();
      
      // Use provided words or fetch them
      const words = options.words || await this.getWordsForSession(options);
      
      if (words.length === 0) {
        throw new Error("No words available for learning session");
      }

      // Create session state
      const sessionState: LearningSessionState = {
        sessionId,
        currentIndex: 0,
        words,
        sessionType: options.sessionType || 'study',
        startTime: new Date(),
        progress: {
          completed: 0,
          total: words.length,
          percentage: 0
        },
        performance: {
          correctAnswers: 0,
          totalAttempts: 0,
          averageTime: 0
        }
      };

      // Store active session
      this.activeSessions.set(sessionId, sessionState);

      // Start background quiz generation if appropriate
      console.log(`🔍 LEARNING SERVICE DEBUG: words.length=${words.length}, sessionType=${options.sessionType}, listId=${options.listId}`);
      if (words.length === 12 && options.sessionType !== 'quiz') {
        console.log('🎯 Starting background quiz generation with 12 words...');
        this.startBackgroundQuizGeneration(words, options.listId);
      } else {
        console.log(`⚠️ Background quiz generation skipped: ${words.length} words, type=${options.sessionType}`);
      }

      console.log(`🎯 Started ${options.sessionType || 'study'} session with ${words.length} words`);
      return sessionState;
    } catch (error) {
      console.error('Error starting learning session:', error);
      throw new Error(`Failed to start learning session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current learning session state
   */
  getLearningSession(sessionId: string): LearningSessionState | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Update session progress
   */
  updateSessionProgress(
    sessionId: string, 
    updates: Partial<LearningSessionState>
  ): LearningSessionState | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found`);
      return null;
    }

    // Update session state
    const updatedSession = { ...session, ...updates };
    
    // Recalculate progress
    if (updates.currentIndex !== undefined) {
      updatedSession.progress = {
        completed: updates.currentIndex,
        total: session.words.length,
        percentage: Math.round((updates.currentIndex / session.words.length) * 100)
      };
    }

    this.activeSessions.set(sessionId, updatedSession);

    // Trigger progress callback
    const callbacks = this.sessionCallbacks.get(sessionId);
    callbacks?.onProgress?.(updatedSession.progress.percentage);

    return updatedSession;
  }

  /**
   * Complete learning session
   */
  async completeLearningSession(sessionId: string): Promise<{
    sessionData: LearningSessionState;
    results: any;
  }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Mark session as completed
    const completedSession = {
      ...session,
      endTime: new Date(),
      progress: {
        ...session.progress,
        completed: session.words.length,
        percentage: 100
      }
    };

    // Calculate final results
    const results = this.calculateSessionResults(completedSession);

    // Record session data for analytics
    if (session.sessionType !== 'study') {
      await this.recordSessionCompletion(completedSession, results);
    }

    // Clean up active session
    this.activeSessions.delete(sessionId);
    this.sessionCallbacks.delete(sessionId);

    // Trigger completion callback
    const callbacks = this.sessionCallbacks.get(sessionId);
    callbacks?.onComplete?.(results);

    console.log(`✅ Completed ${session.sessionType} session with ${results.score}% score`);
    return { sessionData: completedSession, results };
  }

  /**
   * Get adaptive learning recommendations
   */
  async getAdaptiveLearningData(
    studentId?: string,
    listId?: string
  ): Promise<AdaptiveLearningData> {
    try {
      // Get student progress data if student ID provided
      let progressData = null;
      if (studentId) {
        progressData = await studentProgressService.getStudentProgressSummary(studentId, listId);
      }

      // Get words with progress
      const allWords = await vocabularyService.getWordsWithProgress(listId, studentId);
      
      // Analyze learning patterns and recommend adaptive content
      const recommendedWords = this.selectAdaptiveWords(allWords, progressData);
      const difficultyLevel = this.calculateDifficultyLevel(progressData);
      const focusAreas = this.identifyFocusAreas(progressData);
      const skipWords = this.identifyMasteredWords(allWords, progressData);

      return {
        recommendedWords,
        difficultyLevel,
        estimatedTime: recommendedWords.length * 2, // 2 minutes per word estimate
        focusAreas,
        skipWords
      };
    } catch (error) {
      console.error('Error getting adaptive learning data:', error);
      throw new Error('Failed to generate adaptive learning recommendations');
    }
  }

  /**
   * Get personalized learning path
   */
  async getLearningPath(studentId: string, listId?: string): Promise<LearningPath> {
    try {
      const progressData = await studentProgressService.getStudentProgressSummary(studentId, listId);
      
      // Calculate current level based on mastery
      const currentLevel = Math.floor(progressData.metrics.masteredWords / 3) + 1;
      
      // Determine next milestone
      const nextMilestoneWords = currentLevel * 3;
      const nextMilestone = `Master ${nextMilestoneWords} words`;
      
      // Generate recommended activities
      const recommendedActivities = this.generateRecommendedActivities(progressData);
      
      // Calculate progress towards goal
      const progressTowardsGoal = Math.min(100, 
        Math.round((progressData.metrics.masteredWords / nextMilestoneWords) * 100)
      );

      return {
        currentLevel,
        nextMilestone,
        recommendedActivities,
        progressTowardsGoal
      };
    } catch (error) {
      console.error('Error generating learning path:', error);
      throw new Error('Failed to generate learning path');
    }
  }

  /**
   * Start quiz session with background-generated content
   */
  async startQuizSession(
    words: WordWithProgress[],
    listId?: string,
    studentId?: string
  ): Promise<QuizSession> {
    try {
      // Generate comprehensive quiz
      const quizSession = await quizService.generateComprehensiveQuiz(words, listId);
      
      // Track quiz start for analytics
      if (studentId) {
        await this.recordQuizStart(studentId, listId, words.length);
      }

      return quizSession;
    } catch (error) {
      console.error('Error starting quiz session:', error);
      throw new Error(`Failed to start quiz session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register session callbacks for real-time updates
   */
  registerSessionCallbacks(
    sessionId: string,
    callbacks: {
      onProgress?: (progress: number) => void;
      onComplete?: (results: any) => void;
      onError?: (error: string) => void;
    }
  ): void {
    this.sessionCallbacks.set(sessionId, callbacks);
  }

  /**
   * Get session statistics across all active sessions
   */
  getSessionStatistics(): {
    activeSessions: number;
    sessionTypes: Record<string, number>;
    averageProgress: number;
    totalWordsStudied: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const sessionTypes: Record<string, number> = {};
    let totalProgress = 0;
    let totalWords = 0;

    sessions.forEach(session => {
      sessionTypes[session.sessionType] = (sessionTypes[session.sessionType] || 0) + 1;
      totalProgress += session.progress.percentage;
      totalWords += session.words.length;
    });

    return {
      activeSessions: sessions.length,
      sessionTypes,
      averageProgress: sessions.length > 0 ? totalProgress / sessions.length : 0,
      totalWordsStudied: totalWords
    };
  }

  /**
   * Private: Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Private: Get words appropriate for the session type
   */
  private async getWordsForSession(options: LearningSessionOptions): Promise<WordWithProgress[]> {
    if (options.sessionType === 'review' && options.studentId) {
      // Get words due for review
      return await studentProgressService.getWordsForReview(options.studentId, options.listId);
    }

    // Get all words with progress
    return await vocabularyService.getWordsWithProgress(options.listId, options.studentId);
  }

  /**
   * Private: Start background quiz generation for faster access
   */
  private async startBackgroundQuizGeneration(words: WordWithProgress[], listId?: string): Promise<void> {
    try {
      await quizService.generateQuizVariantsInBackground(words, listId);
    } catch (error) {
      console.log('Background quiz generation failed:', error);
      // Don't throw - this is a background optimization
    }
  }

  /**
   * Private: Calculate session results
   */
  private calculateSessionResults(session: LearningSessionState): any {
    const timeSpent = session.endTime && session.startTime ? 
      Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000) : 0;

    const score = session.performance.totalAttempts > 0 ? 
      Math.round((session.performance.correctAnswers / session.performance.totalAttempts) * 100) : 0;

    return {
      sessionType: session.sessionType,
      wordsStudied: session.words.length,
      timeSpent,
      score,
      attempts: session.performance.totalAttempts,
      averageTimePerWord: session.performance.averageTime
    };
  }

  /**
   * Private: Select adaptive words based on student progress
   */
  private selectAdaptiveWords(
    allWords: WordWithProgress[],
    progressData: any
  ): WordWithProgress[] {
    if (!progressData) {
      return allWords.slice(0, 12); // Default selection
    }

    // Prioritize words that need attention
    const needsAttention = allWords.filter(word => {
      const attempts = word.attempts || [];
      if (attempts.length === 0) return true; // New words
      const successRate = attempts.filter(a => a.success).length / attempts.length;
      return successRate < 0.7;
    });

    // Mix in some mastered words for review
    const mastered = allWords.filter(word => {
      const attempts = word.attempts || [];
      const successRate = attempts.length > 0 ? 
        attempts.filter(a => a.success).length / attempts.length : 0;
      return successRate >= 0.8;
    });

    // Combine: 70% needs attention, 30% review
    const selected = [
      ...needsAttention.slice(0, 8),
      ...mastered.slice(0, 4)
    ];

    return selected.slice(0, 12);
  }

  /**
   * Private: Calculate appropriate difficulty level
   */
  private calculateDifficultyLevel(progressData: any): 'easy' | 'medium' | 'hard' {
    if (!progressData) return 'medium';
    
    const { averageSuccessRate, masteredWords, totalWords } = progressData.metrics;
    const masteryPercentage = totalWords > 0 ? masteredWords / totalWords : 0;

    if (averageSuccessRate >= 0.8 && masteryPercentage >= 0.6) return 'hard';
    if (averageSuccessRate >= 0.6 && masteryPercentage >= 0.3) return 'medium';
    return 'easy';
  }

  /**
   * Private: Identify focus areas for learning
   */
  private identifyFocusAreas(progressData: any): string[] {
    if (!progressData) return ['vocabulary', 'comprehension'];
    
    const focusAreas: string[] = [];
    
    if (progressData.analytics.weaknessAreas.length > 0) {
      focusAreas.push(...progressData.analytics.weaknessAreas);
    }
    
    if (progressData.metrics.strugglingWords > 3) {
      focusAreas.push('word_recognition');
    }
    
    if (progressData.analytics.improvementTrend === 'declining') {
      focusAreas.push('review_and_practice');
    }
    
    return focusAreas.length > 0 ? focusAreas : ['general_practice'];
  }

  /**
   * Private: Identify words that can be skipped (already mastered)
   */
  private identifyMasteredWords(
    allWords: WordWithProgress[],
    progressData: any
  ): string[] {
    if (!progressData) return [];
    
    return allWords
      .filter(word => {
        const attempts = word.attempts || [];
        if (attempts.length < 3) return false; // Need minimum attempts
        const successRate = attempts.filter(a => a.success).length / attempts.length;
        return successRate >= 0.9; // 90% success rate
      })
      .map(word => word.text);
  }

  /**
   * Private: Generate recommended activities based on progress
   */
  private generateRecommendedActivities(progressData: any): Array<{
    type: 'study' | 'review' | 'quiz';
    priority: 'high' | 'medium' | 'low';
    estimatedTime: number;
    description: string;
  }> {
    const activities = [];

    // High priority: Address struggling words
    if (progressData.metrics.strugglingWords > 0) {
      activities.push({
        type: 'study' as const,
        priority: 'high' as const,
        estimatedTime: progressData.metrics.strugglingWords * 3,
        description: `Focus on ${progressData.metrics.strugglingWords} challenging words`
      });
    }

    // Medium priority: Regular practice
    if (progressData.metrics.totalWords > progressData.metrics.masteredWords) {
      activities.push({
        type: 'review' as const,
        priority: 'medium' as const,
        estimatedTime: 15,
        description: 'Review previously studied words'
      });
    }

    // Low priority: Assessment
    if (progressData.metrics.masteredWords >= 6) {
      activities.push({
        type: 'quiz' as const,
        priority: 'low' as const,
        estimatedTime: 10,
        description: 'Take a quiz to test your knowledge'
      });
    }

    return activities;
  }

  /**
   * Private: Record session completion for analytics
   */
  private async recordSessionCompletion(
    session: LearningSessionState,
    results: any
  ): Promise<void> {
    try {
      await fetch('/api/learning-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          sessionType: session.sessionType,
          results,
          duration: results.timeSpent
        })
      });
    } catch (error) {
      console.error('Failed to record session completion:', error);
      // Don't throw - this is for analytics only
    }
  }

  /**
   * Private: Record quiz start for analytics
   */
  private async recordQuizStart(
    studentId: string,
    listId?: string,
    wordCount?: number
  ): Promise<void> {
    try {
      await fetch('/api/quiz-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          listId,
          wordCount,
          startTime: new Date()
        })
      });
    } catch (error) {
      console.error('Failed to record quiz start:', error);
      // Don't throw - this is for analytics only
    }
  }
}

// Export singleton instance
export const learningService = new LearningService();