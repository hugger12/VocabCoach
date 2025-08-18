import { useState, useCallback } from "react";

interface AudioCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
}

interface UseAudioCacheReturn {
  getCachedAudio: (cacheKey: string) => string | null;
  cacheAudio: (cacheKey: string, blob: Blob) => string;
  clearCache: () => void;
  getCacheSize: () => number;
}

const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 50; // Maximum number of cached audio files

export function useAudioCache(): UseAudioCacheReturn {
  const [cache, setCache] = useState<Map<string, AudioCacheEntry>>(new Map());

  const getCachedAudio = useCallback((cacheKey: string): string | null => {
    const entry = cache.get(cacheKey);
    if (!entry) return null;

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
      // Clean up expired entry
      URL.revokeObjectURL(entry.url);
      setCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(cacheKey);
        return newCache;
      });
      return null;
    }

    return entry.url;
  }, [cache]);

  const cacheAudio = useCallback((cacheKey: string, blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    const entry: AudioCacheEntry = {
      url,
      blob,
      timestamp: Date.now(),
    };

    setCache(prev => {
      const newCache = new Map(prev);
      
      // If we're at max capacity, remove oldest entry
      if (newCache.size >= MAX_CACHE_SIZE) {
        let oldestKey = "";
        let oldestTime = Date.now();
        
        for (const [key, value] of Array.from(newCache.entries())) {
          if (value.timestamp < oldestTime) {
            oldestTime = value.timestamp;
            oldestKey = key;
          }
        }
        
        if (oldestKey) {
          const oldEntry = newCache.get(oldestKey);
          if (oldEntry) {
            URL.revokeObjectURL(oldEntry.url);
          }
          newCache.delete(oldestKey);
        }
      }
      
      // Add new entry
      newCache.set(cacheKey, entry);
      return newCache;
    });

    return url;
  }, []);

  const clearCache = useCallback(() => {
    // Clean up all URLs
    cache.forEach(entry => {
      URL.revokeObjectURL(entry.url);
    });
    setCache(new Map());
  }, [cache]);

  const getCacheSize = useCallback(() => {
    return cache.size;
  }, [cache]);

  return {
    getCachedAudio,
    cacheAudio,
    clearCache,
    getCacheSize,
  };
}
