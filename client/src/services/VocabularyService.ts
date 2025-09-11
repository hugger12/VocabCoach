import { queryClient } from "@/lib/queryClient";
import type { VocabularyList, Word, InsertWord, WordWithProgress } from "@shared/schema";

export interface VocabularyParseResult {
  text: string;
  partOfSpeech: string;
  definitions: string[];
}

export interface VocabularyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WordCreationOptions {
  listId?: string;
  instructorId?: string;
  bypassAI?: boolean;
}

export interface VocabularyListCreationResult {
  listName: string;
  wordsCreated: number;
  list: VocabularyList;
}

/**
 * Domain service for vocabulary-related business logic
 * Handles word creation, validation, processing, and list management
 */
export class VocabularyService {
  
  /**
   * Parse vocabulary text into structured word objects
   * Extracts words, parts of speech, and definitions from raw text
   */
  parseVocabularyText(text: string): VocabularyParseResult[] {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const words: VocabularyParseResult[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Look for word patterns - isolated words without periods or colons
      if (line.match(/^[a-zA-Z]+$/) && !line.includes('.') && !line.includes(':')) {
        const word = line;
        let definitions: string[] = [];
        let partOfSpeech = '';
        
        // Look ahead for definitions on subsequent lines
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^[a-zA-Z]+$/)) {
          const defLine = lines[j].trim();
          if (defLine) {
            // Extract part of speech in parentheses at start of line
            const posMatch = defLine.match(/^\(([^)]+)\)/);
            if (posMatch) {
              if (!partOfSpeech) {
                partOfSpeech = posMatch[1].replace(/\d+\.\s*/, ''); // Remove numbering
              }
              // Extract definition after part of speech
              const def = defLine.replace(/^\([^)]+\)\s*/, '').trim();
              if (def) {
                definitions.push(def);
              }
            } else if (defLine.match(/^\d+\.\s*\([^)]+\)/)) {
              // Handle numbered definitions like "1. (v.) to agree..."
              const numPosMatch = defLine.match(/^\d+\.\s*\(([^)]+)\)\s*(.+)/);
              if (numPosMatch) {
                if (!partOfSpeech) {
                  partOfSpeech = numPosMatch[1];
                }
                definitions.push(numPosMatch[2].trim());
              }
            } else {
              definitions.push(defLine);
            }
          }
          j++;
        }
        
        if (definitions.length > 0) {
          words.push({
            text: word,
            partOfSpeech: partOfSpeech || 'noun',
            definitions: definitions
          });
        }
      }
    }
    
    return words;
  }

  /**
   * Validate vocabulary list data before creation
   */
  validateVocabularyList(listName: string, words: any[]): VocabularyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate list name
    if (!listName || !listName.trim()) {
      errors.push("List name is required");
    } else if (listName.trim().length < 2) {
      errors.push("List name must be at least 2 characters long");
    } else if (listName.trim().length > 100) {
      errors.push("List name must be less than 100 characters");
    }

    // Validate words
    if (!words || words.length === 0) {
      errors.push("At least one word is required");
    } else {
      const validWords = words.filter(word => 
        word && 
        typeof word === 'object' && 
        word.word?.trim() && 
        word.definition?.trim()
      );

      if (validWords.length === 0) {
        errors.push("At least one valid word with definition is required");
      }

      // Check for duplicate words
      const wordTexts = validWords.map(w => w.word.trim().toLowerCase());
      const duplicates = wordTexts.filter((word, index) => wordTexts.indexOf(word) !== index);
      if (duplicates.length > 0) {
        warnings.push(`Duplicate words found: ${[...new Set(duplicates)].join(', ')}`);
      }

      // Validate individual words
      validWords.forEach((word, index) => {
        if (word.word.trim().length > 50) {
          warnings.push(`Word ${index + 1} is very long (${word.word.trim().length} characters)`);
        }
        if (word.definition.trim().length > 500) {
          warnings.push(`Definition ${index + 1} is very long (${word.definition.trim().length} characters)`);
        }
        if (!/^[a-zA-Z\s\-']+$/.test(word.word.trim())) {
          warnings.push(`Word ${index + 1} contains unusual characters: "${word.word.trim()}"`);
        }
      });

      // Check recommended word count
      if (validWords.length > 15) {
        warnings.push(`Large vocabulary list (${validWords.length} words). Consider breaking into smaller lists for better learning.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a vocabulary list with direct word entries (bypassing AI processing)
   */
  async createVocabularyListDirect(
    listName: string,
    wordEntries: Array<{ word: string; definition: string }>,
    instructorId?: string
  ): Promise<VocabularyListCreationResult> {
    // Validate input
    const validation = this.validateVocabularyList(listName, wordEntries);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Filter valid entries
    const validEntries = wordEntries.filter(entry => 
      entry.word.trim() && entry.definition.trim()
    );

    if (validEntries.length === 0) {
      throw new Error("No valid word entries provided");
    }

    // Create the vocabulary list
    const response = await fetch("/api/vocabulary-lists/direct-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listName: listName.trim(),
        words: validEntries
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create vocabulary list");
    }
    
    const result = await response.json();

    // Invalidate related queries
    await this.invalidateVocabularyQueries();

    return result;
  }

  /**
   * Import vocabulary list from parsed text (with AI processing)
   */
  async importVocabularyList(
    listName: string,
    vocabularyText: string
  ): Promise<VocabularyListCreationResult> {
    // Parse the vocabulary text
    const parsedWords = this.parseVocabularyText(vocabularyText);
    
    if (parsedWords.length === 0) {
      throw new Error("No words could be parsed from the text. Please check the format.");
    }

    // Validate the parsed data
    const validation = this.validateVocabularyList(listName, parsedWords);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Import via API with AI processing
    const response = await fetch("/api/vocabulary-lists/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listName: listName.trim(),
        words: parsedWords
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to import vocabulary list");
    }
    
    const result = await response.json();

    // Invalidate related queries
    await this.invalidateVocabularyQueries();

    return result;
  }

  /**
   * Set the current vocabulary list for an instructor
   */
  async setCurrentVocabularyList(listId: string): Promise<void> {
    const response = await fetch(`/api/vocabulary-lists/${listId}/set-current`, {
      method: "POST",
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to set current list");
    }

    // Invalidate related queries
    await this.invalidateVocabularyQueries();
  }

  /**
   * Get words with progress for a specific list and student
   */
  async getWordsWithProgress(
    listId?: string,
    studentId?: string
  ): Promise<WordWithProgress[]> {
    const params = new URLSearchParams();
    if (listId) params.append('listId', listId);
    if (studentId) params.append('studentId', studentId);

    const response = await fetch(`/api/words/progress?${params}`);
    if (!response.ok) {
      throw new Error("Failed to fetch words with progress");
    }

    return response.json();
  }

  /**
   * Clear audio cache for a vocabulary list
   */
  async clearAudioCache(listId: string): Promise<{ deletedCount: number }> {
    const response = await fetch(`/api/audio/clear-cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listId }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to clear audio cache");
    }
    
    return response.json();
  }

  /**
   * Validate individual word entry
   */
  validateWordEntry(word: string, definition: string): VocabularyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate word
    if (!word || !word.trim()) {
      errors.push("Word is required");
    } else {
      const trimmedWord = word.trim();
      if (trimmedWord.length < 2) {
        errors.push("Word must be at least 2 characters long");
      }
      if (trimmedWord.length > 50) {
        warnings.push("Word is very long");
      }
      if (!/^[a-zA-Z\s\-']+$/.test(trimmedWord)) {
        warnings.push("Word contains unusual characters");
      }
    }

    // Validate definition
    if (!definition || !definition.trim()) {
      errors.push("Definition is required");
    } else {
      const trimmedDef = definition.trim();
      if (trimmedDef.length < 5) {
        warnings.push("Definition seems very short");
      }
      if (trimmedDef.length > 500) {
        warnings.push("Definition is very long");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get vocabulary statistics for an instructor
   */
  async getVocabularyStats(instructorId?: string): Promise<{
    totalLists: number;
    totalWords: number;
    currentListWords: number;
    recentActivity: string;
  }> {
    const response = await fetch('/api/vocabulary-lists/stats');
    if (!response.ok) {
      throw new Error("Failed to fetch vocabulary statistics");
    }
    return response.json();
  }

  /**
   * Private helper to invalidate vocabulary-related queries
   */
  private async invalidateVocabularyQueries(): Promise<void> {
    queryClient.invalidateQueries({ queryKey: ["/api/vocabulary-lists"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => 
        query.queryKey[0] === "/api/words" || 
        (Array.isArray(query.queryKey) && query.queryKey[0] === "/api/words")
    });
  }
}

// Export singleton instance
export const vocabularyService = new VocabularyService();