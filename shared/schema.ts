import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Authentication and user management tables
// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table (instructors, parents, tutors)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").notNull().default("instructor"), // "instructor" | "parent" | "admin"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Students table (children managed by instructors/parents)
export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  displayName: varchar("display_name"), // What they see on screen
  pin: varchar("pin", { length: 4 }), // Simple 4-digit PIN for login
  instructorId: varchar("instructor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  grade: varchar("grade"), // Grade level for content adaptation
  birthMonth: integer("birth_month"), // For COPPA compliance (no full birthday)
  birthYear: integer("birth_year"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const words = pgTable("words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  partOfSpeech: text("part_of_speech").notNull(),
  teacherDefinition: text("teacher_definition"),
  kidDefinition: text("kid_definition").notNull(),
  syllables: text("syllables").array(),
  morphemes: text("morphemes").array(),
  ipa: text("ipa"),
  weekId: varchar("week_id").notNull(),
  instructorId: varchar("instructor_id").references(() => users.id, { onDelete: "cascade" }), // Words belong to instructor (nullable for migration)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sentences = pgTable("sentences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  source: text("source").notNull().default("ai"), // "ai" | "user"
  toxicityOk: boolean("toxicity_ok").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const audioCache = pgTable("audio_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").references(() => words.id, { onDelete: "cascade" }),
  sentenceId: varchar("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "word" | "sentence"
  provider: text("provider").notNull(), // "elevenlabs" | "openai"
  audioUrl: text("audio_url"),
  cacheKey: text("cache_key").notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attempts = pgTable("attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }), // Attempts belong to student (nullable for migration)
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), // "meaning" | "spelling" | "pronunciation"
  success: boolean("success"),
  errorType: text("error_type"), // "meaning" | "spelling" | "morph" | "pron"
  responseData: jsonb("response_data"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const schedule = pgTable("schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }), // Schedule per student (nullable for migration)
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  box: integer("box").notNull().default(1), // Leitner box 1-5
  nextDueAt: timestamp("next_due_at").notNull(),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cloze quiz questions (Section 1: dual sentences with same word)
export const clozeQuestions = pgTable("cloze_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  sentence1: text("sentence1").notNull(), // First sentence with blank
  sentence2: text("sentence2").notNull(), // Second sentence with blank
  correctAnswer: text("correct_answer").notNull(), // The target word
  distractors: text("distractors").array().notNull(), // 3 wrong answers
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Passage quiz questions (Section 2: reading passage with multiple blanks)
export const passageQuestions = pgTable("passage_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weekId: varchar("week_id").notNull(), // Links to a week of vocabulary
  passageText: text("passage_text").notNull(), // The reading passage with numbered blanks
  title: text("title"), // Optional passage title
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Individual blanks within passage questions
export const passageBlanks = pgTable("passage_blanks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  passageId: varchar("passage_id").notNull().references(() => passageQuestions.id, { onDelete: "cascade" }),
  blankNumber: integer("blank_number").notNull(), // 7, 8, 9, 10, 11, 12 etc.
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  correctAnswer: text("correct_answer").notNull(), // The target word
  distractors: text("distractors").array().notNull(), // 3 wrong answers
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Quiz attempts for new format
export const quizAttempts = pgTable("quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }), // Quiz attempts per student (nullable for migration)
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  quizType: text("quiz_type").notNull(), // 'cloze' or 'passage'
  questionId: varchar("question_id"), // References clozeQuestions.id or passageBlanks.id
  selectedAnswer: text("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  responseTimeMs: integer("response_time_ms"),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWordSchema = createInsertSchema(words).omit({
  id: true,
  createdAt: true,
});

// Simplified word input schema for AI processing
export const simpleWordInputSchema = z.object({
  text: z.string().min(1).trim(),
  weekId: z.string().optional(),
});

export const insertSentenceSchema = createInsertSchema(sentences).omit({
  id: true,
  createdAt: true,
});

export const insertAttemptSchema = createInsertSchema(attempts).omit({
  id: true,
  timestamp: true,
});

export const insertScheduleSchema = createInsertSchema(schedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClozeQuestionSchema = createInsertSchema(clozeQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertPassageQuestionSchema = createInsertSchema(passageQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertPassageBlankSchema = createInsertSchema(passageBlanks).omit({
  id: true,
  createdAt: true,
});

export const insertQuizAttemptSchema = createInsertSchema(quizAttempts).omit({
  id: true,
  attemptedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert; // For Replit Auth compatibility
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Word = typeof words.$inferSelect;
export type InsertWord = z.infer<typeof insertWordSchema>;
export type Sentence = typeof sentences.$inferSelect;
export type InsertSentence = z.infer<typeof insertSentenceSchema>;
export type AudioCache = typeof audioCache.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Schedule = typeof schedule.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Settings = typeof settings.$inferSelect;
export type ClozeQuestion = typeof clozeQuestions.$inferSelect;
export type InsertClozeQuestion = z.infer<typeof insertClozeQuestionSchema>;
export type PassageQuestion = typeof passageQuestions.$inferSelect;
export type InsertPassageQuestion = z.infer<typeof insertPassageQuestionSchema>;
export type PassageBlank = typeof passageBlanks.$inferSelect;
export type InsertPassageBlank = z.infer<typeof insertPassageBlankSchema>;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;

// Extended types for frontend
export interface WordWithProgress extends Word {
  schedule?: Schedule;
  attempts?: Attempt[];
  sentences?: Sentence[];
  audioCache?: AudioCache[];
}

export interface StudySession {
  words: WordWithProgress[];
  currentIndex: number;
  totalWords: number;
  sessionStarted: Date;
}

// Quiz-related interfaces
export interface ClozeQuizSession {
  questions: (ClozeQuestion & { choices: string[] })[];
  currentIndex: number;
  totalQuestions: number;
}

export interface PassageQuizSession {
  passage: PassageQuestion;
  blanks: (PassageBlank & { choices: string[] })[];
  currentBlankIndex: number;
  totalBlanks: number;
}

export interface QuizChoice {
  text: string;
  isCorrect: boolean;
}
