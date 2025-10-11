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
}, (table) => [
  index("idx_students_instructor_id").on(table.instructorId),
  index("idx_students_pin").on(table.pin),
]);

// Vocabulary lists (named collections of words)
export const vocabularyLists = pgTable("vocabulary_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  instructorId: varchar("instructor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isCurrent: boolean("is_current").notNull().default(false), // Only one can be current per instructor
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vocabulary_lists_instructor_id").on(table.instructorId),
  index("idx_vocabulary_lists_is_current").on(table.isCurrent, table.instructorId),
]);

export const words = pgTable("words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  partOfSpeech: text("part_of_speech").notNull(),
  teacherDefinition: text("teacher_definition"),
  kidDefinition: text("kid_definition").notNull(),
  syllables: text("syllables").array(),
  morphemes: text("morphemes").array(),
  ipa: text("ipa"),
  listId: varchar("list_id").references(() => vocabularyLists.id, { onDelete: "cascade" }), // Optional during transition
  instructorId: varchar("instructor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_words_list_id").on(table.listId),
  index("idx_words_instructor_id").on(table.instructorId),
  index("idx_words_list_instructor").on(table.listId, table.instructorId),
]);

export const sentences = pgTable("sentences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  source: text("source").notNull().default("ai"), // "ai" | "user"
  toxicityOk: boolean("toxicity_ok").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_sentences_word_id").on(table.wordId),
]);

export const audioCache = pgTable("audio_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").references(() => words.id, { onDelete: "cascade" }),
  sentenceId: varchar("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "word" | "sentence"
  provider: text("provider").notNull(), // "elevenlabs" | "openai"
  audioUrl: text("audio_url"), // URL for file system storage
  audioData: text("audio_data"), // Base64 encoded audio data (legacy)
  cacheKey: text("cache_key").notNull(), // Content-based hash for deduplication
  contentHash: varchar("content_hash", { length: 64 }), // SHA-256 hash of normalized content
  filePath: text("file_path"), // Persistent file system path
  fileSize: integer("file_size"), // File size in bytes for cleanup
  durationMs: integer("duration_ms"),
  wordTimings: jsonb("word_timings"), // Store word timing data for sentences
  hitCount: integer("hit_count").notNull().default(0), // Track cache usage for cleanup
  lastAccessedAt: timestamp("last_accessed_at").defaultNow().notNull(), // Track access for cleanup
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Optimize cache lookups - this is the most critical index
  index("idx_audio_cache_key").on(table.cacheKey),
  // Optimize deduplication lookups
  index("idx_audio_cache_content_hash").on(table.contentHash),
  // Optimize cleanup queries
  index("idx_audio_cache_cleanup").on(table.lastAccessedAt, table.hitCount),
  // Optimize provider-based queries
  index("idx_audio_cache_provider_type").on(table.provider, table.type),
  // Optimize word/sentence association lookups
  index("idx_audio_cache_word_id").on(table.wordId),
  index("idx_audio_cache_sentence_id").on(table.sentenceId),
]);

export const attempts = pgTable("attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }), // Attempts belong to student (nullable for migration)
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), // "meaning" | "spelling" | "pronunciation"
  success: boolean("success"),
  errorType: text("error_type"), // "meaning" | "spelling" | "morph" | "pron"
  responseData: jsonb("response_data"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_attempts_word_id").on(table.wordId),
  index("idx_attempts_student_id").on(table.studentId),
  index("idx_attempts_word_student").on(table.wordId, table.studentId),
]);

export const schedule = pgTable("schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }), // Schedule per student (nullable for migration)
  wordId: varchar("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
  box: integer("box").notNull().default(1), // Leitner box 1-5
  nextDueAt: timestamp("next_due_at").notNull(),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_schedule_word_id").on(table.wordId),
  index("idx_schedule_student_id").on(table.studentId),
  index("idx_schedule_word_student").on(table.wordId, table.studentId),
  index("idx_schedule_next_due").on(table.nextDueAt),
]);

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OBSERVABILITY SYSTEM TABLES

// Performance Metrics - tracks API response times, audio generation, quiz metrics
export const performanceMetrics = pgTable("performance_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricType: text("metric_type").notNull(), // 'api_endpoint', 'audio_generation', 'quiz_generation', 'database_query'
  operation: text("operation").notNull(), // endpoint path or operation name
  durationMs: integer("duration_ms").notNull(),
  status: text("status").notNull(), // 'success', 'error', 'timeout'
  payloadSize: integer("payload_size"), // bytes for requests/responses
  cacheHit: boolean("cache_hit"), // for audio/quiz cache tracking
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "set null" }),
  correlationId: varchar("correlation_id"), // for request tracing
  errorType: text("error_type"), // classification of errors
  metadata: jsonb("metadata"), // flexible additional data
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_perf_metrics_type_operation").on(table.metricType, table.operation),
  index("idx_perf_metrics_created_at").on(table.createdAt),
  index("idx_perf_metrics_correlation_id").on(table.correlationId),
  index("idx_perf_metrics_status").on(table.status),
]);

// Structured Logs - comprehensive logging with correlation IDs
export const structuredLogs = pgTable("structured_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").notNull(), // 'debug', 'info', 'warn', 'error', 'critical'
  message: text("message").notNull(),
  service: text("service").notNull(), // 'api', 'audio', 'quiz', 'database', 'auth'
  operation: text("operation"), // specific operation within service
  correlationId: varchar("correlation_id"), // traces requests across services
  sessionId: varchar("session_id"), // student/instructor session tracking
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "set null" }),
  context: jsonb("context"), // structured context data
  errorStack: text("error_stack"), // full stack traces for errors
  httpMethod: text("http_method"), // GET, POST, etc.
  httpPath: text("http_path"), // API endpoint path
  httpStatus: integer("http_status"), // response status code
  userAgent: text("user_agent"), // for debugging client issues
  ipAddress: varchar("ip_address"), // for network debugging
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_logs_level_created_at").on(table.level, table.createdAt),
  index("idx_logs_correlation_id").on(table.correlationId),
  index("idx_logs_session_id").on(table.sessionId),
  index("idx_logs_service_operation").on(table.service, table.operation),
  index("idx_logs_error_stack").on(table.errorStack),
]);

// System Health Metrics - tracks overall system health over time
export const systemHealthMetrics = pgTable("system_health_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  overallHealth: text("overall_health").notNull(), // 'healthy', 'degraded', 'critical'
  activeStudents: integer("active_students").notNull().default(0),
  activeSessions: integer("active_sessions").notNull().default(0),
  apiResponseTime: integer("api_response_time"), // average ms
  databaseResponseTime: integer("database_response_time"), // average ms
  audioGenerationTime: integer("audio_generation_time"), // average ms
  quizGenerationTime: integer("quiz_generation_time"), // average ms
  cacheHitRatio: integer("cache_hit_ratio"), // percentage (0-100)
  errorRate: integer("error_rate"), // errors per minute
  circuitBreakerStatus: jsonb("circuit_breaker_status"), // all breaker states
  serviceStatus: jsonb("service_status"), // external service health
  memoryUsage: integer("memory_usage"), // MB
  cpuUsage: integer("cpu_usage"), // percentage
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_system_health_created_at").on(table.createdAt),
  index("idx_system_health_overall").on(table.overallHealth),
]);

// Student Session Tracking - detailed session monitoring for debugging
export const studentSessions = pgTable("student_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().unique(), // unique session identifier
  studentId: varchar("student_id").references(() => students.id, { onDelete: "cascade" }),
  instructorId: varchar("instructor_id").references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // 'active', 'idle', 'disconnected', 'ended'
  loginTime: timestamp("login_time").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"), // browser, OS, etc.
  activityCount: integer("activity_count").notNull().default(0), // number of actions
  wordsStudied: integer("words_studied").notNull().default(0),
  quizzesCompleted: integer("quizzes_completed").notNull().default(0),
  audioPlayed: integer("audio_played").notNull().default(0),
  totalDurationMs: integer("total_duration_ms").notNull().default(0),
  networkLatency: integer("network_latency"), // average ms
  errors: integer("errors").notNull().default(0), // error count in session
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("idx_student_sessions_student_id").on(table.studentId),
  index("idx_student_sessions_status").on(table.status),
  index("idx_student_sessions_login_time").on(table.loginTime),
  index("idx_student_sessions_last_activity").on(table.lastActivity),
]);

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
  weekId: varchar("week_id"), // Legacy field from week-based system, now nullable
  listId: varchar("list_id").references(() => vocabularyLists.id, { onDelete: "cascade" }), // Links to a vocabulary list (optional during transition)
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

export const insertVocabularyListSchema = createInsertSchema(vocabularyLists).omit({
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
  listId: z.string().optional(),
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

// Observability insert schemas
export const insertPerformanceMetricSchema = createInsertSchema(performanceMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertStructuredLogSchema = createInsertSchema(structuredLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSystemHealthMetricSchema = createInsertSchema(systemHealthMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertStudentSessionSchema = createInsertSchema(studentSessions).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert; // For Replit Auth compatibility
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type VocabularyList = typeof vocabularyLists.$inferSelect;
export type InsertVocabularyList = z.infer<typeof insertVocabularyListSchema>;
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

// Observability types
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = z.infer<typeof insertPerformanceMetricSchema>;
export type StructuredLog = typeof structuredLogs.$inferSelect;
export type InsertStructuredLog = z.infer<typeof insertStructuredLogSchema>;
export type SystemHealthMetric = typeof systemHealthMetrics.$inferSelect;
export type InsertSystemHealthMetric = z.infer<typeof insertSystemHealthMetricSchema>;
export type StudentSession = typeof studentSessions.$inferSelect;
export type InsertStudentSession = z.infer<typeof insertStudentSessionSchema>;

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
