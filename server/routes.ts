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

  // Manual word entry with teacher definition
  app.post("/api/words/manual", async (req, res) => {
    try {
      const { text, definition, weekId } = req.body;
      
      if (!text || !definition) {
        return res.status(400).json({ message: "Word text and definition are required" });
      }

      console.log(`Adding manual word: ${text} with teacher definition`);
      
      // Generate part of speech using AI but keep teacher definition
      const analysis = await aiService.analyzeWord(text);
      
      // Generate morphology
      const morphology = await aiService.analyzeMorphology(text);
      
      const wordData = {
        text: text.trim(),
        partOfSpeech: analysis.partOfSpeech,
        kidDefinition: definition.trim(), // Use teacher's definition directly
        teacherDefinition: definition.trim(),
        weekId: weekId || await storage.getCurrentWeek(),
        syllables: morphology.syllables,
        morphemes: morphology.morphemes,
        ipa: null, // Optional field
      };

      // Create word
      const word = await storage.createWord(wordData);

      // Generate sentences using the teacher's definition
      const sentences = await aiService.generateSentences(word.text, word.partOfSpeech, definition);
      
      // Add sentences to word
      if (sentences.length > 0) {
        for (const sentence of sentences) {
          await storage.createSentence({
            text: sentence.text,
            wordId: word.id,
          });
        }
      }

      // Initialize schedule
      await storage.createSchedule({
        wordId: word.id,
        box: 1,
        nextDueAt: new Date(),
        reviewCount: 0,
      });

      res.json({ 
        ...word, 
        sentences: sentences.map((s, i) => ({ id: `${word.id}-${i}`, text: s, wordId: word.id }))
      });
      
    } catch (error) {
      console.error("Error adding manual word:", error);
      res.status(500).json({ message: "Failed to add word with manual definition" });
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

  // Update word
  app.patch("/api/words/:id", async (req, res) => {
    try {
      // Validate update data
      const updateData = insertWordSchema.partial().parse(req.body);
      
      // Update word
      const updatedWord = await storage.updateWord(req.params.id, updateData);
      
      res.json(updatedWord);
    } catch (error) {
      console.error("Error updating word:", error);
      res.status(500).json({ message: "Failed to update word" });
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

  // Audio API with ElevenLabs word timings
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

      // For sentences with word timings, return JSON with timing data
      if (type === "sentence" && result.wordTimings) {
        console.log(`Generated ${result.wordTimings.length} word timings from ElevenLabs for text: "${text.substring(0, 50)}..."`);
        
        const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
        return res.json({
          audioData: `data:audio/mpeg;base64,${base64Audio}`,
          wordTimings: result.wordTimings,
          duration: Math.max(...result.wordTimings.map(w => w.endTimeMs)) / 1000, // Duration in seconds
          provider: result.provider
        });
      }

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
      
      // Get words from current week only
      let currentWeekWords = await storage.getWords(currentWeek);
      let activeWeek = currentWeek;
      
      // If no words in current week, look at the previous week (common case when day changes)
      if (currentWeekWords.length === 0) {
        // Calculate previous week
        const now = new Date();
        const year = now.getFullYear();
        const currentWeekNumber = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        const previousWeekNumber = currentWeekNumber - 1;
        const previousWeek = `${year}-W${previousWeekNumber.toString().padStart(2, '0')}`;
        
        console.log(`No words found in current week ${currentWeek}, checking previous week ${previousWeek}`);
        currentWeekWords = await storage.getWords(previousWeek);
        activeWeek = previousWeek;
        
        // If still no words, get all words regardless of week (fallback for migration cases)
        if (currentWeekWords.length === 0) {
          console.log(`No words found in previous week ${previousWeek}, getting all words`);
          currentWeekWords = await storage.getWords();
          activeWeek = "all";
        }
      }
      
      const currentWeekWordIds = currentWeekWords.map(word => word.id);
      
      // Get all schedules and filter to active words only
      const allSchedules = await storage.getAllSchedules();
      const currentWeekSchedules = allSchedules.filter(schedule => 
        currentWeekWordIds.includes(schedule.wordId)
      );
      
      let dueSchedules = schedulerService.getWordsForToday(currentWeekSchedules, limit);
      
      // If no words are due today, include all words from active week for initial learning
      if (dueSchedules.length === 0) {
        // Get all words from active week that are in box 1-3 (still learning)
        dueSchedules = currentWeekSchedules.filter(schedule => schedule.box <= 3).slice(0, limit || 12);
        
        if (dueSchedules.length === 0) {
          return res.json({ 
            words: [], 
            currentIndex: 0, 
            totalWords: 0,
            message: "No words to practice! Add some words to this week first." 
          });
        }
      }

      // Get words with progress for active week
      const words = activeWeek === "all" ? 
        await storage.getWordsWithProgress() : 
        await storage.getWordsWithProgress(activeWeek);
      const session = schedulerService.createStudySession(dueSchedules, words);
      
      console.log(`Created study session with ${session.words.length} words from ${activeWeek}`);
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

  // Quiz distractor generation API
  app.post("/api/quiz/distractors", async (req, res) => {
    try {
      const { word, definition, partOfSpeech } = req.body;
      
      if (!word || !definition || !partOfSpeech) {
        return res.status(400).json({ message: "Word, definition, and part of speech are required" });
      }

      const distractors = await aiService.generateQuizDistractors(word, definition, partOfSpeech);
      
      res.json(distractors);
    } catch (error) {
      console.error("Error generating quiz distractors:", error);
      res.status(500).json({ message: "Failed to generate quiz distractors" });
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
