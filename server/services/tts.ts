// TTS service for ElevenLabs with word-level timing synchronization

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

  // Retry wrapper for handling ElevenLabs rate limits
  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit error (429) - more comprehensive detection
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRateLimit = errorMessage.includes('429') || 
                           errorMessage.includes('Too Many Requests') || 
                           errorMessage.includes('too_many_concurrent_requests');
        
        if (isRateLimit) {
          if (attempt < maxRetries) {
            const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
            console.log(`Rate limit detected, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1}) - Error: ${errorMessage.substring(0, 100)}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          console.log(`Rate limit retry exhausted after ${maxRetries} attempts`);
        }
        
        // For non-rate-limit errors, fail immediately
        if (attempt === 0 && !isRateLimit) {
          throw error;
        }
        
        // If we've exhausted retries or it's not a rate limit error, throw
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    throw lastError!;
  }

  async generateAudio(options: TTSOptions): Promise<TTSResult> {
    const cacheKey = this.generateCacheKey(options);
    
    if (!this.elevenLabsApiKey) {
      throw new Error("ElevenLabs API key is required. Please configure ELEVENLABS_API_KEY environment variable.");
    }

    // Acquire global concurrency slot before making any API requests
    await TTSService.acquireSlot();
    
    try {
      // Use ElevenLabs exclusively with timestamps for sentences
      if (options.type === "sentence") {
        const result = await this.retryWithExponentialBackoff(() => 
          this.generateElevenLabsAudioWithTimestamps(options)
        );
        return {
          ...result,
          provider: "elevenlabs",
          cacheKey,
        };
      } else {
        // For individual words, use regular ElevenLabs without timestamps
        const audioBuffer = await this.retryWithExponentialBackoff(() => 
          this.generateElevenLabsAudio(options)
        );
        return {
          audioBuffer,
          provider: "elevenlabs",
          cacheKey,
        };
      }
    } catch (error) {
      console.error("ElevenLabs TTS failed after retries:", error);
      throw new Error(`ElevenLabs TTS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Always release the slot, even if there was an error
      TTSService.releaseSlot();
    }
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

  generateCacheKey(options: TTSOptions): string {
    const { text, type, voiceSettings = {} } = options;
    const settingsStr = JSON.stringify(voiceSettings);
    const withTimestamps = type === "sentence" ? "timestamps" : "notimestamps";
    
    // Simple hash for cache key
    const content = `elevenlabs-${withTimestamps}-${text}-${settingsStr}`;
    return Buffer.from(content).toString('base64url');
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
