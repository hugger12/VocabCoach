// Enhanced TTS service with persistent caching, deduplication, and file system storage
import { createHash } from 'crypto';
import { writeFile, readFile, mkdir, access, stat, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { constants as fsConstants } from 'fs';
import { resilientOperation, DefaultConfigs, getUserFriendlyErrorMessage, ServiceError } from '@shared/errorHandling.js';
import { circuitBreakerManager } from './circuitBreakerManager.js';
import { gracefulDegradationService } from './gracefulDegradation.js';
import { errorRecoveryService } from './errorRecovery.js';

export interface TTSOptions {
  text: string;
  type: "word" | "sentence";
  voiceSettings?: {
    stability?: number;
    clarity?: number;
    speed?: number;
  };
}

export interface WordTiming {
  word: string;
  startTimeMs: number;
  endTimeMs: number;
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  provider: "elevenlabs";
  duration?: number;
  cacheKey: string;
  wordTimings?: WordTiming[]; // Added for precise word highlighting
}

export class TTSService {
  private elevenLabsApiKey = process.env.ELEVENLABS_WORD_WIZARD || process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_KEY || "";
  private elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default child-friendly voice
  private readonly cacheDir = join(process.cwd(), 'server', 'audio-cache');
  private readonly modelId = "eleven_flash_v2_5"; // Consistent model for caching
  
  // Global concurrency limiter for ElevenLabs API
  private static activeConcurrentRequests = 0;
  private static readonly MAX_CONCURRENT_REQUESTS = 6; // Conservative limit
  private static requestQueue: (() => void)[] = [];
  
  private static async acquireSlot(): Promise<void> {
    return new Promise((resolve) => {
      if (TTSService.activeConcurrentRequests < TTSService.MAX_CONCURRENT_REQUESTS) {
        TTSService.activeConcurrentRequests++;
        console.log(`ElevenLabs request slot acquired (${TTSService.activeConcurrentRequests}/${TTSService.MAX_CONCURRENT_REQUESTS})`);
        resolve();
      } else {
        console.log(`ElevenLabs request queued (${TTSService.requestQueue.length + 1} in queue)`);
        TTSService.requestQueue.push(resolve);
      }
    });
  }
  
  private static releaseSlot(): void {
    TTSService.activeConcurrentRequests--;
    console.log(`ElevenLabs request slot released (${TTSService.activeConcurrentRequests}/${TTSService.MAX_CONCURRENT_REQUESTS})`);
    
    if (TTSService.requestQueue.length > 0) {
      const nextResolve = TTSService.requestQueue.shift()!;
      TTSService.activeConcurrentRequests++;
      console.log(`ElevenLabs request dequeued (${TTSService.activeConcurrentRequests}/${TTSService.MAX_CONCURRENT_REQUESTS}, ${TTSService.requestQueue.length} remaining)`);
      nextResolve();
    }
  }

  // Note: Retry logic is now handled by resilientOperation from shared/errorHandling.js
  // Custom retry methods removed to avoid duplication

  async generateAudio(options: TTSOptions): Promise<TTSResult> {
    const cacheKey = this.generateCacheKey(options);
    const circuitBreaker = circuitBreakerManager.getCircuitBreaker('elevenlabs', 'generateAudio');
    
    if (!this.elevenLabsApiKey) {
      throw new ServiceError(
        'ElevenLabs API key not configured',
        'elevenlabs',
        'generateAudio',
        'MISSING_API_KEY',
        false
      );
    }

    return resilientOperation(
      async () => {
        // Acquire global concurrency slot before making any API requests
        await TTSService.acquireSlot();
        
        try {
          const startTime = Date.now();
          let result: TTSResult;
          
          // Use ElevenLabs exclusively with timestamps for sentences
          if (options.type === "sentence") {
            const audioResult = await this.generateElevenLabsAudioWithTimestamps(options);
            result = {
              ...audioResult,
              provider: "elevenlabs" as const,
              cacheKey,
            };
          } else {
            // For individual words, use regular ElevenLabs without timestamps
            const audioBuffer = await this.generateElevenLabsAudio(options);
            result = {
              audioBuffer,
              provider: "elevenlabs" as const,
              cacheKey,
            };
          }
          
          // Record successful operation
          const responseTime = Date.now() - startTime;
          errorRecoveryService.recordSuccess('elevenlabs', responseTime);
          
          return result;
        } finally {
          // Always release the slot, even if there was an error
          TTSService.releaseSlot();
        }
      },
      {
        service: 'elevenlabs',
        operation: 'generateAudio',
        timeout: DefaultConfigs.elevenLabs.timeout,
        retry: DefaultConfigs.elevenLabs.retry,
        circuitBreaker
      }
    ).catch(error => {
      console.error(`ElevenLabs TTS failed for text "${options.text.substring(0, 50)}...":`, error);
      // Record failure for health monitoring
      errorRecoveryService.recordFailure('elevenlabs', error instanceof Error ? error.message : 'Unknown error');
      
      throw new ServiceError(
        getUserFriendlyErrorMessage(error, 'teacher'),
        'elevenlabs',
        'generateAudio',
        'AUDIO_GENERATION_FAILED',
        error instanceof ServiceError ? error.isRetryable : true,
        error
      );
    });
  }

  private preprocessText(text: string): string {
    // Expand common abbreviations for better pronunciation
    return text
      .replace(/\(n\.\)/gi, '(noun)')
      .replace(/\(v\.\)/gi, '(verb)')  
      .replace(/\(adj\.\)/gi, '(adjective)')
      .replace(/\(adv\.\)/gi, '(adverb)')
      .replace(/\(prep\.\)/gi, '(preposition)')
      .replace(/\(conj\.\)/gi, '(conjunction)')
      .replace(/\(interj\.\)/gi, '(interjection)')
      .replace(/\(pron\.\)/gi, '(pronoun)');
  }

  private async generateElevenLabsAudio(options: TTSOptions): Promise<ArrayBuffer> {
    const { text, voiceSettings = {} } = options;
    const processedText = this.preprocessText(text);
    
    const requestBody = {
      text: processedText,
      voice_settings: {
        stability: voiceSettings.stability ?? 0.5,
        similarity_boost: voiceSettings.clarity ?? 0.75,
        style: 0.0, // Neutral style for educational content
        use_speaker_boost: true,
      },
      model_id: "eleven_flash_v2_5", // Fast, high-quality model for real-time applications
    };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": this.elevenLabsApiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.arrayBuffer();
  }

  private async generateElevenLabsAudioWithTimestamps(options: TTSOptions): Promise<{ audioBuffer: ArrayBuffer; wordTimings: WordTiming[] }> {
    const { text, voiceSettings = {} } = options;
    const processedText = this.preprocessText(text);
    
    const requestBody = {
      text: processedText,
      voice_settings: {
        stability: voiceSettings.stability ?? 0.5,
        similarity_boost: voiceSettings.clarity ?? 0.75,
        style: 0.0, // Neutral style for educational content
        use_speaker_boost: true,
      },
      model_id: "eleven_flash_v2_5", // Fast, high-quality model for real-time applications
    };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "xi-api-key": this.elevenLabsApiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    // Convert base64 audio to ArrayBuffer
    const audioBuffer = this.base64ToArrayBuffer(result.audio_base64);
    
    // Convert character timings to word timings
    const wordTimings = this.extractWordTimings(
      result.alignment.characters,
      result.alignment.character_start_times_seconds,
      result.alignment.character_end_times_seconds
    );

    console.log(`Generated audio with ${wordTimings.length} word timings for text: "${text.substring(0, 50)}..."`);
    
    return { audioBuffer, wordTimings };
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private extractWordTimings(chars: string[], startTimes: number[], endTimes: number[]): WordTiming[] {
    const wordTimings: WordTiming[] = [];
    let currentWord = "";
    let wordStartTime = 0;
    let wordEndTime = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      if (char === " " || char === "\n" || char === "\t") {
        // End of word
        if (currentWord.trim().length > 0) {
          wordTimings.push({
            word: currentWord.trim(),
            startTimeMs: wordStartTime * 1000, // Convert to milliseconds
            endTimeMs: wordEndTime * 1000,
          });
        }
        // Reset for next word
        currentWord = "";
        wordStartTime = 0;
        wordEndTime = 0;
      } else {
        // Building current word
        if (currentWord === "") {
          wordStartTime = startTimes[i];
        }
        currentWord += char;
        wordEndTime = endTimes[i];
      }
    }

    // Handle last word if text doesn't end with space
    if (currentWord.trim().length > 0) {
      wordTimings.push({
        word: currentWord.trim(),
        startTimeMs: wordStartTime * 1000,
        endTimeMs: wordEndTime * 1000,
      });
    }

    return wordTimings;
  }

  /**
   * Generate robust content-based cache key for optimal deduplication
   * Uses crypto hashing and content normalization to ensure identical content
   * produces identical cache keys across users and sessions
   */
  generateCacheKey(options: TTSOptions): string {
    const { text, type, voiceSettings = {} } = options;
    
    // Normalize text content for consistent hashing
    const normalizedText = this.normalizeTextForCaching(text);
    
    // Create consistent voice settings object
    const normalizedSettings = {
      stability: voiceSettings.stability ?? 0.5,
      clarity: voiceSettings.clarity ?? 0.75,
      speed: voiceSettings.speed ?? 1.0
    };
    
    // Create content hash with all factors that affect audio generation
    const contentForHashing = {
      provider: "elevenlabs",
      voiceId: this.elevenLabsVoiceId,
      model: this.modelId,
      text: normalizedText,
      type: type,
      withTimestamps: type === "sentence",
      voiceSettings: normalizedSettings
    };
    
    // Generate SHA-256 hash for robust content identification
    const contentString = JSON.stringify(contentForHashing, Object.keys(contentForHashing).sort());
    const hash = createHash('sha256').update(contentString, 'utf8').digest('hex');
    
    // Create readable cache key with hash
    return `elevenlabs_${type}_${hash.substring(0, 16)}`;
  }

  /**
   * Generate content hash for deduplication (separate from cache key)
   */
  generateContentHash(options: TTSOptions): string {
    const { text, type, voiceSettings = {} } = options;
    const normalizedText = this.normalizeTextForCaching(text);
    
    const normalizedSettings = {
      stability: voiceSettings.stability ?? 0.5,
      clarity: voiceSettings.clarity ?? 0.75,
      speed: voiceSettings.speed ?? 1.0
    };
    
    const contentForHashing = {
      provider: "elevenlabs",
      voiceId: this.elevenLabsVoiceId,
      model: this.modelId,
      text: normalizedText,
      type: type,
      withTimestamps: type === "sentence",
      voiceSettings: normalizedSettings
    };
    
    const contentString = JSON.stringify(contentForHashing, Object.keys(contentForHashing).sort());
    return createHash('sha256').update(contentString, 'utf8').digest('hex');
  }

  /**
   * Normalize text content for consistent caching
   * Removes variations that don't affect audio generation
   */
  private normalizeTextForCaching(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase() // Normalize case for definition text
      .replace(/[""'']/g, '"') // Normalize quotes
      .replace(/[\u2013\u2014]/g, '-'); // Normalize dashes
  }

  /**
   * Get file path for cached audio file
   */
  private getAudioFilePath(cacheKey: string, type: string): string {
    // Organize by type and then by first two chars of cache key for distribution
    const subDir = cacheKey.substring(cacheKey.lastIndexOf('_') + 1, cacheKey.lastIndexOf('_') + 3);
    return join(this.cacheDir, type, subDir, `${cacheKey}.mp3`);
  }

  /**
   * Ensure cache directory structure exists
   */
  private async ensureCacheDir(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    try {
      await access(dir, fsConstants.F_OK);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Save audio buffer to persistent file storage
   */
  async saveAudioToFile(audioBuffer: ArrayBuffer, cacheKey: string, type: string): Promise<string> {
    const filePath = this.getAudioFilePath(cacheKey, type);
    await this.ensureCacheDir(filePath);
    
    const buffer = Buffer.from(audioBuffer);
    await writeFile(filePath, buffer);
    
    console.log(`Saved audio cache file: ${filePath} (${buffer.length} bytes)`);
    return filePath;
  }

  /**
   * Load audio buffer from persistent file storage
   */
  async loadAudioFromFile(filePath: string): Promise<ArrayBuffer | null> {
    try {
      await access(filePath, fsConstants.F_OK);
      const buffer = await readFile(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      return null;
    }
  }

  /**
   * Get file size for cleanup metrics
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Delete audio file from persistent storage
   */
  async deleteAudioFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      console.log(`Deleted audio cache file: ${filePath}`);
    } catch (error) {
      console.warn(`Failed to delete audio file ${filePath}:`, error);
    }
  }

  async generateSlowAudio(text: string): Promise<TTSResult> {
    return this.generateAudio({
      text,
      type: "word",
      voiceSettings: {
        speed: 0.7, // Slower for pronunciation practice
        stability: 0.7,
        clarity: 0.8,
      },
    });
  }

  async generateChunkedAudio(syllables: string[]): Promise<TTSResult[]> {
    const results: TTSResult[] = [];
    
    for (const syllable of syllables) {
      try {
        const result = await this.generateAudio({
          text: syllable,
          type: "word",
          voiceSettings: {
            speed: 0.6,
            stability: 0.8,
            clarity: 0.9,
          },
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to generate audio for syllable: ${syllable}`, error);
      }
    }
    
    return results;
  }
}

export const ttsService = new TTSService();
