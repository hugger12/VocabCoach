/**
 * Graceful Degradation Service
 * Provides fallback implementations when external services are unavailable
 */

import { errorRecoveryService } from './errorRecovery.js';
import type { GeneratedSentence, WordAnalysis, QuizDistractors } from './ai.js';
import type { TTSResult, TTSOptions } from './tts.js';

export class GracefulDegradationService {
  /**
   * Fallback AI sentence generation when OpenAI is unavailable
   */
  async generateFallbackSentences(word: string, partOfSpeech: string, definition: string): Promise<GeneratedSentence[]> {
    console.log(`🔄 Using fallback sentence generation for word: ${word}`);
    
    // Simple template-based sentence generation
    const templates = this.getSentenceTemplates(partOfSpeech);
    const sentences: GeneratedSentence[] = [];
    
    for (let i = 0; i < Math.min(3, templates.length); i++) {
      const template = templates[i];
      const sentence = template.replace('{word}', word);
      
      sentences.push({
        text: sentence,
        isAppropriate: true,
        reason: 'Generated using fallback template system'
      });
    }
    
    return sentences;
  }

  /**
   * Fallback word analysis when OpenAI is unavailable
   */
  async generateFallbackWordAnalysis(word: string): Promise<WordAnalysis> {
    console.log(`🔄 Using fallback word analysis for word: ${word}`);
    
    // Basic word analysis using heuristics
    const partOfSpeech = this.guessPartOfSpeech(word);
    const kidDefinition = `A word that means ${word}`;
    
    return {
      partOfSpeech,
      kidDefinition,
      teacherDefinition: `The word "${word}" (${partOfSpeech})`
    };
  }

  /**
   * Fallback quiz distractors when OpenAI is unavailable
   */
  async generateFallbackQuizDistractors(word: string, correctDefinition: string, partOfSpeech: string): Promise<QuizDistractors> {
    console.log(`🔄 Using fallback quiz distractor generation for word: ${word}`);
    
    const distractors = [
      {
        text: `A ${partOfSpeech} that is similar to ${word} but means something different`,
        reason: 'Generic fallback distractor'
      },
      {
        text: `Another ${partOfSpeech} that students might confuse with ${word}`,
        reason: 'Generic fallback distractor'
      }
    ];
    
    return {
      distractors,
      difficulty: 'moderate'
    };
  }

  /**
   * Fallback TTS when ElevenLabs is unavailable
   */
  async generateFallbackTTS(options: TTSOptions): Promise<TTSResult | null> {
    console.log(`🔄 TTS service unavailable for text: ${options.text.substring(0, 50)}...`);
    
    // Return null to indicate audio unavailable
    // The frontend should handle this gracefully by showing text-only mode
    return null;
  }

  /**
   * Check if service should use fallback
   */
  shouldUseFallback(serviceName: string): boolean {
    return !errorRecoveryService.isServiceHealthy(serviceName);
  }

  /**
   * Get user-friendly fallback message
   */
  getFallbackMessage(serviceName: string, userRole: 'student' | 'teacher' = 'student'): string {
    const options = errorRecoveryService.getGracefulDegradationOptions(serviceName);
    
    if (!options.fallbackEnabled) {
      return '';
    }
    
    if (userRole === 'student') {
      switch (serviceName.toLowerCase()) {
        case 'openai':
          return 'AI features are taking a break. We\'re using simple word tools instead!';
        case 'elevenlabs':
          return 'Audio is taking a break. You can still read the words!';
        default:
          return 'Some features are taking a break. Everything else works normally!';
      }
    } else {
      return options.fallbackMessage;
    }
  }

  /**
   * Wrapped AI operation with automatic fallback
   */
  async withAIFallback<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    serviceName: string = 'openai'
  ): Promise<T> {
    if (this.shouldUseFallback(serviceName)) {
      console.log(`🔄 Using fallback for ${serviceName} operation`);
      return fallbackOperation();
    }
    
    try {
      const result = await operation();
      errorRecoveryService.recordSuccess(serviceName);
      return result;
    } catch (error) {
      console.log(`⚠️ AI operation failed, switching to fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errorRecoveryService.recordFailure(serviceName, error instanceof Error ? error.message : 'Unknown error');
      return fallbackOperation();
    }
  }

  /**
   * Wrapped TTS operation with automatic fallback
   */
  async withTTSFallback(
    operation: () => Promise<TTSResult>,
    fallbackOperation: () => Promise<TTSResult | null>,
    serviceName: string = 'elevenlabs'
  ): Promise<TTSResult | null> {
    if (this.shouldUseFallback(serviceName)) {
      console.log(`🔄 Using fallback for ${serviceName} operation`);
      return fallbackOperation();
    }
    
    try {
      const result = await operation();
      errorRecoveryService.recordSuccess(serviceName);
      return result;
    } catch (error) {
      console.log(`⚠️ TTS operation failed, switching to fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errorRecoveryService.recordFailure(serviceName, error instanceof Error ? error.message : 'Unknown error');
      return fallbackOperation();
    }
  }

  /**
   * Get sentence templates for different parts of speech
   */
  private getSentenceTemplates(partOfSpeech: string): string[] {
    const templates: Record<string, string[]> = {
      noun: [
        'The {word} was sitting on the table.',
        'I saw a big {word} in the park.',
        'My teacher showed us a {word} today.'
      ],
      verb: [
        'The children like to {word} outside.',
        'We will {word} after lunch.',
        'She can {word} very well.'
      ],
      adjective: [
        'The {word} dog ran quickly.',
        'This book is very {word}.',
        'We found a {word} flower in the garden.'
      ],
      adverb: [
        'She walked {word} to school.',
        'The bird sang {word} in the tree.',
        'He answered the question {word}.'
      ]
    };
    
    return templates[partOfSpeech.toLowerCase()] || templates.noun;
  }

  /**
   * Simple heuristic to guess part of speech
   */
  private guessPartOfSpeech(word: string): string {
    const lowerWord = word.toLowerCase();
    
    // Simple heuristics based on common suffixes
    if (lowerWord.endsWith('ing') || lowerWord.endsWith('ed') || lowerWord.endsWith('s')) {
      return 'verb';
    }
    
    if (lowerWord.endsWith('ly')) {
      return 'adverb';
    }
    
    if (lowerWord.endsWith('er') || lowerWord.endsWith('est') || lowerWord.endsWith('ful') || lowerWord.endsWith('less')) {
      return 'adjective';
    }
    
    // Default to noun
    return 'noun';
  }
}

// Export singleton instance
export const gracefulDegradationService = new GracefulDegradationService();