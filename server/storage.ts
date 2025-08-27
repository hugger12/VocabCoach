import { 
  type Word, 
  type InsertWord, 
  type Sentence, 
  type InsertSentence,
  type AudioCache,
  type Attempt,
  type InsertAttempt,
  type Schedule,
  type InsertSchedule,
  type Settings,
  type WordWithProgress,
  words,
  sentences,
  audioCache as audioCacheTable,
  attempts,
  schedule,
  settings
} from "@shared/schema.js";
import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "./db.js";

export interface IStorage {
  // Words
  getWord(id: string): Promise<Word | undefined>;
  getWords(weekId?: string): Promise<Word[]>;
  getWordsWithProgress(weekId?: string): Promise<WordWithProgress[]>;
  createWord(word: InsertWord): Promise<Word>;
  updateWord(id: string, updates: Partial<Word>): Promise<Word>;
  deleteWord(id: string): Promise<void>;

  // Sentences
  getSentences(wordId: string): Promise<Sentence[]>;
  createSentence(sentence: InsertSentence): Promise<Sentence>;
  deleteSentence(id: string): Promise<void>;

  // Audio Cache
  getAudioCache(cacheKey: string): Promise<AudioCache | undefined>;
  createAudioCache(audio: Omit<AudioCache, 'id' | 'createdAt'>): Promise<AudioCache>;
  deleteAudioCache(id: string): Promise<void>;

  // Attempts
  getAttempts(wordId: string): Promise<Attempt[]>;
  createAttempt(attempt: InsertAttempt): Promise<Attempt>;
  getAttemptStats(wordId: string): Promise<{ successRate: number; totalAttempts: number }>;

  // Schedule
  getSchedule(wordId: string): Promise<Schedule | undefined>;
  getAllSchedules(): Promise<Schedule[]>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;

  // Settings
  getSetting(key: string): Promise<Settings | undefined>;
  setSetting(key: string, value: string): Promise<Settings>;
  getSettings(): Promise<Settings[]>;

  // Utility
  getCurrentWeek(): Promise<string>;
  createWeek(): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  private currentWeekId: string;

  constructor() {
    this.currentWeekId = this.generateWeekId();
  }

  private generateWeekId(): string {
    const now = new Date();
    const year = now.getFullYear();
    
    // Find the first Sunday of the year
    const jan1 = new Date(year, 0, 1);
    const firstSunday = new Date(jan1);
    const daysUntilSunday = (7 - jan1.getDay()) % 7;
    firstSunday.setDate(jan1.getDate() + daysUntilSunday);
    
    // If current date is before first Sunday, it's the last week of previous year
    if (now < firstSunday) {
      return this.generateWeekIdForDate(new Date(year - 1, 11, 31));
    }
    
    // Calculate week number from first Sunday
    const daysDiff = Math.floor((now.getTime() - firstSunday.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.floor(daysDiff / 7) + 1;
    
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }
  
  private generateWeekIdForDate(date: Date): string {
    const year = date.getFullYear();
    
    // Find the first Sunday of the year
    const jan1 = new Date(year, 0, 1);
    const firstSunday = new Date(jan1);
    const daysUntilSunday = (7 - jan1.getDay()) % 7;
    firstSunday.setDate(jan1.getDate() + daysUntilSunday);
    
    // If date is before first Sunday, it's the last week of previous year
    if (date < firstSunday) {
      return this.generateWeekIdForDate(new Date(year - 1, 11, 31));
    }
    
    // Calculate week number from first Sunday
    const daysDiff = Math.floor((date.getTime() - firstSunday.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.floor(daysDiff / 7) + 1;
    
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  // Words
  async getWord(id: string): Promise<Word | undefined> {
    const [word] = await db.select().from(words).where(eq(words.id, id));
    return word;
  }

  async getWords(weekId?: string): Promise<Word[]> {
    if (!weekId) {
      return await db.select().from(words).orderBy(words.createdAt);
    }
    return await db.select().from(words).where(eq(words.weekId, weekId)).orderBy(words.createdAt);
  }

  async getWordsWithProgress(weekId?: string): Promise<WordWithProgress[]> {
    const wordsList = await this.getWords(weekId);
    const wordsWithProgress: WordWithProgress[] = [];

    for (const word of wordsList) {
      const scheduleData = await this.getSchedule(word.id);
      const attemptsData = await this.getAttempts(word.id);
      const sentencesData = await this.getSentences(word.id);
      const audioCacheData = await db.select().from(audioCacheTable).where(eq(audioCacheTable.wordId, word.id));

      wordsWithProgress.push({
        ...word,
        schedule: scheduleData,
        attempts: attemptsData,
        sentences: sentencesData,
        audioCache: audioCacheData,
      });
    }

    return wordsWithProgress;
  }

  async createWord(insertWord: InsertWord): Promise<Word> {
    const [word] = await db
      .insert(words)
      .values({
        ...insertWord,
        teacherDefinition: insertWord.teacherDefinition || null,
        syllables: insertWord.syllables || null,
        morphemes: insertWord.morphemes || null,
        ipa: insertWord.ipa || null,
      })
      .returning();
    return word;
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<Word> {
    const [word] = await db
      .update(words)
      .set(updates)
      .where(eq(words.id, id))
      .returning();
    
    if (!word) {
      throw new Error(`Word with id ${id} not found`);
    }
    return word;
  }

  async deleteWord(id: string): Promise<void> {
    await db.delete(words).where(eq(words.id, id));
  }

  // Sentences
  async getSentences(wordId: string): Promise<Sentence[]> {
    return await db.select().from(sentences).where(eq(sentences.wordId, wordId));
  }

  async createSentence(insertSentence: InsertSentence): Promise<Sentence> {
    const [sentence] = await db
      .insert(sentences)
      .values(insertSentence)
      .returning();
    return sentence;
  }

  async deleteSentence(id: string): Promise<void> {
    await db.delete(sentences).where(eq(sentences.id, id));
  }

  // Audio Cache
  async getAudioCache(cacheKey: string): Promise<AudioCache | undefined> {
    const [audio] = await db.select().from(audioCacheTable).where(eq(audioCacheTable.cacheKey, cacheKey));
    return audio;
  }

  async createAudioCache(audio: Omit<AudioCache, 'id' | 'createdAt'>): Promise<AudioCache> {
    const [created] = await db
      .insert(audioCacheTable)
      .values(audio)
      .returning();
    return created;
  }

  async deleteAudioCache(id: string): Promise<void> {
    await db.delete(audioCacheTable).where(eq(audioCacheTable.id, id));
  }

  // Attempts
  async getAttempts(wordId: string): Promise<Attempt[]> {
    return await db.select().from(attempts).where(eq(attempts.wordId, wordId));
  }

  async createAttempt(insertAttempt: InsertAttempt): Promise<Attempt> {
    const [attempt] = await db
      .insert(attempts)
      .values(insertAttempt)
      .returning();
    return attempt;
  }

  async getAttemptStats(wordId: string): Promise<{ successRate: number; totalAttempts: number }> {
    const wordAttempts = await this.getAttempts(wordId);
    const totalAttempts = wordAttempts.length;
    const successfulAttempts = wordAttempts.filter(attempt => attempt.success).length;
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    return { successRate, totalAttempts };
  }

  // Schedule
  async getSchedule(wordId: string): Promise<Schedule | undefined> {
    const [scheduleData] = await db.select().from(schedule).where(eq(schedule.wordId, wordId));
    return scheduleData;
  }

  async getAllSchedules(): Promise<Schedule[]> {
    return await db.select().from(schedule);
  }

  async createSchedule(insertSchedule: InsertSchedule): Promise<Schedule> {
    const [scheduleData] = await db
      .insert(schedule)
      .values(insertSchedule)
      .returning();
    return scheduleData;
  }

  async updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule> {
    const [scheduleData] = await db
      .update(schedule)
      .set(updates)
      .where(eq(schedule.id, id))
      .returning();
    
    if (!scheduleData) {
      throw new Error(`Schedule with id ${id} not found`);
    }
    return scheduleData;
  }

  async deleteSchedule(id: string): Promise<void> {
    await db.delete(schedule).where(eq(schedule.id, id));
  }

  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<Settings> {
    const existing = await this.getSetting(key);
    
    if (existing) {
      const [setting] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return setting;
    } else {
      const [setting] = await db
        .insert(settings)
        .values({ key, value })
        .returning();
      return setting;
    }
  }

  async getSettings(): Promise<Settings[]> {
    return await db.select().from(settings);
  }

  // Utility
  async getCurrentWeek(): Promise<string> {
    return this.currentWeekId;
  }

  async createWeek(): Promise<string> {
    const newWeekId = this.generateWeekId();
    this.currentWeekId = newWeekId;
    return newWeekId;
  }
}

export const storage = new DatabaseStorage();