import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { aiService } from "./services/ai.js";
import { ttsService } from "./services/tts.js";
import { schedulerService } from "./services/scheduler.js";
import { insertWordSchema, insertAttemptSchema, simpleWordInputSchema } from "@shared/schema.js";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Words API
  app.get("/api/words", async (req, res) => {
    try {
      const weekId = req.query.week as string;
      
      // For parent dashboard, don't filter by week - show all words
      // The frontend can filter if needed
      const words = await storage.getWordsWithProgress();
      res.json(words);
    } catch (error) {
      console.error("Error fetching words:", error);
      res.status(500).json({ message: "Failed to fetch words" });
    }
  });

  app.post("/api/words", async (req, res) => {
    try {
      // Try simple word input first (text only), fallback to full schema
      let wordData: any;
      let isSimpleInput = false;
      
      try {
        const simpleInput = simpleWordInputSchema.parse(req.body);
        isSimpleInput = true;
        
        // Use AI to generate all missing fields
        console.log(`Processing word with AI: ${simpleInput.text}`);
        
        // Generate part of speech and definitions
        const analysis = await aiService.analyzeWord(simpleInput.text);
        
        // Generate morphology
        const morphology = await aiService.analyzeMorphology(simpleInput.text);
        
        wordData = {
          text: simpleInput.text,
          partOfSpeech: analysis.partOfSpeech,
          kidDefinition: analysis.kidDefinition,
          teacherDefinition: analysis.teacherDefinition || null,
          weekId: simpleInput.weekId || await storage.getCurrentWeek(),
          syllables: morphology.syllables,
          morphemes: morphology.morphemes,
          ipa: null, // Optional field
        };
        
      } catch (simpleParseError) {
        // Fallback to full schema validation
        wordData = insertWordSchema.parse(req.body);
        
        // If no weekId provided, use current week
        if (!wordData.weekId) {
          wordData.weekId = await storage.getCurrentWeek();
        }

        // Simplify definition if teacher definition is provided
        if (wordData.teacherDefinition && !wordData.kidDefinition) {
          const simplified = await aiService.simplifyDefinition(wordData.teacherDefinition);
          wordData.kidDefinition = simplified.definition;
        }

        // Analyze morphology
        if (!wordData.syllables || !wordData.morphemes) {
          try {
            const morphology = await aiService.analyzeMorphology(wordData.text);
            wordData.syllables = morphology.syllables;
            wordData.morphemes = morphology.morphemes;
          } catch (error) {
            console.warn("Morphology analysis failed:", error);
          }
        }
      }

      const word = await storage.createWord(wordData);
      
      // Create initial schedule
      const scheduleData = schedulerService.createInitialSchedule(word.id);
      await storage.createSchedule(scheduleData);

      // Generate initial sentences
      try {
        const sentences = await aiService.generateSentences(
          word.text,
          word.partOfSpeech,
          word.kidDefinition
        );

        for (const sentenceData of sentences) {
          if (sentenceData.isAppropriate) {
            await storage.createSentence({
              wordId: word.id,
              text: sentenceData.text,
              source: "ai",
              toxicityOk: true,
            });
          }
        }
      } catch (error) {
        console.warn("Failed to generate initial sentences:", error);
      }

      const wordWithProgress = await storage.getWordsWithProgress(word.weekId);
      const createdWord = wordWithProgress.find(w => w.id === word.id);
      
      res.json(createdWord);
    } catch (error) {
      console.error("Error creating word:", error);
      res.status(400).json({ message: "Invalid word data" });
    }
  });

  app.delete("/api/words/:id", async (req, res) => {
    try {
      await storage.deleteWord(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete word" });
    }
  });

  // Sentences API
  app.get("/api/words/:wordId/sentences", async (req, res) => {
    try {
      const sentences = await storage.getSentences(req.params.wordId);
      res.json(sentences);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sentences" });
    }
  });

  app.post("/api/words/:wordId/sentences/generate", async (req, res) => {
    try {
      const word = await storage.getWord(req.params.wordId);
      if (!word) {
        return res.status(404).json({ message: "Word not found" });
      }

      const sentences = await aiService.generateSentences(
        word.text,
        word.partOfSpeech,
        word.kidDefinition
      );

      const createdSentences = [];
      for (const sentenceData of sentences) {
        if (sentenceData.isAppropriate) {
          const sentence = await storage.createSentence({
            wordId: word.id,
            text: sentenceData.text,
            source: "ai",
            toxicityOk: true,
          });
          createdSentences.push(sentence);
        }
      }

      res.json(createdSentences);
    } catch (error) {
      console.error("Error generating sentences:", error);
      res.status(500).json({ message: "Failed to generate sentences" });
    }
  });

  // Audio API
  app.post("/api/audio/generate", async (req, res) => {
    try {
      const { text, type } = req.body;
      
      if (!text || !type) {
        return res.status(400).json({ message: "Text and type are required" });
      }

      const result = await ttsService.generateAudio({ text, type });
      
      // Store in cache
      await storage.createAudioCache({
        wordId: req.body.wordId || null,
        sentenceId: req.body.sentenceId || null,
        type,
        provider: result.provider,
        audioUrl: null, // In memory storage
        cacheKey: result.cacheKey,
        durationMs: result.duration || null,
      });

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'X-Audio-Provider': result.provider,
      });

      res.send(Buffer.from(result.audioBuffer));
    } catch (error) {
      console.error("Error generating audio:", error);
      res.status(500).json({ message: "Failed to generate audio" });
    }
  });

  app.post("/api/audio/slow", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      const result = await ttsService.generateSlowAudio(text);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'X-Audio-Provider': result.provider,
      });

      res.send(Buffer.from(result.audioBuffer));
    } catch (error) {
      console.error("Error generating slow audio:", error);
      res.status(500).json({ message: "Failed to generate slow audio" });
    }
  });

  // Study Session API
  app.get("/api/study/session", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const currentWeek = await storage.getCurrentWeek();
      
      // Only get schedules for words from the current week
      const allSchedules = await storage.getAllSchedules();
      const currentWeekWords = await storage.getWords(currentWeek);
      const currentWeekWordIds = new Set(currentWeekWords.map(w => w.id));
      const schedules = allSchedules.filter(s => currentWeekWordIds.has(s.wordId));
      
      const dueSchedules = schedulerService.getWordsForToday(schedules, limit);
      
      if (dueSchedules.length === 0) {
        return res.json({ 
          words: [], 
          currentIndex: 0, 
          totalWords: 0,
          message: "No words due for review today!" 
        });
      }

      // Only get words with progress from the current week
      const words = await storage.getWordsWithProgress(currentWeek);
      const session = schedulerService.createStudySession(dueSchedules, words);
      
      res.json(session);
    } catch (error) {
      console.error("Error creating study session:", error);
      res.status(500).json({ message: "Failed to create study session" });
    }
  });

  // Practice API
  app.post("/api/practice/attempt", async (req, res) => {
    try {
      const attemptData = insertAttemptSchema.parse(req.body);
      const attempt = await storage.createAttempt(attemptData);
      
      // Update schedule based on success
      const schedule = await storage.getSchedule(attemptData.wordId);
      if (schedule) {
        const updates = schedulerService.updateSchedule(schedule, attemptData.success || false);
        await storage.updateSchedule(schedule.id, updates);
      }

      res.json(attempt);
    } catch (error) {
      console.error("Error recording attempt:", error);
      res.status(400).json({ message: "Invalid attempt data" });
    }
  });

  // Progress API
  app.get("/api/progress", async (req, res) => {
    try {
      const weekId = req.query.week as string;
      const words = await storage.getWordsWithProgress(weekId);
      const schedules = await storage.getAllSchedules();
      
      const progress = schedulerService.calculateProgress(schedules);
      
      const wordProgress = await Promise.all(
        words.map(async (word) => {
          const stats = await storage.getAttemptStats(word.id);
          return {
            word,
            ...stats,
          };
        })
      );

      res.json({
        overall: progress,
        words: wordProgress,
      });
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ message: "Failed to fetch progress" });
    }
  });

  // Settings API
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      const setting = await storage.setSetting(key, value);
      
      // Update scheduler config if needed
      if (key === 'dailyLimit') {
        schedulerService.updateConfig({ dailyLimit: parseInt(value) });
      }
      
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Export API
  app.get("/api/export/progress", async (req, res) => {
    try {
      const words = await storage.getWordsWithProgress();
      const schedules = await storage.getAllSchedules();
      
      const exportData = {
        generatedAt: new Date().toISOString(),
        summary: schedulerService.calculateProgress(schedules),
        words: await Promise.all(
          words.map(async (word) => {
            const stats = await storage.getAttemptStats(word.id);
            return {
              word: word.text,
              partOfSpeech: word.partOfSpeech,
              definition: word.kidDefinition,
              box: word.schedule?.box || 1,
              nextReview: word.schedule?.nextDueAt,
              successRate: stats.successRate,
              totalAttempts: stats.totalAttempts,
            };
          })
        ),
      };

      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="vocabulary-progress.json"',
      });

      res.json(exportData);
    } catch (error) {
      console.error("Error exporting progress:", error);
      res.status(500).json({ message: "Failed to export progress" });
    }
  });

  // Schedule API
  app.get("/api/schedule", async (req, res) => {
    try {
      const schedules = await storage.getAllSchedules();
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.patch("/api/schedule/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const schedule = await storage.updateSchedule(id, updates);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating schedule:", error);
      res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  // Health check
  app.get("/api/health", async (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      week: await storage.getCurrentWeek(),
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
