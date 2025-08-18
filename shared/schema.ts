import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), // "meaning" | "spelling" | "pronunciation"
  success: boolean("success"),
  errorType: text("error_type"), // "meaning" | "spelling" | "morph" | "pron"
  responseData: jsonb("response_data"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const schedule = pgTable("schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

// Insert schemas
export const insertWordSchema = createInsertSchema(words).omit({
  id: true,
  createdAt: true,
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

// Types
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
