interface AudioCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  wordTimings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }> | null;
}

interface CachedAudioData {
  url: string;
  wordTimings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }> | null;
}

const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 50; // Maximum number of cached audio files

class AudioCacheUtil {
  private cache: Map<string, AudioCacheEntry> = new Map();

  getCachedAudio(cacheKey: string): CachedAudioData | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
      // Clean up expired entry
      URL.revokeObjectURL(entry.url);
      this.cache.delete(cacheKey);
      return null;
    }

    return {
      url: entry.url,
      wordTimings: entry.wordTimings,
    };
  }

  cacheAudio(cacheKey: string, blob: Blob, wordTimings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }> | null): string {
    const url = URL.createObjectURL(blob);
    const entry: AudioCacheEntry = {
      url,
      blob,
      timestamp: Date.now(),
      wordTimings,
    };

    // If we're at max capacity, remove oldest entry
    if (this.cache.size >= MAX_CACHE_SIZE) {
      let oldestKey = "";
      let oldestTime = Date.now();
      
      for (const [key, value] of Array.from(this.cache.entries())) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        const oldEntry = this.cache.get(oldestKey);
        if (oldEntry) {
          URL.revokeObjectURL(oldEntry.url);
        }
        this.cache.delete(oldestKey);
      }
    }
    
    // Add new entry
    this.cache.set(cacheKey, entry);
    return url;
  }

  clearCache(): void {
    // Clean up all URLs
    this.cache.forEach(entry => {
      URL.revokeObjectURL(entry.url);
    });
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance for global use
export const audioCacheUtil = new AudioCacheUtil();