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
  type WordWithProgress
} from "@shared/schema.js";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private words: Map<string, Word> = new Map();
  private sentences: Map<string, Sentence> = new Map();
  private audioCache: Map<string, AudioCache> = new Map();
  private attempts: Map<string, Attempt> = new Map();
  private schedules: Map<string, Schedule> = new Map();
  private settings: Map<string, Settings> = new Map();
  private currentWeekId: string;

  constructor() {
    this.currentWeekId = this.generateWeekId();
  }

  private generateWeekId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Words
  async getWord(id: string): Promise<Word | undefined> {
    return this.words.get(id);
  }

  async getWords(weekId?: string): Promise<Word[]> {
    const targetWeek = weekId || this.currentWeekId;
    return Array.from(this.words.values()).filter(word => word.weekId === targetWeek);
  }

  async getWordsWithProgress(weekId?: string): Promise<WordWithProgress[]> {
    const words = await this.getWords(weekId);
    const wordsWithProgress: WordWithProgress[] = [];

    for (const word of words) {
      const schedule = await this.getSchedule(word.id);
      const attempts = await this.getAttempts(word.id);
      const sentences = await this.getSentences(word.id);
      const audioCache = Array.from(this.audioCache.values()).filter(
        cache => cache.wordId === word.id
      );

      wordsWithProgress.push({
        ...word,
        schedule,
        attempts,
        sentences,
        audioCache,
      });
    }

    return wordsWithProgress;
  }

  async createWord(insertWord: InsertWord): Promise<Word> {
    const id = randomUUID();
    const word: Word = {
      ...insertWord,
      id,
      createdAt: new Date(),
      teacherDefinition: insertWord.teacherDefinition || null,
      syllables: insertWord.syllables || null,
      morphemes: insertWord.morphemes || null,
      ipa: insertWord.ipa || null,
    };
    this.words.set(id, word);
    return word;
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<Word> {
    const existing = this.words.get(id);
    if (!existing) throw new Error("Word not found");
    
    const updated = { ...existing, ...updates };
    this.words.set(id, updated);
    return updated;
  }

  async deleteWord(id: string): Promise<void> {
    this.words.delete(id);
    // Clean up related data
    Array.from(this.sentences.entries())
      .filter(([_, sentence]) => sentence.wordId === id)
      .forEach(([sentenceId]) => this.sentences.delete(sentenceId));
    
    Array.from(this.attempts.entries())
      .filter(([_, attempt]) => attempt.wordId === id)
      .forEach(([attemptId]) => this.attempts.delete(attemptId));

    Array.from(this.schedules.entries())
      .filter(([_, schedule]) => schedule.wordId === id)
      .forEach(([scheduleId]) => this.schedules.delete(scheduleId));
  }

  // Sentences
  async getSentences(wordId: string): Promise<Sentence[]> {
    return Array.from(this.sentences.values()).filter(sentence => sentence.wordId === wordId);
  }

  async createSentence(insertSentence: InsertSentence): Promise<Sentence> {
    const id = randomUUID();
    const sentence: Sentence = {
      ...insertSentence,
      id,
      createdAt: new Date(),
      source: insertSentence.source || "ai",
      toxicityOk: insertSentence.toxicityOk ?? true,
    };
    this.sentences.set(id, sentence);
    return sentence;
  }

  async deleteSentence(id: string): Promise<void> {
    this.sentences.delete(id);
  }

  // Audio Cache
  async getAudioCache(cacheKey: string): Promise<AudioCache | undefined> {
    return Array.from(this.audioCache.values()).find(cache => cache.cacheKey === cacheKey);
  }

  async createAudioCache(audio: Omit<AudioCache, 'id' | 'createdAt'>): Promise<AudioCache> {
    const id = randomUUID();
    const audioRecord: AudioCache = {
      ...audio,
      id,
      createdAt: new Date(),
    };
    this.audioCache.set(id, audioRecord);
    return audioRecord;
  }

  async deleteAudioCache(id: string): Promise<void> {
    this.audioCache.delete(id);
  }

  // Attempts
  async getAttempts(wordId: string): Promise<Attempt[]> {
    return Array.from(this.attempts.values()).filter(attempt => attempt.wordId === wordId);
  }

  async createAttempt(insertAttempt: InsertAttempt): Promise<Attempt> {
    const id = randomUUID();
    const attempt: Attempt = {
      ...insertAttempt,
      id,
      timestamp: new Date(),
      success: insertAttempt.success ?? null,
      errorType: insertAttempt.errorType || null,
      responseData: insertAttempt.responseData || null,
    };
    this.attempts.set(id, attempt);
    return attempt;
  }

  async getAttemptStats(wordId: string): Promise<{ successRate: number; totalAttempts: number }> {
    const attempts = await this.getAttempts(wordId);
    const totalAttempts = attempts.length;
    const successfulAttempts = attempts.filter(attempt => attempt.success === true).length;
    const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
    
    return { successRate, totalAttempts };
  }

  // Schedule
  async getSchedule(wordId: string): Promise<Schedule | undefined> {
    return Array.from(this.schedules.values()).find(schedule => schedule.wordId === wordId);
  }

  async getAllSchedules(): Promise<Schedule[]> {
    return Array.from(this.schedules.values());
  }

  async createSchedule(insertSchedule: InsertSchedule): Promise<Schedule> {
    const id = randomUUID();
    const schedule: Schedule = {
      ...insertSchedule,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      box: insertSchedule.box || 1,
      reviewCount: insertSchedule.reviewCount || 0,
    };
    this.schedules.set(id, schedule);
    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule> {
    const existing = this.schedules.get(id);
    if (!existing) throw new Error("Schedule not found");
    
    const updated = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.schedules.set(id, updated);
    return updated;
  }

  async deleteSchedule(id: string): Promise<void> {
    this.schedules.delete(id);
  }

  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<Settings> {
    const existing = this.settings.get(key);
    if (existing) {
      const updated = { ...existing, value, updatedAt: new Date() };
      this.settings.set(key, updated);
      return updated;
    } else {
      const id = randomUUID();
      const setting: Settings = {
        id,
        key,
        value,
        updatedAt: new Date(),
      };
      this.settings.set(key, setting);
      return setting;
    }
  }

  async getSettings(): Promise<Settings[]> {
    return Array.from(this.settings.values());
  }

  // Utility
  async getCurrentWeek(): Promise<string> {
    return this.currentWeekId;
  }

  async createWeek(): Promise<string> {
    this.currentWeekId = this.generateWeekId();
    return this.currentWeekId;
  }
}

export const storage = new MemStorage();
