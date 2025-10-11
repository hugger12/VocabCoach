import { audioCacheUtil } from "@/lib/audioCacheUtil";
import { getWordsArray } from "@/utils/tokenization";

export interface AudioPlaybackOptions {
  speed?: "normal" | "slow";
  autoPlay?: boolean;
  useRealtimeSync?: boolean;
  onWordHighlight?: (wordIndex: number) => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onPlay?: () => void;
}

export interface AudioCacheEntry {
  url: string;
  duration?: number;
  timings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }>;
  provider: string;
}

export interface WordBoundary {
  start: number;
  end: number;
  word: string;
}

export interface AudioPlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTime: number;
  duration: number;
  currentWordIndex: number;
}

/**
 * Domain service for audio-related business logic
 * Handles audio caching, TTS selection, playback orchestration, and word highlighting
 */
export class AudioService {
  private audioElements: Set<HTMLAudioElement> = new Set();
  private activeCallbacks: Map<HTMLAudioElement, {
    onWordHighlight?: (wordIndex: number) => void;
    onEnded?: () => void;
    onError?: (error: string) => void;
    onPlay?: () => void;
  }> = new Map();

  /**
   * Generate cache key for audio content
   */
  generateCacheKey(text: string, type: string, speed: string): string {
    return `${type}-${speed}-${text}`.replace(/[^a-zA-Z0-9]/g, "_");
  }

  /**
   * Register audio element for global management
   */
  registerAudio(audio: HTMLAudioElement, callbacks?: AudioPlaybackOptions): void {
    this.audioElements.add(audio);
    
    if (callbacks) {
      this.activeCallbacks.set(audio, {
        onWordHighlight: callbacks.onWordHighlight,
        onEnded: callbacks.onEnded,
        onError: callbacks.onError,
        onPlay: callbacks.onPlay
      });
    }
    
    // Clean up when audio ends or errors
    const cleanup = () => {
      this.audioElements.delete(audio);
      this.activeCallbacks.delete(audio);
    };
    
    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', cleanup);
  }

  /**
   * Stop all registered audio playback
   */
  stopAllAudio(): void {
    console.log(`Stopping ${this.audioElements.size} tracked audio elements`);
    
    // Stop all tracked audio elements
    this.audioElements.forEach((audio, index) => {
      if (!audio.paused) {
        console.log(`Stopping tracked audio ${index}`);
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Also stop any untracked audio elements in the DOM
    const domAudios = document.querySelectorAll('audio');
    console.log(`Found ${domAudios.length} audio elements in DOM`);
    domAudios.forEach((audio, index) => {
      if (!audio.paused) {
        console.log(`Stopping DOM audio ${index}`);
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Stop speech synthesis
    if (speechSynthesis.speaking) {
      console.log('Stopping speech synthesis');
      speechSynthesis.cancel();
    }

    // Clear tracked elements
    this.audioElements.clear();
    this.activeCallbacks.clear();
  }

  /**
   * Remove audio element from tracking
   */
  unregisterAudio(audio: HTMLAudioElement): void {
    this.audioElements.delete(audio);
    this.activeCallbacks.delete(audio);
  }

  /**
   * Compute word boundaries for real-time highlighting
   */
  computeWordBoundaries(
    text: string, 
    timings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }>, 
    duration?: number
  ): WordBoundary[] {
    // Use shared tokenization utility to ensure perfect sync with DyslexicReader
    const allWords = getWordsArray(text);

    if (allWords.length === 0) {
      return [];
    }

    // Use ElevenLabs timings when available (convert ms to seconds)
    if (timings && timings.length > 0) {
      // Validate timing count matches tokenized word count
      if (timings.length !== allWords.length) {
        console.warn(`Timing mismatch: ${timings.length} timings vs ${allWords.length} tokenized words`);
        console.warn("Tokenized words:", allWords);
        console.warn("Timing words:", timings.map(t => t.word));
        
        // Fall back to estimated boundaries
        return this.estimateWordBoundaries(allWords, duration || 0);
      }

      // Map timings to boundaries (convert milliseconds to seconds)
      return timings.map((timing, index) => ({
        start: timing.startTimeMs / 1000,
        end: timing.endTimeMs / 1000,
        word: allWords[index] || timing.word
      }));
    }

    // Estimate boundaries when no timings available
    return this.estimateWordBoundaries(allWords, duration || 0);
  }

  /**
   * Set up real-time word highlighting for audio playback
   */
  setupRealtimeHighlighting(
    audio: HTMLAudioElement,
    boundaries: WordBoundary[],
    onWordHighlight?: (wordIndex: number) => void
  ): () => void {
    let rafId: number | null = null;
    let lastIndex = -1;

    const updateHighlight = () => {
      if (!audio.paused && !audio.ended) {
        const currentTime = audio.currentTime;
        
        // Find current word based on timing
        const currentIndex = boundaries.findIndex((boundary, index) => {
          return currentTime >= boundary.start && 
                 (index === boundaries.length - 1 || currentTime < boundaries[index + 1].start);
        });

        // Only trigger callback if index changed
        if (currentIndex !== lastIndex && currentIndex >= 0) {
          lastIndex = currentIndex;
          onWordHighlight?.(currentIndex);
        }

        rafId = requestAnimationFrame(updateHighlight);
      }
    };

    // Start highlighting when audio plays
    const startHighlighting = () => {
      if (rafId) cancelAnimationFrame(rafId);
      updateHighlight();
    };

    // Stop highlighting when audio pauses/ends
    const stopHighlighting = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastIndex = -1;
    };

    audio.addEventListener('play', startHighlighting);
    audio.addEventListener('pause', stopHighlighting);
    audio.addEventListener('ended', stopHighlighting);

    // Return cleanup function
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      audio.removeEventListener('play', startHighlighting);
      audio.removeEventListener('pause', stopHighlighting);
      audio.removeEventListener('ended', stopHighlighting);
    };
  }

  /**
   * Create audio element with proper event handling and caching
   */
  async createAudioElement(
    text: string,
    type: "word" | "sentence",
    options: AudioPlaybackOptions = {}
  ): Promise<HTMLAudioElement> {
    const cacheKey = this.generateCacheKey(text, type, options.speed || "normal");
    
    try {
      // Try to get cached audio first
      const cachedAudio = audioCacheUtil.getCachedAudio(cacheKey);
      if (cachedAudio) {
        const audio = new Audio(cachedAudio.url);
        this.setupAudioElement(audio, { ...cachedAudio, provider: 'cached' }, text, options);
        return audio;
      }

      // If not cached, generate new audio
      const audioData = await this.generateAudio(text, type, options.speed || "normal");
      const audio = new Audio(audioData.url);
      this.setupAudioElement(audio, audioData, text, options);
      return audio;
    } catch (error) {
      console.error("Error creating audio element:", error);
      throw new Error(`Failed to create audio for "${text}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate audio content before playback
   */
  validateAudioContent(text: string, type: "word" | "sentence"): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate text content
    if (!text || !text.trim()) {
      errors.push("Text content is required for audio generation");
    } else {
      const trimmedText = text.trim();
      
      if (trimmedText.length > 500) {
        warnings.push("Text is very long - audio generation may take longer");
      }
      
      if (type === "word" && trimmedText.includes(' ')) {
        warnings.push("Word type selected but text contains spaces");
      }
      
      if (type === "sentence" && trimmedText.length < 10) {
        warnings.push("Sentence type selected but text is very short");
      }
      
      // Check for potentially problematic characters
      if (/[<>{}[\]]/.test(trimmedText)) {
        warnings.push("Text contains special characters that may affect pronunciation");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get audio playback statistics
   */
  getPlaybackStats(): {
    activeAudioElements: number;
    totalRegisteredElements: number;
    hasSpeechSynthesis: boolean;
    speechSynthesisActive: boolean;
  } {
    const activeCount = Array.from(this.audioElements).filter(audio => !audio.paused).length;
    
    return {
      activeAudioElements: activeCount,
      totalRegisteredElements: this.audioElements.size,
      hasSpeechSynthesis: 'speechSynthesis' in window,
      speechSynthesisActive: speechSynthesis.speaking
    };
  }

  /**
   * Clear audio cache for specific content
   */
  async clearAudioCache(filters?: {
    type?: "word" | "sentence";
    olderThan?: Date;
    text?: string;
  }): Promise<number> {
    try {
      const response = await fetch('/api/audio/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters || {})
      });

      if (!response.ok) {
        throw new Error(`Failed to clear cache: ${response.status}`);
      }

      const result = await response.json();
      return result.deletedCount || 0;
    } catch (error) {
      console.error('Error clearing audio cache:', error);
      throw new Error('Failed to clear audio cache');
    }
  }

  /**
   * Private: Estimate word boundaries when no precise timings available
   */
  private estimateWordBoundaries(words: string[], duration: number): WordBoundary[] {
    if (words.length === 0 || duration <= 0) {
      return [];
    }

    const avgTimePerWord = duration / words.length;
    
    return words.map((word, index) => ({
      start: index * avgTimePerWord,
      end: (index + 1) * avgTimePerWord,
      word
    }));
  }

  /**
   * Private: Setup audio element with event handlers and caching
   */
  private setupAudioElement(
    audio: HTMLAudioElement,
    audioData: AudioCacheEntry,
    text: string,
    options: AudioPlaybackOptions
  ): void {
    // Register for global management
    this.registerAudio(audio, options);

    // Setup real-time highlighting if enabled
    if (options.useRealtimeSync && options.onWordHighlight) {
      const boundaries = this.computeWordBoundaries(text, audioData.timings, audioData.duration);
      this.setupRealtimeHighlighting(audio, boundaries, options.onWordHighlight);
    }

    // Setup event handlers
    audio.addEventListener('play', () => {
      // Stop other audio when this one plays
      this.audioElements.forEach(otherAudio => {
        if (otherAudio !== audio && !otherAudio.paused) {
          otherAudio.pause();
          otherAudio.currentTime = 0;
        }
      });
      
      options.onPlay?.();
    });

    audio.addEventListener('ended', () => {
      options.onEnded?.();
      this.unregisterAudio(audio);
    });

    audio.addEventListener('error', (e) => {
      const errorMsg = `Audio playback failed: ${e.message || 'Unknown error'}`;
      console.error(errorMsg);
      options.onError?.(errorMsg);
      this.unregisterAudio(audio);
    });

    // Auto-play if requested
    if (options.autoPlay) {
      audio.play().catch(error => {
        console.error("Auto-play failed:", error);
        options.onError?.(`Auto-play failed: ${error.message}`);
      });
    }
  }

  /**
   * Private: Generate new audio via API
   */
  private async generateAudio(
    text: string,
    type: "word" | "sentence",
    speed: "normal" | "slow"
  ): Promise<AudioCacheEntry> {
    const response = await fetch('/api/audio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type, speed })
    });

    if (!response.ok) {
      throw new Error(`Audio generation failed: ${response.status}`);
    }

    return await response.json();
  }
}

// Export singleton instance
export const audioService = new AudioService();