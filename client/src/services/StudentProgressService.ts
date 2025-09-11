import type { 
  Student, 
  Attempt, 
  Schedule, 
  QuizAttempt,
  InsertAttempt,
  InsertSchedule,
  InsertQuizAttempt,
  WordWithProgress 
} from "@shared/schema";

export interface ProgressMetrics {
  totalWords: number;
  masteredWords: number;
  strugglingWords: number;
  averageSuccessRate: number;
  totalAttempts: number;
  streakLength: number;
  lastActivityDate?: Date;
}

export interface LearningAnalytics {
  strengthAreas: string[];
  weaknessAreas: string[];
  recommendedWords: string[];
  timeSpentLearning: number;
  improvementTrend: 'improving' | 'stable' | 'declining';
  nextReviewDue?: Date;
}

export interface SpacedRepetitionData {
  wordId: string;
  currentBox: number;
  nextReviewDate: Date;
  reviewCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  lastAttemptSuccess: boolean;
}

export interface AchievementData {
  type: 'streak' | 'mastery' | 'improvement' | 'consistency';
  title: string;
  description: string;
  earnedDate: Date;
  progress?: number;
  target?: number;
}

export interface StudentProgressSummary {
  studentId: string;
  metrics: ProgressMetrics;
  analytics: LearningAnalytics;
  recentAttempts: Attempt[];
  upcomingReviews: SpacedRepetitionData[];
  achievements: AchievementData[];
}

export interface LearningSessionData {
  sessionId: string;
  studentId: string;
  startTime: Date;
  endTime?: Date;
  wordsStudied: string[];
  attemptsCompleted: number;
  successRate: number;
  timeSpent: number;
}

/**
 * Domain service for student progress tracking and learning analytics
 * Handles spaced repetition, progress metrics, achievements, and learning insights
 */
export class StudentProgressService {

  /**
   * Get comprehensive progress summary for a student
   */
  async getStudentProgressSummary(studentId: string, listId?: string): Promise<StudentProgressSummary> {
    try {
      const params = new URLSearchParams({ studentId });
      if (listId) params.append('listId', listId);

      const response = await fetch(`/api/students/${studentId}/progress?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch progress: ${response.status}`);
      }

      const progressData = await response.json();

      // Process and enrich the data
      const metrics = this.calculateProgressMetrics(progressData.attempts, progressData.words);
      const analytics = this.analyzeLearningPatterns(progressData.attempts, progressData.words);
      const upcomingReviews = this.getUpcomingReviews(progressData.schedules);
      const achievements = this.calculateAchievements(progressData.attempts, metrics);

      return {
        studentId,
        metrics,
        analytics,
        recentAttempts: progressData.attempts?.slice(0, 10) || [],
        upcomingReviews,
        achievements
      };
    } catch (error) {
      console.error('Error fetching student progress:', error);
      throw new Error('Failed to fetch student progress data');
    }
  }

  /**
   * Record a learning attempt for a student
   */
  async recordAttempt(attempt: Omit<InsertAttempt, 'timestamp'>): Promise<Attempt> {
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt)
      });

      if (!response.ok) {
        throw new Error(`Failed to record attempt: ${response.status}`);
      }

      const recordedAttempt = await response.json();

      // Update spaced repetition schedule based on attempt result
      if (attempt.studentId && attempt.wordId) {
        await this.updateSpacedRepetition(attempt.studentId, attempt.wordId, attempt.success || false);
      }

      return recordedAttempt;
    } catch (error) {
      console.error('Error recording attempt:', error);
      throw new Error('Failed to record learning attempt');
    }
  }

  /**
   * Record quiz attempt results
   */
  async recordQuizAttempt(quizAttempt: Omit<InsertQuizAttempt, 'attemptedAt'>): Promise<QuizAttempt> {
    try {
      const response = await fetch('/api/quiz-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quizAttempt)
      });

      if (!response.ok) {
        throw new Error(`Failed to record quiz attempt: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error recording quiz attempt:', error);
      throw new Error('Failed to record quiz attempt');
    }
  }

  /**
   * Update spaced repetition schedule based on learning performance
   */
  async updateSpacedRepetition(studentId: string, wordId: string, success: boolean): Promise<Schedule> {
    try {
      // Get current schedule
      const currentSchedule = await this.getWordSchedule(studentId, wordId);
      
      // Calculate new schedule based on spaced repetition algorithm
      const newScheduleData = this.calculateNextReview(currentSchedule, success);

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          wordId,
          ...newScheduleData
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update schedule: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating spaced repetition:', error);
      throw new Error('Failed to update learning schedule');
    }
  }

  /**
   * Get words due for review for a student
   */
  async getWordsForReview(studentId: string, listId?: string): Promise<WordWithProgress[]> {
    try {
      const params = new URLSearchParams({ studentId });
      if (listId) params.append('listId', listId);

      const response = await fetch(`/api/students/${studentId}/review?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch review words: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching review words:', error);
      throw new Error('Failed to fetch words for review');
    }
  }

  /**
   * Get learning analytics for multiple students (instructor view)
   */
  async getClassAnalytics(instructorId: string, listId?: string): Promise<{
    classMetrics: ProgressMetrics;
    studentSummaries: Array<{
      student: Student;
      metrics: ProgressMetrics;
      lastActivity?: Date;
    }>;
    topPerformers: Student[];
    needsAttention: Student[];
  }> {
    try {
      const params = new URLSearchParams({ instructorId });
      if (listId) params.append('listId', listId);

      const response = await fetch(`/api/instructors/${instructorId}/analytics?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch class analytics: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching class analytics:', error);
      throw new Error('Failed to fetch class analytics');
    }
  }

  /**
   * Calculate comprehensive progress metrics
   */
  private calculateProgressMetrics(attempts: Attempt[], words: WordWithProgress[]): ProgressMetrics {
    const totalWords = words.length;
    const wordStats = new Map<string, { total: number; success: number }>();

    // Calculate success rates per word
    attempts.forEach(attempt => {
      const stats = wordStats.get(attempt.wordId) || { total: 0, success: 0 };
      stats.total++;
      if (attempt.success) stats.success++;
      wordStats.set(attempt.wordId, stats);
    });

    // Determine mastery status (80% success rate or higher)
    let masteredWords = 0;
    let strugglingWords = 0;
    let totalSuccessRate = 0;
    let wordsWithAttempts = 0;

    wordStats.forEach((stats, wordId) => {
      const successRate = stats.success / stats.total;
      totalSuccessRate += successRate;
      wordsWithAttempts++;

      if (successRate >= 0.8) {
        masteredWords++;
      } else if (successRate < 0.5) {
        strugglingWords++;
      }
    });

    // Calculate streak (consecutive successful attempts)
    const recentAttempts = attempts.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    let streakLength = 0;
    for (const attempt of recentAttempts) {
      if (attempt.success) {
        streakLength++;
      } else {
        break;
      }
    }

    const averageSuccessRate = wordsWithAttempts > 0 ? totalSuccessRate / wordsWithAttempts : 0;
    const lastActivityDate = recentAttempts.length > 0 ? 
      new Date(recentAttempts[0].timestamp) : undefined;

    return {
      totalWords,
      masteredWords,
      strugglingWords,
      averageSuccessRate: Math.round(averageSuccessRate * 100) / 100,
      totalAttempts: attempts.length,
      streakLength,
      lastActivityDate
    };
  }

  /**
   * Analyze learning patterns for insights and recommendations
   */
  private analyzeLearningPatterns(attempts: Attempt[], words: WordWithProgress[]): LearningAnalytics {
    const partOfSpeechPerformance = new Map<string, { total: number; success: number }>();
    const timeBasedPerformance: Array<{ date: Date; success: boolean }> = [];

    // Analyze performance by part of speech
    attempts.forEach(attempt => {
      const word = words.find(w => w.id === attempt.wordId);
      if (word?.partOfSpeech) {
        const stats = partOfSpeechPerformance.get(word.partOfSpeech) || { total: 0, success: 0 };
        stats.total++;
        if (attempt.success) stats.success++;
        partOfSpeechPerformance.set(word.partOfSpeech, stats);
      }

      timeBasedPerformance.push({
        date: new Date(attempt.timestamp),
        success: attempt.success || false
      });
    });

    // Identify strengths and weaknesses
    const strengthAreas: string[] = [];
    const weaknessAreas: string[] = [];

    partOfSpeechPerformance.forEach((stats, partOfSpeech) => {
      const successRate = stats.success / stats.total;
      if (successRate >= 0.8) {
        strengthAreas.push(partOfSpeech);
      } else if (successRate < 0.5) {
        weaknessAreas.push(partOfSpeech);
      }
    });

    // Determine improvement trend
    const recentPerformance = timeBasedPerformance
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10);
    
    const recentSuccessRate = recentPerformance.length > 0 ? 
      recentPerformance.filter(p => p.success).length / recentPerformance.length : 0;
    
    const olderPerformance = timeBasedPerformance
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(10, 20);
    
    const olderSuccessRate = olderPerformance.length > 0 ? 
      olderPerformance.filter(p => p.success).length / olderPerformance.length : 0;
    
    let improvementTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentSuccessRate > olderSuccessRate + 0.1) {
      improvementTrend = 'improving';
    } else if (recentSuccessRate < olderSuccessRate - 0.1) {
      improvementTrend = 'declining';
    }

    // Recommend words that need attention
    const recommendedWords = words
      .filter(word => {
        const wordAttempts = attempts.filter(a => a.wordId === word.id);
        if (wordAttempts.length === 0) return true; // New words
        const successRate = wordAttempts.filter(a => a.success).length / wordAttempts.length;
        return successRate < 0.7; // Words with low success rate
      })
      .slice(0, 5)
      .map(word => word.text);

    return {
      strengthAreas,
      weaknessAreas,
      recommendedWords,
      timeSpentLearning: attempts.length * 30, // Estimate 30 seconds per attempt
      improvementTrend
    };
  }

  /**
   * Get upcoming review schedule
   */
  private getUpcomingReviews(schedules: Schedule[]): SpacedRepetitionData[] {
    return schedules
      .filter(schedule => new Date(schedule.nextDueAt) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // Next 7 days
      .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
      .slice(0, 10)
      .map(schedule => ({
        wordId: schedule.wordId,
        currentBox: schedule.box,
        nextReviewDate: new Date(schedule.nextDueAt),
        reviewCount: schedule.reviewCount,
        difficulty: this.calculateDifficulty(schedule.box, schedule.reviewCount),
        lastAttemptSuccess: true // This would need to be calculated from recent attempts
      }));
  }

  /**
   * Calculate achievements based on performance
   */
  private calculateAchievements(attempts: Attempt[], metrics: ProgressMetrics): AchievementData[] {
    const achievements: AchievementData[] = [];

    // Streak achievements
    if (metrics.streakLength >= 5) {
      achievements.push({
        type: 'streak',
        title: 'On Fire!',
        description: `${metrics.streakLength} correct answers in a row`,
        earnedDate: new Date()
      });
    }

    // Mastery achievements
    if (metrics.masteredWords >= 5) {
      achievements.push({
        type: 'mastery',
        title: 'Word Master',
        description: `Mastered ${metrics.masteredWords} words`,
        earnedDate: new Date()
      });
    }

    // Consistency achievements
    if (metrics.totalAttempts >= 50) {
      achievements.push({
        type: 'consistency',
        title: 'Dedicated Learner',
        description: `Completed ${metrics.totalAttempts} learning attempts`,
        earnedDate: new Date()
      });
    }

    return achievements;
  }

  /**
   * Calculate next review date using spaced repetition algorithm
   */
  private calculateNextReview(currentSchedule: Schedule | null, success: boolean): {
    box: number;
    nextDueAt: Date;
    reviewCount: number;
  } {
    const now = new Date();
    let box = currentSchedule?.box || 1;
    let reviewCount = (currentSchedule?.reviewCount || 0) + 1;

    if (success) {
      // Move to next box (longer interval)
      box = Math.min(5, box + 1);
    } else {
      // Move back to box 1 (shortest interval)
      box = 1;
    }

    // Calculate next due date based on box
    const intervals = [1, 3, 7, 14, 30]; // days
    const daysToAdd = intervals[box - 1];
    const nextDueAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    return { box, nextDueAt, reviewCount };
  }

  /**
   * Get current schedule for a word
   */
  private async getWordSchedule(studentId: string, wordId: string): Promise<Schedule | null> {
    try {
      const response = await fetch(`/api/students/${studentId}/schedules/${wordId}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Failed to fetch schedule: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching word schedule:', error);
      return null;
    }
  }

  /**
   * Calculate difficulty level based on spaced repetition data
   */
  private calculateDifficulty(box: number, reviewCount: number): 'easy' | 'medium' | 'hard' {
    if (box >= 4) return 'easy';
    if (box >= 2 && reviewCount >= 3) return 'medium';
    return 'hard';
  }
}

// Export singleton instance
export const studentProgressService = new StudentProgressService();