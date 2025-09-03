import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { aiService } from "./services/ai.js";
import { ttsService } from "./services/tts.js";
import { schedulerService } from "./services/scheduler.js";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertWordSchema, insertAttemptSchema, simpleWordInputSchema, insertVocabularyListSchema } from "@shared/schema.js";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Student management routes
  app.get('/api/students', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const students = await storage.getStudentsByInstructor(userId);
      res.json(students);
    } catch (error) {
      console.error("Error fetching students:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.post('/api/students', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, displayName, grade, birthMonth, birthYear } = req.body;
      
      if (!firstName) {
        return res.status(400).json({ message: "First name is required" });
      }

      // Generate a unique 4-digit PIN
      let pin: string;
      let existingStudent;
      do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
        existingStudent = await storage.getStudentByPin(pin, userId);
      } while (existingStudent);

      const student = await storage.createStudent({
        firstName,
        lastName,
        displayName: displayName || firstName,
        pin,
        instructorId: userId,
        grade,
        birthMonth,
        birthYear,
        isActive: true,
      });

      res.json(student);
    } catch (error) {
      console.error("Error creating student:", error);
      res.status(500).json({ message: "Failed to create student" });
    }
  });

  // Student authentication route (PIN-based login)
  app.post('/api/student-login', async (req, res) => {
    try {
      const { pin, instructorId } = req.body;
      
      if (!pin) {
        return res.status(400).json({ message: "PIN is required" });
      }

      // For demo purposes, create a test student if PIN is 1234
      if (pin === "1234") {
        res.json({ 
          student: {
            id: "demo-student",
            firstName: "Test",
            lastName: "Student",
            displayName: "Test Student",
            pin: "1234",
            instructorId: "demo-instructor",
            grade: 3,
            isActive: true
          }, 
          success: true 
        });
        return;
      }

      // Try to find student by PIN across all instructors
      const student = await storage.getStudentByPin(pin);
      
      if (!student || !student.isActive) {
        return res.status(401).json({ message: "Invalid PIN or inactive student" });
      }

      res.json({ student, success: true });
    } catch (error) {
      console.error("Error during student login:", error);
      res.status(500).json({ message: "Failed to authenticate student" });
    }
  });

  // Vocabulary List API (instructor-scoped)
  app.get('/api/vocabulary-lists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const lists = await storage.getVocabularyLists(userId);
      res.json(lists);
    } catch (error) {
      console.error("Error fetching vocabulary lists:", error);
      res.status(500).json({ message: "Failed to fetch vocabulary lists" });
    }
  });

  app.get('/api/vocabulary-lists/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentList = await storage.getCurrentVocabularyList(userId);
      res.json(currentList);
    } catch (error) {
      console.error("Error fetching current vocabulary list:", error);
      res.status(500).json({ message: "Failed to fetch current vocabulary list" });
    }
  });

  app.post('/api/vocabulary-lists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const listData = insertVocabularyListSchema.parse({
        ...req.body,
        instructorId: userId,
        isCurrent: false // New lists start as not current
      });
      
      const list = await storage.createVocabularyList(listData);
      res.json(list);
    } catch (error) {
      console.error("Error creating vocabulary list:", error);
      res.status(500).json({ message: "Failed to create vocabulary list" });
    }
  });

  app.post('/api/vocabulary-lists/:id/set-current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const listId = req.params.id;
      
      await storage.setCurrentVocabularyList(userId, listId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting current vocabulary list:", error);
      res.status(500).json({ message: "Failed to set current vocabulary list" });
    }
  });

  // Import vocabulary list with words
  app.post('/api/vocabulary-lists/import', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { listName, words } = req.body;

      if (!listName || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ message: "List name and words are required" });
      }

      // Create vocabulary list
      const listData = {
        name: listName,
        instructorId: userId,
        isCurrent: true // New imported lists become current
      };

      // Set all other lists to not current first
      const currentLists = await storage.getVocabularyLists(userId);
      for (const existingList of currentLists) {
        if (existingList.isCurrent) {
          await storage.updateVocabularyList(existingList.id, { isCurrent: false });
        }
      }
      
      const list = await storage.createVocabularyList(listData);
      let wordsCreated = 0;

      // Add words to the list
      for (const wordData of words) {
        try {
          // Use AI service to get simplified definition and other data
          const aiData = await aiService.processWordDefinition(
            wordData.text,
            wordData.partOfSpeech,
            wordData.definitions.join('; ')
          );

          const word = await storage.createWord({
            text: wordData.text.toLowerCase(),
            partOfSpeech: aiData.partOfSpeech,
            teacherDefinition: wordData.definitions[0], // Use first definition as teacher definition
            kidDefinition: aiData.kidDefinition,
            syllables: aiData.syllables,
            morphemes: aiData.morphemes,
            instructorId: userId,
            listId: list.id
          });

          // Create initial schedule for word
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
            console.warn(`Failed to generate sentences for word ${word.text}:`, error);
          }

          wordsCreated++;
        } catch (error) {
          console.error(`Failed to process word ${wordData.text}:`, error);
        }
      }

      res.json({
        listId: list.id,
        listName: list.name,
        wordsCreated
      });
    } catch (error) {
      console.error("Error importing vocabulary list:", error);
      res.status(500).json({ message: "Failed to import vocabulary list" });
    }
  });
  
  // Words API (now list-scoped instead of week-scoped)
  app.get("/api/words", isAuthenticated, async (req: any, res) => {
    try {
      const listId = req.query.list as string;
      const studentId = req.query.student as string;
      const userId = req.user.claims.sub;
      
      // Get words for this instructor, optionally filtered by list and student
      const words = await storage.getWordsWithProgress(listId, userId, studentId);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words:", error);
      res.status(500).json({ message: "Failed to fetch words" });
    }
  });

  // Student words API (no auth required - uses student ID)
  app.get("/api/student/:studentId/words", async (req, res) => {
    try {
      const { studentId } = req.params;
      const listId = req.query.list as string;
      
      // Get student to verify they exist
      const student = await storage.getStudent(studentId);
      if (!student || !student.isActive) {
        return res.status(404).json({ message: "Student not found or inactive" });
      }

      console.log(`Student API: Student ${studentId} accessing global vocabulary`);

      // If no listId provided, get the most recent vocabulary list globally
      let targetListId = listId;
      let targetInstructorId = student.instructorId; // Default to student's instructor
      
      if (!targetListId) {
        const globalCurrentList = await storage.getGlobalCurrentVocabularyList();
        console.log(`Student API: Global current list:`, globalCurrentList);
        if (globalCurrentList) {
          targetListId = globalCurrentList.id;
          targetInstructorId = globalCurrentList.instructorId; // Use the list owner's instructor ID
        }
      }

      console.log(`Student API: Using targetListId: ${targetListId}, instructorId: ${targetInstructorId}`);

      // Get words from the global current list (may be from any instructor)
      const words = await storage.getWordsWithProgress(targetListId, targetInstructorId, studentId);
      console.log(`Student API: Found ${words.length} words for list ${targetListId}, instructor ${targetInstructorId}`);
      
      res.json(words);
    } catch (error) {
      console.error("Error fetching student words:", error);
      res.status(500).json({ message: "Failed to fetch words" });
    }
  });

  // Manual word entry with teacher definition
  app.post("/api/words/manual", isAuthenticated, async (req: any, res) => {
    try {
      const { text, definition, listId } = req.body;
      const userId = req.user.claims.sub;
      
      if (!text || !definition) {
        return res.status(400).json({ message: "Word text and definition are required" });
      }

      console.log(`Adding manual word: ${text} with teacher definition`);
      
      // If no listId provided, get or create current list
      let targetListId = listId;
      if (!targetListId) {
        const currentList = await storage.getCurrentVocabularyList(userId);
        if (currentList) {
          targetListId = currentList.id;
        } else {
          // Create a default current list
          const defaultList = await storage.createVocabularyList({
            name: `Words - ${new Date().toLocaleDateString()}`,
            instructorId: userId,
            isCurrent: true
          });
          targetListId = defaultList.id;
        }
      }
      
      // Generate part of speech using AI but keep teacher definition
      const analysis = await aiService.analyzeWord(text);
      
      // Generate morphology
      const morphology = await aiService.analyzeMorphology(text);
      
      const wordData = {
        text: text.trim(),
        partOfSpeech: analysis.partOfSpeech,
        kidDefinition: definition.trim(), // Use teacher's definition directly
        teacherDefinition: definition.trim(),
        listId: targetListId,
        instructorId: userId, // Associate word with instructor
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
        
        // Handle listId (get current list or create one if needed)
        let targetListId = simpleInput.listId;
        if (!targetListId) {
          // For unauthenticated requests, we need to get the instructor ID
          // This will be handled by requiring authentication for word creation
          throw new Error("List ID is required for word creation");
        }
        
        wordData = {
          text: simpleInput.text,
          partOfSpeech: analysis.partOfSpeech,
          kidDefinition: analysis.kidDefinition,
          teacherDefinition: analysis.teacherDefinition || null,
          listId: targetListId,
          syllables: morphology.syllables,
          morphemes: morphology.morphemes,
          ipa: null, // Optional field
        };
        
      } catch (simpleParseError) {
        // Fallback to full schema validation
        wordData = insertWordSchema.parse(req.body);
        
        // If no listId provided, this endpoint now requires it
        if (!wordData.listId) {
          throw new Error("List ID is required for word creation");
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

      const wordWithProgress = await storage.getWordsWithProgress(word.listId || undefined);
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

      // First, generate the cache key to check for pre-cached audio
      const cacheKey = ttsService.generateCacheKey({ text, type });
      const cachedAudio = await storage.getAudioCache(cacheKey);
      
      if (cachedAudio) {
        console.log(`Using pre-cached audio for ${type}: "${text.substring(0, 50)}..."`);
        
        // If it's a sentence and we have cached timings, we need to regenerate for word timings
        // For now, we'll regenerate sentences with timing data since the cache doesn't store the timings
        if (type === "sentence") {
          // Re-generate to get word timings (this is a limitation we can improve later)
          const result = await ttsService.generateAudio({ text, type });
          
          const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
          return res.json({
            audioData: `data:audio/mpeg;base64,${base64Audio}`,
            wordTimings: result.wordTimings || [],
            duration: result.wordTimings ? Math.max(...result.wordTimings.map(w => w.endTimeMs)) / 1000 : null,
            provider: result.provider
          });
        }
        
        // For word definitions, we can use cached audio directly
        // Generate fresh audio for consistent response format
      }

      const result = await ttsService.generateAudio({ text, type });
      
      // Store in cache if not already cached
      if (!cachedAudio) {
        try {
          await storage.createAudioCache({
            wordId: req.body.wordId || null,
            sentenceId: req.body.sentenceId || null,
            type,
            provider: result.provider,
            audioUrl: null, // In memory storage
            cacheKey: result.cacheKey,
            durationMs: result.duration || null,
          });
        } catch (error) {
          // Don't fail if caching fails - cache entry might already exist
          console.log(`Cache entry may already exist for ${type}: "${text.substring(0, 30)}..."`);
        }
      }

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
        'X-Cache-Status': cachedAudio ? 'pre-cached' : 'generated',
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

  // Audio Pre-caching API
  app.post("/api/audio/precache", async (req, res) => {
    try {
      const { listId, instructorId } = req.body;
      
      if (!listId || !instructorId) {
        return res.status(400).json({ message: "List ID and instructor ID are required" });
      }

      console.log(`Starting audio pre-caching for list ${listId} (instructor: ${instructorId})`);

      // Get all words from the vocabulary list
      const words = await storage.getWords(listId, instructorId);
      const cachePromises: Promise<any>[] = [];

      for (const word of words) {
        // Pre-cache word definition audio
        cachePromises.push(
          ttsService.generateAudio({ 
            text: word.kidDefinition, 
            type: "word" 
          }).then(result => {
            return storage.createAudioCache({
              wordId: word.id,
              sentenceId: null,
              type: "word",
              provider: result.provider,
              audioUrl: null,
              cacheKey: result.cacheKey,
              durationMs: result.duration || null,
            });
          }).catch(error => {
            console.error(`Failed to pre-cache word ${word.text} definition:`, error);
          })
        );

        // Get sentences for this word and pre-cache them
        const sentences = await storage.getSentences(word.id);
        for (const sentence of sentences) {
          cachePromises.push(
            ttsService.generateAudio({ 
              text: sentence.text, 
              type: "sentence" 
            }).then(result => {
              return storage.createAudioCache({
                wordId: word.id,
                sentenceId: sentence.id,
                type: "sentence", 
                provider: result.provider,
                audioUrl: null,
                cacheKey: result.cacheKey,
                durationMs: result.duration || null,
              });
            }).catch(error => {
              console.error(`Failed to pre-cache sentence for word ${word.text}:`, error);
            })
          );
        }
      }

      // Wait for all pre-caching to complete
      await Promise.allSettled(cachePromises);
      
      console.log(`Completed audio pre-caching for ${words.length} words with ${cachePromises.length} total audio files`);
      
      res.json({ 
        message: "Audio pre-caching completed", 
        wordsCount: words.length,
        audioFilesCount: cachePromises.length
      });
    } catch (error) {
      console.error("Error pre-caching audio:", error);
      res.status(500).json({ message: "Failed to pre-cache audio" });
    }
  });

  // Study Session API
  app.get("/api/study/session", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const quizMode = req.query.quiz === 'true'; // Check if this is for quiz (need all words)
      const instructorId = req.query.instructor as string;
      const listId = req.query.list as string;
      
      console.log(`Study Session API: instructor=${instructorId}, quiz=${quizMode}, limit=${limit}, listId=${listId}`);
      
      // Note: instructorId still required for student progress tracking but will use global vocabulary

      // Get global current vocabulary list (most recent across all instructors)
      let targetListId = listId;
      let targetInstructorId = instructorId; // Default but may change
      
      if (!targetListId) {
        const globalCurrentList = await storage.getGlobalCurrentVocabularyList();
        if (!globalCurrentList) {
          return res.status(404).json({ message: "No vocabulary list found" });
        }
        targetListId = globalCurrentList.id;
        targetInstructorId = globalCurrentList.instructorId; // Use the list owner's instructor ID
      }
      
      // Get words from global current vocabulary list
      const currentListWords = await storage.getWords(targetListId, targetInstructorId);
      
      // For quiz mode, include ALL words from the list regardless of schedule
      if (quizMode) {
        const words = await storage.getWordsWithProgress(targetListId, targetInstructorId);
        
        const session = {
          words: words,
          currentIndex: 0,
          totalWords: words.length,
          sessionStarted: new Date(),
        };
        
        console.log(`Created quiz session with ${session.words.length} words from list ${targetListId} (instructor: ${targetInstructorId})`);
        res.json(session);
        return;
      }
      
      // Regular study mode - use spaced repetition scheduling
      const currentListWordIds = currentListWords.map(word => word.id);
      
      // Get all schedules and filter to active words only
      const allSchedules = await storage.getAllSchedules();
      console.log(`Debug: Found ${allSchedules.length} total schedules`);
      
      const currentListSchedules = allSchedules.filter(schedule => 
        currentListWordIds.includes(schedule.wordId)
      );
      console.log(`Debug: Found ${currentListSchedules.length} schedules for current list (${currentListWordIds.length} words)`);
      
      let dueSchedules = schedulerService.getWordsForToday(currentListSchedules, limit);
      console.log(`Debug: Found ${dueSchedules.length} due schedules`);
      
      // If we have very few words due (less than 3), expand to include more words for better practice
      if (dueSchedules.length < 3 && currentListSchedules.length > dueSchedules.length) {
        // Add more words from active list that are in box 1-4 (still learning or need reinforcement)
        const additionalWords = currentListSchedules
          .filter(schedule => schedule.box <= 4 && !dueSchedules.find(d => d.wordId === schedule.wordId))
          .slice(0, Math.min(12, (limit || 12) - dueSchedules.length));
        
        dueSchedules = [...dueSchedules, ...additionalWords];
      }
      
      // If still no words, include all words from active list for initial learning
      if (dueSchedules.length === 0) {
        // Get all words from active list that are in box 1-3 (still learning)
        dueSchedules = currentListSchedules.filter(schedule => schedule.box <= 3).slice(0, limit || 12);
        
        if (dueSchedules.length === 0) {
          return res.json({ 
            words: [], 
            currentIndex: 0, 
            totalWords: 0,
            message: "No words to practice! Add some words to this vocabulary list first." 
          });
        }
      }

      // Get words with progress for active list
      const words = await storage.getWordsWithProgress(targetListId, targetInstructorId);
      const session = schedulerService.createStudySession(dueSchedules, words);
      
      // Trigger audio pre-caching in the background for improved performance
      // This will pre-generate audio for all words in the current vocabulary list
      (async () => {
        try {
          console.log(`Starting background audio pre-caching for list ${targetListId}`);
          const allListWords = await storage.getWords(targetListId, targetInstructorId);
          const cachePromises: Promise<any>[] = [];

          for (const word of allListWords) {
            // Pre-cache word definition audio
            cachePromises.push(
              ttsService.generateAudio({ text: word.kidDefinition, type: "word" })
                .then(result => storage.createAudioCache({
                  wordId: word.id,
                  sentenceId: null,
                  type: "word",
                  provider: result.provider,
                  audioUrl: null,
                  cacheKey: result.cacheKey,
                  durationMs: result.duration || null,
                }))
                .catch(error => console.error(`Pre-cache failed for word ${word.text}:`, error))
            );

            // Pre-cache sentences
            const sentences = await storage.getSentences(word.id);
            for (const sentence of sentences) {
              cachePromises.push(
                ttsService.generateAudio({ text: sentence.text, type: "sentence" })
                  .then(result => storage.createAudioCache({
                    wordId: word.id,
                    sentenceId: sentence.id,
                    type: "sentence",
                    provider: result.provider,
                    audioUrl: null,
                    cacheKey: result.cacheKey,
                    durationMs: result.duration || null,
                  }))
                  .catch(error => console.error(`Pre-cache failed for sentence in word ${word.text}:`, error))
              );
            }
          }

          await Promise.allSettled(cachePromises);
          console.log(`Background pre-caching completed for ${allListWords.length} words (${cachePromises.length} audio files)`);
        } catch (error) {
          console.error("Background audio pre-caching failed:", error);
        }
      })(); // Execute immediately but don't wait for it
      
      console.log(`Created study session with ${session.words.length} words from list ${targetListId}`);
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

  // Quiz distractor generation API (legacy)
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

  // Generate cloze quiz questions (Section 1: dual sentences)
  app.post("/api/quiz/cloze/generate", async (req, res) => {
    try {
      const { words } = req.body; // Array of word objects with text, partOfSpeech, definition
      
      if (!words || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ message: "Words array is required" });
      }

      const clozeQuestions = [];
      
      for (const wordData of words) {
        const { text, partOfSpeech, kidDefinition, id } = wordData;
        
        try {
          const question = await aiService.generateClozeQuestion(text, partOfSpeech, kidDefinition);
          
          // Save to database
          const savedQuestion = await storage.createClozeQuestion({
            wordId: id,
            sentence1: question.sentence1,
            sentence2: question.sentence2,
            correctAnswer: question.correctAnswer,
            distractors: question.distractors,
          });
          
          clozeQuestions.push({
            ...savedQuestion,
            choices: [question.correctAnswer, ...question.distractors].sort(() => Math.random() - 0.5)
          });
        } catch (error) {
          console.error(`Error generating cloze question for word ${text}:`, error);
          // Continue with other words
        }
      }
      
      res.json({ questions: clozeQuestions });
    } catch (error) {
      console.error("Error generating cloze quiz:", error);
      res.status(500).json({ message: "Failed to generate cloze quiz" });
    }
  });

  // Generate passage quiz (Section 2: reading passage with blanks)
  app.post("/api/quiz/passage/generate", async (req, res) => {
    try {
      const { words, listId } = req.body; // Array of 6 words for blanks 7-12
      
      if (!words || !Array.isArray(words) || words.length !== 6) {
        return res.status(400).json({ message: "Exactly 6 words are required for passage quiz" });
      }

      if (!listId) {
        return res.status(400).json({ message: "List ID is required" });
      }

      // Generate the passage with AI
      const passageData = await aiService.generatePassageQuiz(words);
      
      // Save passage to database
      const savedPassage = await storage.createPassageQuestion({
        listId: listId,
        passageText: passageData.passageText,
        title: passageData.title,
      });
      
      // Save blanks
      const blanks = [];
      for (let i = 0; i < passageData.blanks.length; i++) {
        const blankData = passageData.blanks[i];
        const wordData = words[i];
        
        const savedBlank = await storage.createPassageBlank({
          passageId: savedPassage.id,
          blankNumber: blankData.blankNumber,
          wordId: wordData.id,
          correctAnswer: blankData.correctAnswer,
          distractors: blankData.distractors,
        });
        
        blanks.push({
          ...savedBlank,
          choices: [blankData.correctAnswer, ...blankData.distractors].sort(() => Math.random() - 0.5)
        });
      }
      
      res.json({
        passage: savedPassage,
        blanks: blanks
      });
    } catch (error) {
      console.error("Error generating passage quiz:", error);
      res.status(500).json({ message: "Failed to generate passage quiz" });
    }
  });

  // Get quiz data for a vocabulary list (both cloze and passage questions)
  app.get("/api/quiz/:listId", async (req, res) => {
    try {
      const { listId } = req.params;
      
      // Get words for the list
      const words = await storage.getWordsByList(listId);
      
      if (words.length === 0) {
        return res.status(404).json({ message: "No words found for this vocabulary list" });
      }
      
      // Get cloze questions for first 6 words (questions 1-6)
      const clozeQuestions = await storage.getClozeQuestionsByList(listId);
      
      // Get passage questions for next 6 words (questions 7-12)  
      const passageData = await storage.getPassageQuestionByList(listId);
      
      res.json({
        clozeQuestions: clozeQuestions.map(q => ({
          ...q,
          choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
        })),
        passageData: passageData ? {
          passage: passageData.passage,
          blanks: passageData.blanks.map(b => ({
            ...b,
            choices: [b.correctAnswer, ...b.distractors].sort(() => Math.random() - 0.5)
          }))
        } : null
      });
    } catch (error) {
      console.error("Error fetching quiz data:", error);
      res.status(500).json({ message: "Failed to fetch quiz data" });
    }
  });

  // Health check
  app.get("/api/health", async (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
