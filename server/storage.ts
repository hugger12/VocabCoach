import { 
  type User,
  type InsertUser,
  type UpsertUser,
  type Student,
  type InsertStudent,
  type VocabularyList,
  type InsertVocabularyList,
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
  type ClozeQuestion,
  type InsertClozeQuestion,
  type PassageQuestion,
  type InsertPassageQuestion,
  type PassageBlank,
  type InsertPassageBlank,
  users,
  students,
  vocabularyLists,
  words,
  sentences,
  audioCache as audioCacheTable,
  attempts,
  schedule,
  settings,
  clozeQuestions,
  passageQuestions,
  passageBlanks
} from "@shared/schema.js";
import { randomUUID } from "crypto";
import { eq, desc, and, inArray, sql, lte } from "drizzle-orm";
import { db } from "./db";
import { databaseResilienceService } from "./services/databaseResilience.js";
import { errorRecoveryService } from "./services/errorRecovery.js";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Student operations
  getStudent(id: string): Promise<Student | undefined>;
  getStudentsByInstructor(instructorId: string): Promise<Student[]>;
  getStudentByPin(pin: string, instructorId?: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, updates: Partial<Student>): Promise<Student>;
  deleteStudent(id: string): Promise<void>;

  // Vocabulary lists
  getVocabularyList(id: string): Promise<VocabularyList | undefined>;
  getVocabularyLists(instructorId: string): Promise<VocabularyList[]>;
  getCurrentVocabularyList(instructorId: string): Promise<VocabularyList | undefined>;
  createVocabularyList(list: InsertVocabularyList): Promise<VocabularyList>;
  updateVocabularyList(id: string, updates: Partial<VocabularyList>): Promise<VocabularyList>;
  setCurrentVocabularyList(instructorId: string, listId: string): Promise<void>;
  deleteVocabularyList(id: string): Promise<void>;

  // Words (now list-scoped)
  getWord(id: string): Promise<Word | undefined>;
  getWords(listId?: string, instructorId?: string): Promise<Word[]>;
  getWordsWithProgress(listId?: string, instructorId?: string, studentId?: string): Promise<WordWithProgress[]>;
  createWord(word: InsertWord): Promise<Word>;
  updateWord(id: string, updates: Partial<Word>): Promise<Word>;
  deleteWord(id: string): Promise<void>;

  // Sentences
  getSentences(wordId: string): Promise<Sentence[]>;
  createSentence(sentence: InsertSentence): Promise<Sentence>;
  deleteSentence(id: string): Promise<void>;

  // Enhanced Audio Cache with hybrid storage
  getAudioCache(cacheKey: string): Promise<AudioCache | undefined>;
  getAudioCacheByContentHash(contentHash: string): Promise<AudioCache | undefined>;
  createAudioCache(audio: Omit<AudioCache, 'id' | 'createdAt'>): Promise<AudioCache>;
  updateAudioCacheHit(id: string): Promise<void>;
  deleteAudioCache(id: string): Promise<void>;
  cleanupOldAudioCache(olderThanDays: number, maxHitCount: number): Promise<number>;
  getAudioCacheStats(): Promise<{ totalEntries: number; totalSize: number; avgHitCount: number }>;

  // Attempts (now student-scoped)
  getAttempts(wordId: string, studentId?: string): Promise<Attempt[]>;
  createAttempt(attempt: InsertAttempt): Promise<Attempt>;
  getAttemptStats(wordId: string, studentId?: string): Promise<{ successRate: number; totalAttempts: number }>;

  // Schedule (now student-scoped)
  getSchedule(wordId: string, studentId?: string): Promise<Schedule | undefined>;
  getAllSchedules(studentId?: string): Promise<Schedule[]>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;

  // Settings
  getSetting(key: string): Promise<Settings | undefined>;
  setSetting(key: string, value: string): Promise<Settings>;
  getSettings(): Promise<Settings[]>;

  // Quiz functionality
  getWordsByList(listId: string): Promise<Word[]>;
  createClozeQuestion(question: InsertClozeQuestion): Promise<ClozeQuestion>;
  getClozeQuestionsByList(listId: string): Promise<ClozeQuestion[]>;
  getClozeQuestionsByWordIds(wordIds: string): Promise<ClozeQuestion[]>;
  createPassageQuestion(passage: InsertPassageQuestion): Promise<PassageQuestion>;
  createPassageBlank(blank: InsertPassageBlank): Promise<PassageBlank>;
  getPassageQuestionByList(listId: string): Promise<{ passage: PassageQuestion; blanks: PassageBlank[] } | null>;
  getPassageQuestionByWordIds(wordIds: string, listId: string): Promise<{ id: string; passageText: string; title: string; blanks: PassageBlank[] } | null>;
}

export class DatabaseStorage implements IStorage {

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
      },
      'getUser',
      `id: ${id}`
    );
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [user] = await db
          .insert(users)
          .values(userData)
          .onConflictDoUpdate({
            target: users.id,
            set: {
              ...userData,
              updatedAt: new Date(),
            },
          })
          .returning();
        return user;
      },
      'upsertUser',
      `userId: ${userData.id}`
    );
  }

  // Student operations
  async getStudent(id: string): Promise<Student | undefined> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [student] = await db.select().from(students).where(eq(students.id, id));
        return student;
      },
      'getStudent',
      `id: ${id}`
    );
  }

  async getStudentsByInstructor(instructorId: string): Promise<Student[]> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        return await db.select().from(students).where(eq(students.instructorId, instructorId));
      },
      'getStudentsByInstructor',
      `instructorId: ${instructorId}`
    );
  }

  async getStudentByPin(pin: string, instructorId?: string): Promise<Student | undefined> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        if (instructorId) {
          const [student] = await db
            .select()
            .from(students)
            .where(and(eq(students.pin, pin), eq(students.instructorId, instructorId)));
          return student;
        } else {
          // Find student by PIN across all instructors
          const [student] = await db
            .select()
            .from(students)
            .where(eq(students.pin, pin));
          return student;
        }
      },
      'getStudentByPin',
      `pin: ${pin}, instructorId: ${instructorId}`
    );
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [created] = await db
          .insert(students)
          .values(student)
          .returning();
        return created;
      },
      'createStudent',
      `name: ${student.name}`
    );
  }

  async updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [student] = await db
          .update(students)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(students.id, id))
          .returning();
        
        if (!student) {
          throw new Error(`Student with id ${id} not found`);
        }
        return student;
      },
      'updateStudent',
      `id: ${id}`
    );
  }

  async deleteStudent(id: string): Promise<void> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        await db.delete(students).where(eq(students.id, id));
      },
      'deleteStudent',
      `id: ${id}`
    );
  }

  // Vocabulary lists
  async getVocabularyList(id: string): Promise<VocabularyList | undefined> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [list] = await db.select().from(vocabularyLists).where(eq(vocabularyLists.id, id));
        return list;
      },
      'getVocabularyList',
      `id: ${id}`
    );
  }

  async getVocabularyLists(instructorId: string): Promise<VocabularyList[]> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        return await db.select().from(vocabularyLists)
          .where(eq(vocabularyLists.instructorId, instructorId))
          .orderBy(desc(vocabularyLists.createdAt));
      },
      'getVocabularyLists',
      `instructorId: ${instructorId}`
    );
  }

  async getCurrentVocabularyList(instructorId: string): Promise<VocabularyList | undefined> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [list] = await db.select().from(vocabularyLists)
          .where(and(eq(vocabularyLists.instructorId, instructorId), eq(vocabularyLists.isCurrent, true)));
        return list;
      },
      'getCurrentVocabularyList',
      `instructorId: ${instructorId}`
    );
  }

  async getGlobalCurrentVocabularyList(): Promise<VocabularyList | undefined> {
    // Get the most recently created vocabulary list across all instructors
    const [list] = await db.select().from(vocabularyLists)
      .orderBy(desc(vocabularyLists.createdAt))
      .limit(1);
    return list;
  }

  async createVocabularyList(list: InsertVocabularyList): Promise<VocabularyList> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [created] = await db
          .insert(vocabularyLists)
          .values(list)
          .returning();
        return created;
      },
      'createVocabularyList',
      `name: ${list.name}`
    );
  }

  async updateVocabularyList(id: string, updates: Partial<VocabularyList>): Promise<VocabularyList> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        const [list] = await db
          .update(vocabularyLists)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(vocabularyLists.id, id))
          .returning();
        
        if (!list) {
          throw new Error(`Vocabulary list with id ${id} not found`);
        }
        return list;
      },
      'updateVocabularyList',
      `id: ${id}`
    );
  }

  async setCurrentVocabularyList(instructorId: string, listId: string): Promise<void> {
    return databaseResilienceService.executeWithResilience(
      async () => {
        // First, set all lists for this instructor to not current
        await db.update(vocabularyLists)
          .set({ isCurrent: false, updatedAt: new Date() })
          .where(eq(vocabularyLists.instructorId, instructorId));
        
        // Then set the specified list as current
        await db.update(vocabularyLists)
          .set({ isCurrent: true, updatedAt: new Date() })
          .where(eq(vocabularyLists.id, listId));
      },
      'setCurrentVocabularyList',
      `instructorId: ${instructorId}, listId: ${listId}`
    );
  }

  async deleteVocabularyList(id: string): Promise<void> {
    await db.delete(vocabularyLists).where(eq(vocabularyLists.id, id));
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

  async getWords(listId?: string, instructorId?: string): Promise<Word[]> {
    if (!listId && !instructorId) {
      return await db.select().from(words).orderBy(words.createdAt);
    }
    
    if (listId && instructorId) {
      return await db.select().from(words)
        .where(and(eq(words.listId, listId), eq(words.instructorId, instructorId)))
        .orderBy(words.createdAt);
    }
    
    if (listId) {
      return await db.select().from(words).where(eq(words.listId, listId)).orderBy(words.createdAt);
    }
    
    if (instructorId) {
      return await db.select().from(words).where(eq(words.instructorId, instructorId)).orderBy(words.createdAt);
    }
    
    return [];
  }

  async getWordsWithProgress(listId?: string, instructorId?: string, studentId?: string): Promise<WordWithProgress[]> {
    const wordsList = await this.getWords(listId, instructorId);
    const wordsWithProgress: WordWithProgress[] = [];

    for (const word of wordsList) {
      const scheduleData = await this.getSchedule(word.id, studentId);
      const attemptsData = await this.getAttempts(word.id, studentId);
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

  // Enhanced Audio Cache with hit tracking
  async getAudioCache(cacheKey: string): Promise<AudioCache | undefined> {
    const [audio] = await db.select().from(audioCacheTable).where(eq(audioCacheTable.cacheKey, cacheKey));
    
    if (audio) {
      // Update hit count and last accessed timestamp
      await this.updateAudioCacheHit(audio.id);
    }
    
    return audio;
  }

  async getAudioCacheByContentHash(contentHash: string): Promise<AudioCache | undefined> {
    const [audio] = await db.select().from(audioCacheTable).where(eq(audioCacheTable.contentHash, contentHash));
    return audio;
  }

  async createAudioCache(audio: Omit<AudioCache, 'id' | 'createdAt'>): Promise<AudioCache> {
    // Handle null sentenceId for fallback sentences
    const audioData = {
      ...audio,
      sentenceId: audio.sentenceId || null,
      hitCount: audio.hitCount ?? 0,
      lastAccessedAt: audio.lastAccessedAt ?? new Date()
    };
    
    const [created] = await db
      .insert(audioCacheTable)
      .values(audioData)
      .returning();
    return created;
  }

  async updateAudioCacheHit(id: string): Promise<void> {
    await db
      .update(audioCacheTable)
      .set({ 
        hitCount: sql`${audioCacheTable.hitCount} + 1`,
        lastAccessedAt: new Date()
      })
      .where(eq(audioCacheTable.id, id));
  }

  async deleteAudioCache(id: string): Promise<void> {
    await db.delete(audioCacheTable).where(eq(audioCacheTable.id, id));
  }

  async cleanupOldAudioCache(olderThanDays: number, maxHitCount: number = 0): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    // EFFICIENCY FIX: Delete old entries with low hit counts using correct comparison operators
    // Previously used eq() which only matched exact values, now uses lte() for proper range cleanup
    const deleteResult = await db
      .delete(audioCacheTable)
      .where(
        and(
          lte(audioCacheTable.lastAccessedAt, cutoffDate), // Delete entries older than cutoff
          lte(audioCacheTable.hitCount, maxHitCount)       // Delete entries with low hit counts
        )
      );
    
    console.log(`🧹 Cache cleanup: removed ${deleteResult.rowCount || 0} entries older than ${olderThanDays} days with hit count <= ${maxHitCount}`);
    return deleteResult.rowCount || 0;
  }

  async getAudioCacheStats(): Promise<{ totalEntries: number; totalSize: number; avgHitCount: number }> {
    const stats = await db
      .select({
        count: sql<number>`count(*)`,
        totalSize: sql<number>`sum(coalesce(${audioCacheTable.fileSize}, 0))`,
        avgHitCount: sql<number>`avg(${audioCacheTable.hitCount})`
      })
      .from(audioCacheTable);
    
    const result = stats[0];
    return {
      totalEntries: result.count || 0,
      totalSize: result.totalSize || 0,
      avgHitCount: Math.round(result.avgHitCount || 0)
    };
  }

  // Attempts (now student-scoped)
  async getAttempts(wordId: string, studentId?: string): Promise<Attempt[]> {
    if (studentId) {
      return await db.select().from(attempts)
        .where(and(eq(attempts.wordId, wordId), eq(attempts.studentId, studentId)));
    }
    return await db.select().from(attempts).where(eq(attempts.wordId, wordId));
  }

  async createAttempt(insertAttempt: InsertAttempt): Promise<Attempt> {
    const [attempt] = await db
      .insert(attempts)
      .values(insertAttempt)
      .returning();
    return attempt;
  }

  async getAttemptStats(wordId: string, studentId?: string): Promise<{ successRate: number; totalAttempts: number }> {
    const wordAttempts = await this.getAttempts(wordId, studentId);
    const totalAttempts = wordAttempts.length;
    const successfulAttempts = wordAttempts.filter(attempt => attempt.success).length;
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    return { successRate, totalAttempts };
  }

  // Schedule (now student-scoped)
  async getSchedule(wordId: string, studentId?: string): Promise<Schedule | undefined> {
    if (studentId) {
      const [scheduleData] = await db.select().from(schedule)
        .where(and(eq(schedule.wordId, wordId), eq(schedule.studentId, studentId)));
      return scheduleData;
    }
    const [scheduleData] = await db.select().from(schedule).where(eq(schedule.wordId, wordId));
    return scheduleData;
  }

  async getAllSchedules(studentId?: string): Promise<Schedule[]> {
    if (studentId) {
      return await db.select().from(schedule).where(eq(schedule.studentId, studentId));
    }
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

  // Quiz functionality
  async getWordsByList(listId: string): Promise<Word[]> {
    return await db.select().from(words).where(eq(words.listId, listId));
  }

  async createClozeQuestion(question: InsertClozeQuestion): Promise<ClozeQuestion> {
    const [savedQuestion] = await db
      .insert(clozeQuestions)
      .values(question)
      .returning();
    return savedQuestion;
  }

  async getClozeQuestionsByList(listId: string): Promise<ClozeQuestion[]> {
    return await db
      .select({
        id: clozeQuestions.id,
        wordId: clozeQuestions.wordId,
        sentence1: clozeQuestions.sentence1,
        sentence2: clozeQuestions.sentence2,
        correctAnswer: clozeQuestions.correctAnswer,
        distractors: clozeQuestions.distractors,
        createdAt: clozeQuestions.createdAt,
      })
      .from(clozeQuestions)
      .innerJoin(words, eq(words.id, clozeQuestions.wordId))
      .where(eq(words.listId, listId));
  }
  
  // SERVER CACHE: Get cloze questions by specific word IDs for caching optimization
  async getClozeQuestionsByWordIds(wordIds: string): Promise<ClozeQuestion[]> {
    const wordIdArray = wordIds.split(',');
    return await db
      .select({
        id: clozeQuestions.id,
        wordId: clozeQuestions.wordId,
        sentence1: clozeQuestions.sentence1,
        sentence2: clozeQuestions.sentence2,
        correctAnswer: clozeQuestions.correctAnswer,
        distractors: clozeQuestions.distractors,
        createdAt: clozeQuestions.createdAt,
      })
      .from(clozeQuestions)
      .where(inArray(clozeQuestions.wordId, wordIdArray));
  }

  async createPassageQuestion(passage: InsertPassageQuestion): Promise<PassageQuestion> {
    const [savedPassage] = await db
      .insert(passageQuestions)
      .values(passage)
      .returning();
    return savedPassage;
  }

  async createPassageBlank(blank: InsertPassageBlank): Promise<PassageBlank> {
    const [savedBlank] = await db
      .insert(passageBlanks)
      .values(blank)
      .returning();
    return savedBlank;
  }

  async getPassageQuestionByList(listId: string): Promise<{ passage: PassageQuestion; blanks: PassageBlank[] } | null> {
    const [passage] = await db
      .select()
      .from(passageQuestions)
      .where(eq(passageQuestions.listId, listId));
    
    if (!passage) {
      return null;
    }

    const blanks = await db
      .select()
      .from(passageBlanks)
      .where(eq(passageBlanks.passageId, passage.id));

    return { passage, blanks };
  }
  
  // SERVER CACHE: Get passage question by specific word IDs for caching optimization
  async getPassageQuestionByWordIds(wordIds: string, listId: string): Promise<{ id: string; passageText: string; title: string; blanks: PassageBlank[] } | null> {
    const wordIdArray = wordIds.split(',');
    
    // Find passage that contains exactly these word IDs
    const passageWithBlanks = await db
      .select({
        passageId: passageQuestions.id,
        passageText: passageQuestions.passageText,
        title: passageQuestions.title,
        blankWordId: passageBlanks.wordId,
        blankId: passageBlanks.id,
        blankNumber: passageBlanks.blankNumber,
        correctAnswer: passageBlanks.correctAnswer,
        distractors: passageBlanks.distractors,
      })
      .from(passageQuestions)
      .innerJoin(passageBlanks, eq(passageBlanks.passageId, passageQuestions.id))
      .where(and(
        eq(passageQuestions.listId, listId),
        inArray(passageBlanks.wordId, wordIdArray)
      ));
    
    if (passageWithBlanks.length === 0 || passageWithBlanks.length !== wordIdArray.length) {
      return null;
    }
    
    // Group blanks and check if word IDs match exactly
    const foundWordIds = passageWithBlanks.map(p => p.blankWordId).sort().join(',');
    if (foundWordIds !== wordIds) {
      return null;
    }
    
    const passage = passageWithBlanks[0];
    const blanks = passageWithBlanks.map(p => ({
      id: p.blankId,
      passageId: passage.passageId,
      blankNumber: p.blankNumber,
      wordId: p.blankWordId,
      correctAnswer: p.correctAnswer,
      distractors: p.distractors,
      createdAt: new Date(), // Placeholder
    }));
    
    return {
      id: passage.passageId,
      passageText: passage.passageText,
      title: passage.title,
      blanks,
    };
  }
}

export const storage = new DatabaseStorage();