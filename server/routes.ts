import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { aiService } from "./services/ai.js";
import { ttsService } from "./services/tts.js";
import { schedulerService } from "./services/scheduler.js";
import { gracefulDegradationService } from "./services/gracefulDegradation.js";
import { setupAuth, isAuthenticated, isStudentAuthenticated, isInstructorOrStudentAuthenticated } from "./replitAuth";
import { insertWordSchema, insertAttemptSchema, simpleWordInputSchema, insertVocabularyListSchema } from "@shared/schema.js";
import { studentLoginRateLimit, createRateLimitMiddleware } from "./services/rateLimit.js";
import { circuitBreakerManager } from "./services/circuitBreakerManager.js";
import { errorRecoveryService } from "./services/errorRecovery.js";
import { databaseResilienceService } from "./services/databaseResilience.js";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Redis-based distributed rate limiting for student login (prevent PIN brute forcing)
  // Configuration is now handled in the DistributedRateLimit service
  const rateLimitMiddleware = createRateLimitMiddleware(studentLoginRateLimit, {
    message: { message: "Too many login attempts, please try again later" },
    keyGenerator: (req: any) => {
      // Use IP address as the rate limiting key (prefix handled by DistributedRateLimit)
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      return ip; // No prefix here - DistributedRateLimit already adds 'student_login:'
    }
  });

  // Log rate limiter status on startup
  console.log('Rate limiter status:', studentLoginRateLimit.getStatus());

  // Auth middleware
  await setupAuth(app);

  // Health check endpoint for monitoring system resilience
  app.get('/api/health', async (req, res) => {
    try {
      const circuitBreakerStatus = circuitBreakerManager.getHealthStatus();
      const circuitBreakerStats = circuitBreakerManager.getStatistics();
      const serviceHealthStatus = errorRecoveryService.getHealthStatus();
      const systemHealthSummary = errorRecoveryService.getSystemHealthSummary();
      const databaseHealth = await databaseResilienceService.getHealthStatus();

      const healthData = {
        timestamp: new Date().toISOString(),
        overall: systemHealthSummary.overallHealth,
        services: {
          database: databaseHealth,
          circuitBreakers: {
            status: circuitBreakerStatus,
            statistics: circuitBreakerStats
          },
          recovery: {
            services: serviceHealthStatus,
            summary: systemHealthSummary
          }
        },
        version: '1.0.0'
      };

      // Set appropriate HTTP status based on overall health
      const statusCode = systemHealthSummary.overallHealth === 'healthy' ? 200 :
                        systemHealthSummary.overallHealth === 'degraded' ? 206 : 503;

      res.status(statusCode).json(healthData);
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ 
        timestamp: new Date().toISOString(),
        overall: 'critical',
        error: 'Health check system failure',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

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

  // Student authentication route (PIN-based login) with rate limiting
  app.post('/api/student-login', rateLimitMiddleware, async (req, res) => {
    try {
      const { pin, instructorId } = req.body;
      
      if (!pin) {
        return res.status(400).json({ message: "PIN is required" });
      }

      if (!instructorId) {
        return res.status(400).json({ message: "Instructor ID is required" });
      }

      // SECURITY: Demo PIN only allowed in development environment
      if (pin === "1234" && process.env.NODE_ENV === "development") {
        const student = {
          id: "demo-student",
          firstName: "Test",
          lastName: "Student",
          displayName: "Test Student",
          pin: "1234",
          instructorId: "demo-instructor",
          grade: 3,
          isActive: true
        };
        
        // Regenerate session to prevent session fixation
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regeneration error:", err);
            return res.status(500).json({ message: "Login failed" });
          }
          
          // Store student session for subsequent API calls
          (req.session as any).studentId = student.id;
          (req.session as any).student = student;
          
          res.json({ 
            student: student, 
            success: true 
          });
        });
        return;
      }

      // SECURITY FIX: Scope PIN search to specific instructor to prevent cross-class access
      const student = await storage.getStudentByPin(pin, instructorId);
      
      if (!student || !student.isActive) {
        return res.status(401).json({ message: "Invalid PIN or inactive student" });
      }

      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Store student session for subsequent API calls
        (req.session as any).studentId = student.id;
        (req.session as any).student = student;
        
        res.json({ student, success: true });
      });
    } catch (error) {
      console.error("Error during student login:", error);
      res.status(500).json({ message: "Failed to authenticate student" });
    }
  });

  // Student session validation endpoint
  app.get('/api/student/session', isStudentAuthenticated, async (req: any, res) => {
    try {
      // Student data is already validated and attached by middleware
      const student = req.student;
      res.json({ 
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          displayName: student.displayName,
          instructorId: student.instructorId,
          grade: student.grade,
          isActive: student.isActive
        },
        success: true 
      });
    } catch (error) {
      console.error("Error fetching student session:", error);
      res.status(500).json({ message: "Failed to fetch student session" });
    }
  });

  // Student logout endpoint with session cleanup
  app.post('/api/student/logout', async (req, res) => {
    try {
      const session = req.session as any;
      
      // Clear student session data
      if (session) {
        delete session.student;
        delete session.studentId;
        
        // Destroy the entire session for security
        req.session.destroy((err) => {
          if (err) {
            console.error("Session destruction error:", err);
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie('connect.sid'); // Clear session cookie
          res.json({ success: true, message: "Logged out successfully" });
        });
      } else {
        res.json({ success: true, message: "Already logged out" });
      }
    } catch (error) {
      console.error("Error during student logout:", error);
      res.status(500).json({ message: "Logout failed" });
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

  app.get('/api/vocabulary-lists/current', isInstructorOrStudentAuthenticated, async (req: any, res) => {
    try {
      // SECURITY: Use validated instructor ID from authenticated session, not client data
      const instructorId = req.instructorId; // Set by authentication middleware
      
      const currentList = await storage.getCurrentVocabularyList(instructorId);
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
  
  // Direct vocabulary list creation request body validation schema
  const directCreateSchema = z.object({
    listName: z.string().trim().min(1, "List name is required").max(100, "List name too long"),
    words: z.array(z.object({
      word: z.string().trim().min(1, "Word is required").max(50, "Word too long"),
      definition: z.string().trim().min(1, "Definition is required").max(500, "Definition too long")
    })).min(1, "At least one word is required").max(100, "Too many words")
  });

  // NEW: Direct vocabulary list creation (no AI modification of definitions)
  app.post('/api/vocabulary-lists/direct-create', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with proper Zod validation
      const validatedData = directCreateSchema.parse(req.body);
      const { listName, words } = validatedData;

      if (!listName || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ message: "List name and words are required" });
      }

      // Words are already validated by Zod schema, no need to filter
      const validWords = words;
      
      // Zod validation ensures we have at least one valid word

      // Create vocabulary list
      const listData = {
        name: listName,
        instructorId: userId,
        isCurrent: true // New lists become current
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

      // Add words to the list WITHOUT AI modification
      for (const wordData of validWords) {
        try {
          // Extract part of speech from definition if available (e.g., "(n.)" or "(v.)")
          const posMatch = wordData.definition.match(/\(([^)]+)\)/);
          let partOfSpeech = 'noun'; // Default
          let cleanDefinition = wordData.definition;

          if (posMatch) {
            const pos = posMatch[1].toLowerCase();
            if (pos.includes('n') || pos.includes('noun')) partOfSpeech = 'noun';
            else if (pos.includes('v') || pos.includes('verb')) partOfSpeech = 'verb';
            else if (pos.includes('adj') || pos.includes('adjective')) partOfSpeech = 'adjective';
            else if (pos.includes('adv') || pos.includes('adverb')) partOfSpeech = 'adverb';
            // Keep definition as-is to preserve teacher's exact formatting
          }

          // Basic syllable breakdown (simple approach)
          const syllables = [wordData.word.toLowerCase()]; // Keep as single syllable by default
          
          const word = await storage.createWord({
            text: wordData.word.trim().toLowerCase(),
            partOfSpeech: partOfSpeech,
            teacherDefinition: wordData.definition.trim(), // Use exact teacher definition
            kidDefinition: wordData.definition.trim(), // Use same definition for kids (no AI modification)
            syllables: syllables,
            morphemes: [wordData.word.trim().toLowerCase()], // Simple morpheme (just the word itself)
            instructorId: userId,
            listId: list.id
          });

          // Create initial schedule for word
          const scheduleData = schedulerService.createInitialSchedule(word.id);
          await storage.createSchedule(scheduleData);

          // Generate initial sentences using the exact teacher definition
          try {
            const sentences = await aiService.generateSentences(
              word.text,
              word.partOfSpeech,
              word.kidDefinition // This is now the exact teacher definition
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
          console.error(`Failed to process word ${wordData.word}:`, error);
        }
      }

      res.json({
        listId: list.id,
        listName: list.name,
        wordsCreated
      });
    } catch (error) {
      console.error("Error creating vocabulary list:", error);
      res.status(500).json({ message: "Failed to create vocabulary list" });
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
  app.get("/api/student/:studentId/words", isStudentAuthenticated, async (req, res) => {
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
      
      // Generate part of speech using AI but keep teacher definition with fallback
      const analysis = await gracefulDegradationService.withAIFallback(
        () => aiService.analyzeWord(text),
        () => gracefulDegradationService.generateFallbackWordAnalysis(text),
        'openai'
      );
      
      // Generate morphology with fallback
      let morphology;
      try {
        morphology = await aiService.analyzeMorphology(text);
      } catch (error) {
        console.warn('Morphology analysis failed, using simple fallback:', error);
        errorRecoveryService.recordFailure('openai', error instanceof Error ? error.message : 'Morphology failed');
        morphology = {
          syllables: [text], // Simple fallback
          morphemes: [text],
          recommended: true
        };
      }
      
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

      // Generate sentences using the teacher's definition with fallback
      const sentences = await gracefulDegradationService.withAIFallback(
        () => aiService.generateSentences(word.text, word.partOfSpeech, definition),
        () => gracefulDegradationService.generateFallbackSentences(word.text, word.partOfSpeech, definition),
        'openai'
      );
      
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
      
      // Check if services are in degraded state and provide appropriate message
      const openaiDegradation = errorRecoveryService.getGracefulDegradationOptions('openai');
      if (openaiDegradation.fallbackEnabled) {
        res.status(503).json({ 
          message: "AI services are temporarily unavailable. Basic word creation is still available.",
          degraded: true,
          fallbackMessage: gracefulDegradationService.getFallbackMessage('openai', 'teacher'),
          retryAfter: openaiDegradation.retryAfterMs
        });
      } else {
        res.status(500).json({ message: "Failed to add word with manual definition" });
      }
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

      const sentences = await gracefulDegradationService.withAIFallback(
        () => aiService.generateSentences(
          word.text,
          word.partOfSpeech,
          word.kidDefinition
        ),
        () => gracefulDegradationService.generateFallbackSentences(word.text, word.partOfSpeech, word.kidDefinition),
        'openai'
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
      
      // Provide graceful degradation message
      const openaiDegradation = errorRecoveryService.getGracefulDegradationOptions('openai');
      if (openaiDegradation.fallbackEnabled) {
        res.status(503).json({ 
          message: "AI sentence generation is temporarily unavailable. You can add sentences manually.",
          degraded: true,
          fallbackMessage: gracefulDegradationService.getFallbackMessage('openai', 'teacher'),
          retryAfter: openaiDegradation.retryAfterMs
        });
      } else {
        res.status(500).json({ message: "Failed to generate sentences" });
      }
    }
  });

  // OPTIMIZED: Audio metadata API (returns URLs, not embedded data)
  app.post("/api/audio/generate", async (req, res) => {
    try {
      const { text, type } = req.body;
      
      if (!text || !type) {
        return res.status(400).json({ message: "Text and type are required" });
      }

      // First, generate the cache key to check for pre-cached audio
      const cacheKey = ttsService.generateCacheKey({ text, type });
      const cachedAudio = await storage.getAudioCache(cacheKey);
      
      if (cachedAudio && cachedAudio.audioData) {
        console.log(`Cache HIT: Using cached audio for ${type}: "${text.substring(0, 50)}..."`);
        
        // OPTIMIZATION: Return URL reference instead of embedded audio data
        if (type === "sentence") {
          return res.json({
            audioUrl: `/api/audio/stream/${encodeURIComponent(cacheKey)}`,
            wordTimings: cachedAudio.wordTimings || [],
            duration: cachedAudio.durationMs ? cachedAudio.durationMs / 1000 : 0,
            provider: cachedAudio.provider,
            optimized: true
          });
        }
        
        // For definitions, return binary audio directly from cache
        const audioBuffer = Buffer.from(cachedAudio.audioData, 'base64');
        const etag = `"${cacheKey}-${audioBuffer.byteLength}"`;
        
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength.toString(),
          'Cache-Control': 'public, max-age=3600',
          'ETag': etag,
          'Last-Modified': cachedAudio.createdAt ? new Date(cachedAudio.createdAt).toUTCString() : new Date().toUTCString(),
          'X-Audio-Provider': cachedAudio.provider,
          'X-Cache-Status': 'cached',
        });
        return res.send(audioBuffer);
      }

      console.log(`Cache MISS: Generating new audio for ${type}: "${text.substring(0, 50)}..."`);
      
      // Generate new audio only when cache miss with fallback
      const result = await gracefulDegradationService.withTTSFallback(
        () => ttsService.generateAudio({ text, type }),
        () => gracefulDegradationService.generateFallbackTTS({ text, type }),
        'elevenlabs'
      );
      
      if (!result) {
        // TTS service unavailable, return fallback response
        const elevenLabsDegradation = errorRecoveryService.getGracefulDegradationOptions('elevenlabs');
        return res.status(503).json({
          message: "Audio generation temporarily unavailable",
          degraded: true,
          fallbackMessage: gracefulDegradationService.getFallbackMessage('elevenlabs', 'teacher'),
          retryAfter: elevenLabsDegradation.retryAfterMs,
          audioUnavailable: true
        });
      }
      
      // Store complete audio data and timings in cache 
      try {
        const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
        await storage.createAudioCache({
          wordId: req.body.wordId || null,
          sentenceId: req.body.sentenceId || null,
          type,
          provider: result.provider,
          audioUrl: null,
          audioData: base64Audio, // Store actual audio data
          cacheKey: result.cacheKey,
          durationMs: result.duration ? Math.round(result.duration) : (result.wordTimings ? Math.round(Math.max(...result.wordTimings.map(w => w.endTimeMs))) : null),
          wordTimings: result.wordTimings || null, // Store word timings for sentences
        });
        console.log(`Audio cached successfully for ${type}: "${text.substring(0, 50)}..."`);
      } catch (error) {
        console.warn(`Failed to cache audio for ${type}: "${text.substring(0, 30)}...":`, error);
      }

      // OPTIMIZATION: For sentences, return URL reference instead of embedded data
      if (type === "sentence") {
        console.log(`Generated ${result.wordTimings?.length || 0} word timings from ElevenLabs for text: "${text.substring(0, 50)}..."`);
        
        return res.json({
          audioUrl: `/api/audio/stream/${encodeURIComponent(cacheKey)}`,
          wordTimings: result.wordTimings || [],
          duration: result.wordTimings ? Math.max(...result.wordTimings.map(w => w.endTimeMs)) / 1000 : 0,
          provider: result.provider,
          optimized: true
        });
      }

      // For definitions, return binary audio with enhanced caching headers
      const audioBuffer = Buffer.from(result.audioBuffer);
      const etag = `"${result.cacheKey}-${audioBuffer.byteLength}"`;
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'ETag': etag,
        'Last-Modified': new Date().toUTCString(),
        'X-Audio-Provider': result.provider,
        'X-Cache-Status': 'generated',
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("Error generating audio:", error);
      res.status(500).json({ message: "Failed to generate audio" });
    }
  });

  // OPTIMIZATION: Audio streaming endpoint with HTTP 206 Range support for better performance
  app.get("/api/audio/stream/:cacheKey", async (req, res) => {
    try {
      const cacheKey = decodeURIComponent(req.params.cacheKey);
      
      const cachedAudio = await storage.getAudioCache(cacheKey);
      
      if (!cachedAudio || !cachedAudio.audioData) {
        return res.status(404).json({ message: "Audio not found" });
      }
      
      const audioBuffer = Buffer.from(cachedAudio.audioData, 'base64');
      const fileSize = audioBuffer.byteLength;
      
      // Generate ETag based on cache key and file size for better caching
      const etag = `"${cacheKey}-${fileSize}"`;
      
      // Check If-None-Match header for conditional requests
      if (req.headers['if-none-match'] === etag) {
        console.log(`🚀 CACHE HIT: ETag match for audio ${cacheKey.substring(0, 30)}...`);
        return res.status(304).end();
      }

      // Parse Range header for HTTP 206 partial content support
      const range = req.headers.range;
      
      if (range) {
        console.log(`🎵 RANGE REQUEST: ${range} for audio ${cacheKey.substring(0, 30)}...`);
        
        // Parse range header (format: "bytes=start-end")
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`
          });
          return res.end();
        }
        
        const chunkSize = (end - start) + 1;
        const chunk = audioBuffer.subarray(start, end + 1);
        
        // Send 206 Partial Content with proper headers
        res.status(206).set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'ETag': etag,
          'Last-Modified': cachedAudio.createdAt ? new Date(cachedAudio.createdAt).toUTCString() : new Date().toUTCString(),
          'X-Audio-Provider': cachedAudio.provider,
          'X-Cache-Status': 'partial-streamed',
          'X-Range': `${start}-${end}/${fileSize}`
        });
        
        console.log(`📦 PARTIAL CONTENT: Serving bytes ${start}-${end}/${fileSize} (${chunkSize} bytes)`);
        return res.send(chunk);
      }
      
      // Full file response with enhanced caching headers
      console.log(`🎵 FULL AUDIO: Serving complete file ${cacheKey.substring(0, 30)}... (${fileSize} bytes)`);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'ETag': etag,
        'Last-Modified': cachedAudio.createdAt ? new Date(cachedAudio.createdAt).toUTCString() : new Date().toUTCString(),
        'X-Audio-Provider': cachedAudio.provider,
        'X-Cache-Status': 'full-streamed'
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("Error streaming audio:", error);
      res.status(500).json({ message: "Failed to stream audio" });
    }
  });

  app.post("/api/audio/slow", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      // Generate cache key for slow audio (with special voice settings)
      const slowOptions = {
        text,
        type: "word" as const,
        voiceSettings: {
          speed: 0.7,
          stability: 0.7,
          clarity: 0.8,
        }
      };
      
      const cacheKey = ttsService.generateCacheKey(slowOptions);
      const contentHash = ttsService.generateContentHash(slowOptions);
      
      // Check for existing cache (including deduplication by content hash)
      let cachedAudio = await storage.getAudioCache(cacheKey);
      
      if (!cachedAudio) {
        // Check for content deduplication - same content with same settings
        cachedAudio = await storage.getAudioCacheByContentHash(contentHash);
        if (cachedAudio) {
          console.log(`🔄 DEDUPLICATION HIT: Found existing audio for slow text "${text.substring(0, 30)}..." with content hash ${contentHash.substring(0, 8)}`);
          // EFFICIENCY FIX: Update hit tracking for deduplicated content to preserve popular cache entries
          await storage.updateAudioCacheHit(cachedAudio.id);
        }
      }
      
      if (cachedAudio && (cachedAudio.audioData || cachedAudio.filePath)) {
        console.log(`💾 Cache HIT: Using cached slow audio for "${text.substring(0, 50)}..."`);
        
        // Load audio from file system if available, otherwise use database
        let audioBuffer: Buffer;
        if (cachedAudio.filePath) {
          const fileAudio = await ttsService.loadAudioFromFile(cachedAudio.filePath);
          audioBuffer = fileAudio ? Buffer.from(fileAudio) : Buffer.from(cachedAudio.audioData!, 'base64');
        } else {
          audioBuffer = Buffer.from(cachedAudio.audioData!, 'base64');
        }
        
        const etag = `"${cacheKey}-${audioBuffer.byteLength}"`;
        const fileSize = audioBuffer.byteLength;
        
        // EFFICIENCY FIX: Check If-None-Match header for HTTP 304 Not Modified response
        if (req.headers['if-none-match'] === etag) {
          console.log(`🚀 CACHE HIT: ETag match for slow audio ${text.substring(0, 30)}...`);
          return res.status(304).end();
        }

        // EFFICIENCY FIX: Parse Range header for HTTP 206 partial content support
        const range = req.headers.range;
        
        if (range) {
          console.log(`🎵 RANGE REQUEST: ${range} for slow audio ${text.substring(0, 30)}...`);
          
          // Parse range header (format: "bytes=start-end")
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          
          // Validate range
          if (start >= fileSize || end >= fileSize || start > end) {
            res.status(416).set({
              'Content-Range': `bytes */${fileSize}`
            });
            return res.end();
          }
          
          const chunkSize = (end - start) + 1;
          const chunk = audioBuffer.subarray(start, end + 1);
          
          // Send 206 Partial Content with proper headers
          res.status(206).set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': chunkSize.toString(),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
            'ETag': etag,
            'Last-Modified': cachedAudio.createdAt ? new Date(cachedAudio.createdAt).toUTCString() : new Date().toUTCString(),
            'X-Audio-Provider': cachedAudio.provider,
            'X-Cache-Status': 'partial-streamed',
            'X-Content-Hash': contentHash.substring(0, 16),
            'X-Range': `${start}-${end}/${fileSize}`
          });
          
          console.log(`📦 PARTIAL CONTENT: Serving bytes ${start}-${end}/${fileSize} (${chunkSize} bytes)`);
          return res.send(chunk);
        }
        
        // Full file response with enhanced caching headers
        console.log(`🎵 FULL SLOW AUDIO: Serving complete file ${text.substring(0, 30)}... (${fileSize} bytes)`);
        
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'ETag': etag,
          'Last-Modified': cachedAudio.createdAt ? new Date(cachedAudio.createdAt).toUTCString() : new Date().toUTCString(),
          'X-Audio-Provider': cachedAudio.provider,
          'X-Cache-Status': 'persistent-cached',
          'X-Content-Hash': contentHash.substring(0, 16),
        });
        
        return res.send(audioBuffer);
      }

      console.log(`🎵 Cache MISS: Generating new slow audio for "${text.substring(0, 50)}..."`);
      
      // Generate new slow audio
      const result = await ttsService.generateSlowAudio(text);
      const audioBuffer = Buffer.from(result.audioBuffer);
      
      // Store in persistent cache with both database and optional file system
      try {
        const base64Audio = audioBuffer.toString('base64');
        let filePath: string | null = null;
        let fileSize: number = audioBuffer.byteLength;
        
        // Save to file system for larger files (optional optimization)
        if (audioBuffer.byteLength > 50000) { // 50KB threshold
          filePath = await ttsService.saveAudioToFile(result.audioBuffer, result.cacheKey, "word");
          console.log(`💾 Saved slow audio to file system: ${filePath}`);
        }
        
        await storage.createAudioCache({
          wordId: req.body.wordId || null,
          sentenceId: null,
          type: "word",
          provider: result.provider,
          audioUrl: null,
          // EFFICIENCY FIX: Eliminate storage duplication - don't store base64 when filePath exists
          audioData: filePath ? null : base64Audio,
          cacheKey: result.cacheKey,
          contentHash,
          filePath,
          fileSize,
          durationMs: result.duration ? Math.round(result.duration) : null,
          wordTimings: null,
          hitCount: 1,
          lastAccessedAt: new Date(),
        });
        
        console.log(`✅ Stored slow audio in persistent cache: ${result.cacheKey} (${fileSize} bytes)`);
      } catch (cacheError) {
        console.error("Failed to cache slow audio:", cacheError);
        // Continue serving the audio even if caching fails
      }
      
      const etag = `"slow-${text.slice(0, 20)}-${audioBuffer.byteLength}"`;
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'ETag': etag,
        'Last-Modified': new Date().toUTCString(),
        'Accept-Ranges': 'bytes',
        'X-Audio-Provider': result.provider,
        'X-Cache-Status': 'newly-generated',
        'X-Content-Hash': contentHash.substring(0, 16),
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("Error generating slow audio:", error);
      res.status(500).json({ message: "Failed to generate slow audio" });
    }
  });

  // Concurrency limiter utility for ElevenLabs API rate limiting
  async function processConcurrently<T>(
    tasks: (() => Promise<T>)[],
    concurrencyLimit = 5 // Conservative limit to work with global TTS concurrency limiter
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < tasks.length; i += concurrencyLimit) {
      const batch = tasks.slice(i, i + concurrencyLimit);
      console.log(`Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(tasks.length / concurrencyLimit)} (${batch.length} requests)`);
      
      const batchResults = await Promise.allSettled(
        batch.map(task => task())
      );
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('Batch task failed:', result.reason);
        }
      }
      
      // Add small delay between batches to be extra safe with rate limits
      if (i + concurrencyLimit < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  // Audio Pre-caching API with concurrency control
  app.post("/api/audio/precache", async (req, res) => {
    try {
      const { listId, instructorId } = req.body;
      
      if (!listId || !instructorId) {
        return res.status(400).json({ message: "List ID and instructor ID are required" });
      }

      console.log(`Starting audio pre-caching for list ${listId} (instructor: ${instructorId})`);

      // Get all words from the vocabulary list
      const words = await storage.getWords(listId, instructorId);
      const cacheTasks: (() => Promise<any>)[] = [];

      for (const word of words) {
        // Pre-cache word definition audio
        cacheTasks.push(async () => {
          try {
            const result = await ttsService.generateAudio({ 
              text: word.kidDefinition, 
              type: "word" 
            });
            const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
            return await storage.createAudioCache({
              wordId: word.id,
              sentenceId: null,
              type: "word",
              provider: result.provider,
              audioUrl: null,
              audioData: base64Audio,
              cacheKey: result.cacheKey,
              durationMs: result.duration ? Math.round(result.duration) : null,
              wordTimings: null,
            });
          } catch (error) {
            console.error(`Failed to pre-cache word ${word.text} definition:`, error);
            throw error;
          }
        });

        // Get sentences for this word and pre-cache them
        const sentences = await storage.getSentences(word.id);
        for (const sentence of sentences) {
          cacheTasks.push(async () => {
            try {
              const result = await ttsService.generateAudio({ 
                text: sentence.text, 
                type: "sentence" 
              });
              const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
              return await storage.createAudioCache({
                wordId: word.id,
                sentenceId: sentence.id,
                type: "sentence", 
                provider: result.provider,
                audioUrl: null,
                audioData: base64Audio,
                cacheKey: result.cacheKey,
                durationMs: result.duration ? Math.round(result.duration) : (result.wordTimings ? Math.round(Math.max(...result.wordTimings.map(w => w.endTimeMs))) : null),
                wordTimings: result.wordTimings || null,
              });
            } catch (error) {
              console.error(`Failed to pre-cache sentence for word ${word.text}:`, error);
              throw error;
            }
          });
        }
      }

      // Process audio generation with concurrency control
      console.log(`Processing ${cacheTasks.length} audio generation tasks with concurrency control`);
      const results = await processConcurrently(cacheTasks, 8);
      
      console.log(`Completed audio pre-caching for ${words.length} words with ${results.length} successful audio files`);
      
      res.json({ 
        message: "Audio pre-caching completed with concurrency control", 
        wordsCount: words.length,
        audioFilesCount: results.length,
        totalTasks: cacheTasks.length
      });
    } catch (error) {
      console.error("Error pre-caching audio:", error);
      res.status(500).json({ message: "Failed to pre-cache audio" });
    }
  });

  // Clear audio cache for a vocabulary list to force regeneration
  app.post("/api/audio/clear-cache", isAuthenticated, async (req: any, res) => {
    try {
      const { listId } = req.body;
      const userId = req.user.claims.sub;
      
      if (!listId) {
        return res.status(400).json({ message: "List ID is required" });
      }

      console.log(`Clearing audio cache for list ${listId} (instructor: ${userId})`);

      // Get all words from the vocabulary list to find associated cache entries
      const words = await storage.getWords(listId, userId);
      let deletedCount = 0;

      for (const word of words) {
        // Delete cache entries for word definitions
        const wordCacheKey = ttsService.generateCacheKey({ 
          text: word.kidDefinition, 
          type: "word" 
        });
        const wordCache = await storage.getAudioCache(wordCacheKey);
        if (wordCache) {
          await storage.deleteAudioCache(wordCache.id);
          deletedCount++;
        }

        // Delete cache entries for sentences
        const sentences = await storage.getSentences(word.id);
        for (const sentence of sentences) {
          const sentenceCacheKey = ttsService.generateCacheKey({ 
            text: sentence.text, 
            type: "sentence" 
          });
          const sentenceCache = await storage.getAudioCache(sentenceCacheKey);
          if (sentenceCache) {
            await storage.deleteAudioCache(sentenceCache.id);
            deletedCount++;
          }
        }
      }
      
      console.log(`Cleared ${deletedCount} audio cache entries for list ${listId}`);
      
      res.json({ 
        message: "Audio cache cleared successfully", 
        deletedCount,
        wordsCount: words.length
      });
    } catch (error) {
      console.error("Error clearing audio cache:", error);
      res.status(500).json({ message: "Failed to clear audio cache" });
    }
  });

  // Study Session API - Now secured with proper authentication
  app.get("/api/study/session", isStudentAuthenticated, async (req: any, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const quizMode = req.query.quiz === 'true'; // Check if this is for quiz (need all words)
      const listId = req.query.list as string;
      
      // SECURITY: Use validated instructor ID from student session, NOT client-provided query params
      const instructorId = req.instructorId; // This comes from the validated student session
      
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
                .then(result => {
                  const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
                  return storage.createAudioCache({
                    wordId: word.id,
                    sentenceId: null,
                    type: "word",
                    provider: result.provider,
                    audioUrl: null,
                    audioData: base64Audio, // Store actual audio data
                    cacheKey: result.cacheKey,
                    durationMs: result.duration ? Math.round(result.duration) : null,
                    wordTimings: null, // No timings for word definitions
                  });
                })
                .catch(error => console.error(`Pre-cache failed for word ${word.text}:`, error))
            );

            // Pre-cache sentences
            const sentences = await storage.getSentences(word.id);
            for (const sentence of sentences) {
              cachePromises.push(
                ttsService.generateAudio({ text: sentence.text, type: "sentence" })
                  .then(result => {
                    const base64Audio = Buffer.from(result.audioBuffer).toString('base64');
                    return storage.createAudioCache({
                      wordId: word.id,
                      sentenceId: sentence.id,
                      type: "sentence",
                      provider: result.provider,
                      audioUrl: null,
                      audioData: base64Audio, // Store actual audio data
                      cacheKey: result.cacheKey,
                      durationMs: result.duration ? Math.round(result.duration) : (result.wordTimings ? Math.round(Math.max(...result.wordTimings.map(w => w.endTimeMs))) : null),
                      wordTimings: result.wordTimings || null, // Store word timings for sentences
                    });
                  })
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
  app.post("/api/practice/attempt", isStudentAuthenticated, async (req: any, res) => {
    try {
      // SECURITY: Add student-specific validation
      const attemptData = insertAttemptSchema.parse({
        ...req.body,
        studentId: req.student?.id // Use authenticated student ID, not client data
      });
      
      // Additional validation: Ensure the word belongs to the student's instructor
      const word = await storage.getWord(attemptData.wordId);
      if (!word || word.instructorId !== req.instructorId) {
        return res.status(403).json({ message: "Access denied to this word" });
      }
      
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid attempt data", 
          errors: error.errors.map(e => e.message) 
        });
      }
      res.status(500).json({ message: "Failed to record practice attempt" });
    }
  });

  // Progress API
  app.get("/api/progress", isInstructorOrStudentAuthenticated, async (req: any, res) => {
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
  app.get("/api/export/progress", isAuthenticated, async (req: any, res) => {
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

  // Generate cloze quiz questions (Section 1: dual sentences) - OPTIMIZED WITH SERVER CACHING
  app.post("/api/quiz/cloze/generate", isStudentAuthenticated, async (req: any, res) => {
    try {
      const { words } = req.body; // Array of word objects with text, partOfSpeech, definition
      
      if (!words || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ message: "Words array is required" });
      }
      
      // SERVER CACHE: Check if we already have questions for these exact words
      const wordIds = words.map(w => w.id).sort().join(',');
      const existingQuestions = await storage.getClozeQuestionsByWordIds(wordIds);
      
      if (existingQuestions && existingQuestions.length === words.length) {
        console.log(`🚀 SERVER CACHE HIT: Found ${existingQuestions.length} existing cloze questions`);
        
        // Add HTTP caching headers for browser caching
        res.set({
          'Cache-Control': 'public, max-age=3600', // 1 hour cache
          'ETag': `"cloze-${wordIds}"`,
          'X-Cache-Status': 'server-hit'
        });
        
        const clozeQuestions = existingQuestions.map(q => ({
          id: q.id,
          wordId: q.wordId,
          sentence1: q.sentence1,
          sentence2: q.sentence2,
          choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
        }));
        
        return res.json({ questions: clozeQuestions });
      }
      
      // SECURITY: Validate that all words belong to the student's instructor
      for (const wordData of words) {
        if (!wordData.id) {
          return res.status(400).json({ message: "Word ID is required" });
        }
        const word = await storage.getWord(wordData.id);
        if (!word || word.instructorId !== req.instructorId) {
          return res.status(403).json({ message: "Access denied to requested words" });
        }
      }

      console.log(`🔄 SERVER CACHE MISS: Generating ${words.length} cloze questions in parallel...`);
      const startTime = Date.now();
      
      // OPTIMIZATION: Use parallel generation instead of sequential for loop
      const questions = await aiService.generateOptimizedClozeQuestions(
        words.map(w => ({
          text: w.text,
          partOfSpeech: w.partOfSpeech,
          kidDefinition: w.kidDefinition
        }))
      );
      
      console.log(`Generated ${questions.length} questions in ${Date.now() - startTime}ms`);
      
      // Save all questions to database in parallel (enables server-side caching)
      const savePromises = questions.map((question, index) => {
        const wordData = words[index];
        if (!wordData) return null;
        
        return storage.createClozeQuestion({
          wordId: wordData.id,
          sentence1: question.sentence1,
          sentence2: question.sentence2,
          correctAnswer: question.correctAnswer,
          distractors: question.distractors,
        }).catch(error => {
          console.error(`Error saving cloze question for word ${wordData.text}:`, error);
          return null;
        });
      }).filter(Boolean);
      
      const savedQuestions = await Promise.all(savePromises);
      
      // Add HTTP caching headers for browser caching
      res.set({
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
        'ETag': `"cloze-${wordIds}"`,
        'X-Cache-Status': 'server-generated'
      });
      
      // Format response
      const clozeQuestions = savedQuestions
        .filter(Boolean)
        .map((savedQuestion, index) => {
          const question = questions[index];
          if (!question) return null;
          
          return {
            id: savedQuestion.id,
            wordId: savedQuestion.wordId,
            sentence1: savedQuestion.sentence1,
            sentence2: savedQuestion.sentence2,
            choices: [question.correctAnswer, ...question.distractors].sort(() => Math.random() - 0.5)
          };
        })
        .filter(Boolean);
      
      res.json({ questions: clozeQuestions });
    } catch (error) {
      console.error("Error generating optimized cloze quiz:", error);
      res.status(500).json({ message: "Failed to generate cloze quiz" });
    }
  });

  // Generate passage quiz (Section 2: reading passage with blanks) - OPTIMIZED WITH SERVER CACHING
  app.post("/api/quiz/passage/generate", isStudentAuthenticated, async (req: any, res) => {
    try {
      const { words, listId } = req.body; // Array of 6 words for blanks 7-12
      
      if (!words || !Array.isArray(words) || words.length !== 6) {
        return res.status(400).json({ message: "Exactly 6 words are required for passage quiz" });
      }

      if (!listId) {
        return res.status(400).json({ message: "List ID is required" });
      }
      
      // SERVER CACHE: Check if we already have a passage for this exact set of words
      const wordIds = words.map(w => w.id).sort().join(',');
      const existingPassage = await storage.getPassageQuestionByWordIds(wordIds, listId);
      
      if (existingPassage) {
        console.log(`🚀 SERVER CACHE HIT: Found existing passage for words ${wordIds}`);
        
        // Add HTTP caching headers
        res.set({
          'Cache-Control': 'public, max-age=3600', // 1 hour cache
          'ETag': `"passage-${wordIds}"`,
          'X-Cache-Status': 'server-hit'
        });
        
        const optimizedBlanks = existingPassage.blanks.map(b => ({
          id: b.id,
          blankNumber: b.blankNumber,
          wordId: b.wordId,
          choices: [b.correctAnswer, ...b.distractors].sort(() => Math.random() - 0.5)
        }));
        
        return res.json({
          passage: {
            id: existingPassage.id,
            passageText: existingPassage.passageText,
            title: existingPassage.title
          },
          blanks: optimizedBlanks
        });
      }
      
      // SECURITY: Validate list ownership and word access
      const vocabularyList = await storage.getVocabularyList(listId);
      if (!vocabularyList || vocabularyList.instructorId !== req.instructorId) {
        return res.status(403).json({ message: "Access denied to this vocabulary list" });
      }
      
      // Validate that all words belong to the student's instructor
      for (const wordData of words) {
        if (!wordData.id) {
          return res.status(400).json({ message: "Word ID is required" });
        }
        const word = await storage.getWord(wordData.id);
        if (!word || word.instructorId !== req.instructorId) {
          return res.status(403).json({ message: "Access denied to requested words" });
        }
      }

      console.log(`🔄 SERVER CACHE MISS: Generating passage quiz for ${words.length} words...`);
      const startTime = Date.now();
      
      // OPTIMIZATION: Uses the optimized generateValidatedPassageQuiz with batch validation
      const passageData = await aiService.generateValidatedPassageQuiz(words);
      
      console.log(`Generated passage quiz in ${Date.now() - startTime}ms with optimizations`);
      
      // Add HTTP caching headers
      res.set({
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
        'ETag': `"passage-${wordIds}"`,
        'X-Cache-Status': 'server-generated'
      });
      
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
      
      // OPTIMIZATION: Streamlined response, removed debug metadata
      res.json({
        passage: {
          id: savedPassage.id,
          passageText: savedPassage.passageText,
          title: savedPassage.title
        },
        blanks: blanks.map(b => ({
          id: b.id,
          blankNumber: b.blankNumber,
          wordId: b.wordId,
          choices: b.choices // Pre-shuffled choices only
        }))
      });
    } catch (error) {
      console.error("Error generating passage quiz:", error);
      res.status(500).json({ message: "Failed to generate passage quiz" });
    }
  });

  // Get quiz data for a vocabulary list (both cloze and passage questions)
  app.get("/api/quiz/:listId", isStudentAuthenticated, async (req, res) => {
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
      
      // OPTIMIZATION: Pre-compute choices and return minimal data
      const optimizedCloze = clozeQuestions.map(q => ({
        id: q.id,
        wordId: q.wordId,
        sentence1: q.sentence1,
        sentence2: q.sentence2,
        choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
      }));
      
      const optimizedPassage = passageData ? {
        passage: {
          id: passageData.passage.id,
          passageText: passageData.passage.passageText,
          title: passageData.passage.title
        },
        blanks: passageData.blanks.map(b => ({
          id: b.id,
          blankNumber: b.blankNumber,
          wordId: b.wordId,
          choices: [b.correctAnswer, ...b.distractors].sort(() => Math.random() - 0.5)
        }))
      } : null;

      res.json({
        cloze: optimizedCloze,
        passage: optimizedPassage
      });
    } catch (error) {
      console.error("Error fetching quiz data:", error);
      res.status(500).json({ message: "Failed to fetch quiz data" });
    }
  });

  // Enhanced Cache Management Endpoints for Cost Optimization

  // Get comprehensive cache statistics and performance metrics
  app.get("/api/audio/cache/stats", isAuthenticated, async (req: any, res) => {
    try {
      console.log(`📊 Retrieving cache statistics for admin dashboard`);
      
      const stats = await storage.getAudioCacheStats();
      
      // Format file size for readability
      const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };
      
      res.json({
        cacheStats: {
          totalEntries: stats.totalEntries,
          totalSize: stats.totalSize,
          totalSizeFormatted: formatBytes(stats.totalSize),
          averageHitCount: stats.avgHitCount,
          estimatedCostSavings: stats.totalEntries * 0.018, // Approximate ElevenLabs cost per request
        },
        systemInfo: {
          cacheDirectory: "server/audio-cache",
          deduplicationEnabled: true,
          hybridStorageEnabled: true,
          contentHashingEnabled: true,
        }
      });
    } catch (error) {
      console.error("Error retrieving cache statistics:", error);
      res.status(500).json({ message: "Failed to retrieve cache statistics" });
    }
  });

  // Cleanup old and unused audio cache entries
  app.post("/api/audio/cache/cleanup", isAuthenticated, async (req: any, res) => {
    try {
      const { olderThanDays = 30, maxHitCount = 2 } = req.body;
      
      console.log(`🧹 Starting cache cleanup: removing entries older than ${olderThanDays} days with hit count <= ${maxHitCount}`);
      
      const deletedCount = await storage.cleanupOldAudioCache(olderThanDays, maxHitCount);
      
      console.log(`✅ Cache cleanup completed: removed ${deletedCount} old entries`);
      
      res.json({
        message: "Cache cleanup completed successfully",
        deletedEntries: deletedCount,
        criteria: {
          olderThanDays,
          maxHitCount
        }
      });
    } catch (error) {
      console.error("Error during cache cleanup:", error);
      res.status(500).json({ message: "Failed to cleanup cache" });
    }
  });

  // Cache health check and integrity verification
  app.get("/api/audio/cache/health", isAuthenticated, async (req: any, res) => {
    try {
      console.log(`🔍 Performing cache health check`);
      
      const stats = await storage.getAudioCacheStats();
      const healthStatus = {
        status: "healthy",
        issues: [] as string[],
        recommendations: [] as string[]
      };
      
      // Check for potential issues
      if (stats.totalEntries === 0) {
        healthStatus.issues.push("No cached audio entries found");
        healthStatus.recommendations.push("Consider running audio pre-caching for active vocabulary lists");
      }
      
      if (stats.avgHitCount < 2) {
        healthStatus.issues.push("Low average hit count indicates poor cache efficiency");
        healthStatus.recommendations.push("Review vocabulary usage patterns and consider cache warming");
      }
      
      if (stats.totalSize > 1000000000) { // 1GB
        healthStatus.issues.push("Large cache size may impact performance");
        healthStatus.recommendations.push("Consider running cache cleanup to remove old entries");
      }
      
      res.json({
        health: healthStatus,
        statistics: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error during cache health check:", error);
      res.status(500).json({ 
        health: { status: "unhealthy", error: error.message },
        timestamp: new Date().toISOString()
      });
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
