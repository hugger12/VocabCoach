import { Schedule, InsertSchedule } from "@shared/schema.js";

export interface SchedulerConfig {
  dailyLimit: number;
  intervals: {
    box1: number; // hours
    box2: number; // hours  
    box3: number; // hours
    box4: number; // hours
  };
}

export class SchedulerService {
  private config: SchedulerConfig = {
    dailyLimit: 8,
    intervals: {
      box1: 1,     // 1 hour
      box2: 24,    // 1 day
      box3: 72,    // 3 days
      box4: 168,   // 1 week
    },
  };

  /**
   * Create initial schedule entry for a new word
   */
  createInitialSchedule(wordId: string): InsertSchedule {
    const nextDueAt = new Date();
    nextDueAt.setHours(nextDueAt.getHours() + this.config.intervals.box1);

    return {
      wordId,
      box: 1,
      nextDueAt,
      reviewCount: 0,
    };
  }

  /**
   * Update schedule based on practice result
   */
  updateSchedule(currentSchedule: Schedule, success: boolean): Partial<Schedule> {
    const now = new Date();
    let newBox = currentSchedule.box;
    let intervalHours = this.config.intervals.box1;

    if (success) {
      // Move to next box (promote)
      newBox = Math.min(currentSchedule.box + 1, 5);
      
      switch (newBox) {
        case 2:
          intervalHours = this.config.intervals.box2;
          break;
        case 3:
          intervalHours = this.config.intervals.box3;
          break;
        case 4:
        case 5:
          intervalHours = this.config.intervals.box4;
          break;
        default:
          intervalHours = this.config.intervals.box1;
      }
    } else {
      // Move back one box (demote) but not below box 1
      newBox = Math.max(currentSchedule.box - 1, 1);
      intervalHours = this.config.intervals.box1;
    }

    const nextDueAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

    return {
      box: newBox,
      nextDueAt,
      reviewCount: currentSchedule.reviewCount + 1,
      updatedAt: now,
    };
  }

  /**
   * Get words due for review
   */
  getWordsForToday(schedules: Schedule[], limit?: number): Schedule[] {
    const now = new Date();
    const dueWords = schedules
      .filter(schedule => schedule.nextDueAt <= now)
      .sort((a, b) => {
        // Prioritize by box (lower boxes first) then by due time
        if (a.box !== b.box) {
          return a.box - b.box;
        }
        return a.nextDueAt.getTime() - b.nextDueAt.getTime();
      });

    const dailyLimit = limit ?? this.config.dailyLimit;
    return dueWords.slice(0, dailyLimit);
  }

  /**
   * Calculate progress statistics
   */
  calculateProgress(schedules: Schedule[]) {
    const total = schedules.length;
    const byBox = {
      box1: schedules.filter(s => s.box === 1).length,
      box2: schedules.filter(s => s.box === 2).length,
      box3: schedules.filter(s => s.box === 3).length,
      box4: schedules.filter(s => s.box === 4).length,
      box5: schedules.filter(s => s.box === 5).length,
    };

    const mastered = byBox.box5;
    const learning = total - mastered;
    const masteryPercentage = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return {
      total,
      mastered,
      learning,
      masteryPercentage,
      byBox,
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Generate study session from due words
   */
  createStudySession(dueSchedules: Schedule[], allWords: any[]): any {
    const sessionWords = dueSchedules.map(schedule => {
      const word = allWords.find(w => w.id === schedule.wordId);
      return word ? { ...word, schedule } : null;
    }).filter(Boolean);

    return {
      words: sessionWords,
      currentIndex: 0,
      totalWords: sessionWords.length,
      sessionStarted: new Date(),
    };
  }

  /**
   * Calculate when next review batch will be ready
   */
  getNextReviewTime(schedules: Schedule[]): Date | null {
    const futureReviews = schedules
      .filter(schedule => schedule.nextDueAt > new Date())
      .sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());

    return futureReviews.length > 0 ? futureReviews[0].nextDueAt : null;
  }
}

export const schedulerService = new SchedulerService();
