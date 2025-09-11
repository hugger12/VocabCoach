import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, VolumeX, RotateCcw, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioCache } from "@/hooks/use-audio-cache";
import { cn } from "@/lib/utils";
import { audioManager } from "@/lib/audioManager";

interface AudioPlayerProps {
  text: string;
  type: "word" | "sentence";
  variant?: "primary" | "secondary" | "outline";
  children?: React.ReactNode;
  className?: string;
  wordId?: string;
  sentenceId?: string;
  speed?: "normal" | "slow";
  onPlay?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onWordHighlight?: (wordIndex: number) => void;
  "data-testid"?: string;
  useRealtimeSync?: boolean; // Feature flag for real-time sync system
}

export function AudioPlayer({
  text,
  type,
  variant = "primary",
  children,
  className,
  wordId,
  sentenceId,
  speed = "normal",
  onPlay,
  onEnded,
  onError,
  onWordHighlight,
  "data-testid": testId,
  useRealtimeSync = import.meta.env.VITE_REALTIME_SYNC === 'false' ? false : true,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout[]>([]);
  const wordTimingsRef = useRef<Array<{ word: string; startTimeMs: number; endTimeMs: number }> | null>(null);
  
  // Real-time sync system refs
  const wordBoundariesRef = useRef<Array<{ start: number; end: number }>>([]);
  const rafIdRef = useRef<number | null>(null);
  const lastIndexRef = useRef<number>(-1);
  const { getCachedAudio, cacheAudio } = useAudioCache();

  const generateCacheKey = useCallback((text: string, type: string, speed: string) => {
    return `${type}-${speed}-${text}`.replace(/[^a-zA-Z0-9]/g, "_");
  }, []);

  // Compute word boundaries for real-time highlighting
  const computeBoundaries = useCallback((text: string, timings?: Array<{ word: string; startTimeMs: number; endTimeMs: number }>, duration?: number) => {
    // Tokenize exactly like DyslexicReader - split by lines first, then words
    const textLines = text.split(/\r?\n/);
    const allWords: string[] = [];
    
    textLines.forEach(line => {
      const lineWords = line.split(/\s+/).filter(word => word.length > 0);
      allWords.push(...lineWords);
    });

    if (allWords.length === 0) {
      return [];
    }

    // Use ElevenLabs timings when available (convert ms to seconds)
    if (timings && timings.length > 0) {
      // Guard: Verify timing count matches our tokenized word count
      if (timings.length !== allWords.length) {
        console.warn(`TokenizationMismatch: ElevenLabs returned ${timings.length} word timings but we tokenized ${allWords.length} words. Falling back to proportional distribution.`);
        // Fall through to proportional distribution
      } else {
        return timings.map(timing => ({
          start: timing.startTimeMs / 1000, // Convert ms to seconds
          end: timing.endTimeMs / 1000,     // Convert ms to seconds
        }));
      }
    }

    // Fallback to proportional word length distribution
    // Calculate total character count for proportional distribution
    const totalChars = allWords.reduce((sum, word) => sum + word.length, 0);
    const audioDuration = duration || (allWords.length * 0.4); // fallback estimate
    
    const boundaries: Array<{ start: number; end: number }> = [];
    let currentTime = 0;
    
    allWords.forEach((word, index) => {
      // Proportional time based on word length
      const wordProportion = word.length / totalChars;
      const wordDuration = audioDuration * wordProportion;
      
      boundaries.push({
        start: currentTime,
        end: currentTime + wordDuration,
      });
      
      currentTime += wordDuration;
    });
    
    return boundaries;
  }, []);

  // Real-time highlighting using requestAnimationFrame + audio.currentTime
  const startRealtimeHighlighting = useCallback((audio: HTMLAudioElement) => {
    if (type !== "sentence" || !onWordHighlight) return;
    
    // Reset tracking state
    lastIndexRef.current = -1;
    
    const syncLoop = () => {
      if (audio.paused || audio.ended) {
        rafIdRef.current = null;
        return;
      }
      
      const currentTime = audio.currentTime;
      const boundaries = wordBoundariesRef.current;
      
      if (boundaries.length === 0) {
        rafIdRef.current = requestAnimationFrame(syncLoop);
        return;
      }
      
      // Binary search to find active word index
      let activeIndex = -1;
      let left = 0;
      let right = boundaries.length - 1;
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const boundary = boundaries[mid];
        
        if (currentTime >= boundary.start && currentTime < boundary.end) {
          activeIndex = mid;
          break;
        } else if (currentTime < boundary.start) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
      
      // Only call onWordHighlight when index changes (performance optimization)
      if (activeIndex !== lastIndexRef.current) {
        lastIndexRef.current = activeIndex;
        onWordHighlight(activeIndex);
      }
      
      // Schedule next frame
      rafIdRef.current = requestAnimationFrame(syncLoop);
    };
    
    // Start the sync loop
    rafIdRef.current = requestAnimationFrame(syncLoop);
  }, [type, onWordHighlight]);

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      // Unregister from audio manager
      audioManager.unregisterAudio(audioRef.current);
    }
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(false);
    
    // Clean up real-time sync system
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastIndexRef.current = -1;
    wordBoundariesRef.current = [];
    
    // Clear legacy timeout system (fallback)
    highlightTimeoutRef.current.forEach(id => clearTimeout(id));
    highlightTimeoutRef.current = [];
    // Clear word timings
    wordTimingsRef.current = null;
    // Reset highlighting
    onWordHighlight?.(-1);
  }, [onWordHighlight]);

  // Reset state when text changes (new word/sentence) but don't stop current audio
  useEffect(() => {
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(false);
    
    // Clean up real-time sync system
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastIndexRef.current = -1;
    wordBoundariesRef.current = [];
    
    // Clear legacy timeout system (fallback)
    highlightTimeoutRef.current.forEach(id => clearTimeout(id));
    highlightTimeoutRef.current = [];
    // Clear word timings
    wordTimingsRef.current = null;
  }, [text]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioManager.unregisterAudio(audioRef.current);
      }
      // Clean up real-time sync system
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      // Clean up legacy timeout system
      highlightTimeoutRef.current.forEach(id => clearTimeout(id));
    };
  }, []);

  const playAudio = useCallback(async () => {
    if (isPlaying) {
      stopCurrentAudio();
      return;
    }

    // Don't stop current audio here - let the parent handle it via onPlay
    
    setIsLoading(true);
    setHasError(false);
    
    // Don't call onPlay here - we'll call it after audio is ready to play

    try {
      console.log("AudioPlayer starting playback for:", { type, wordId, sentenceId, text: text.substring(0, 50) });
      
      const cacheKey = generateCacheKey(text, type, speed);
      let audioUrl = getCachedAudio(cacheKey);

      if (!audioUrl) {
        console.log("No cached audio, generating new audio for:", cacheKey);
        
        // Process text to expand abbreviations for TTS
        const processedText = text
          .replace(/\(adj\)/gi, '(adjective)')
          .replace(/\(n\)/gi, '(noun)')
          .replace(/\(v\)/gi, '(verb)');
        
        // Generate new audio
        const endpoint = speed === "slow" ? "/api/audio/slow" : "/api/audio/generate";
        const requestBody = {
          text: processedText,
          type,
          wordId,
          sentenceId,
        };
        
        console.log("Requesting audio from:", endpoint, "with body:", requestBody);
        
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log("Audio API response status:", response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Audio API error response:", errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        // Check if response is JSON (includes word timings) or binary audio
        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
          // Response includes word timing data from ElevenLabs
          const jsonData = await response.json();
          console.log("Received audio with word timings:", jsonData.wordTimings);
          
          // Convert base64 audio to blob
          const audioBase64 = jsonData.audioData.split(',')[1]; // Remove data:audio/mpeg;base64, prefix
          const audioArrayBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0)).buffer;
          const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
          
          audioUrl = cacheAudio(cacheKey, audioBlob);
          console.log("Audio with timings cached with URL:", audioUrl);
          
          // Store word timings for highlighting
          if (jsonData.wordTimings && type === "sentence") {
            wordTimingsRef.current = jsonData.wordTimings;
            console.log("Stored word timings for highlighting:", jsonData.wordTimings);
          }
        } else {
          // Regular binary audio response (for words)
          const audioBlob = await response.blob();
          console.log("Received audio blob, size:", audioBlob.size);
          audioUrl = cacheAudio(cacheKey, audioBlob);
          console.log("Audio cached with URL:", audioUrl);
        }
      } else {
        console.log("Using cached audio:", audioUrl);
      }

      // Play the audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Precompute word boundaries when audio metadata is available
      audio.onloadedmetadata = () => {
        if (type === "sentence" && onWordHighlight) {
          const boundaries = computeBoundaries(text, wordTimingsRef.current || undefined, audio.duration);
          wordBoundariesRef.current = boundaries;
        }
      };

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
        
        // Start word highlighting for sentences only
        if (type === "sentence" && onWordHighlight) {
          if (useRealtimeSync) {
            // Ensure boundaries are computed before starting real-time highlighting
            if (wordBoundariesRef.current.length === 0) {
              const boundaries = computeBoundaries(text, wordTimingsRef.current || undefined, audio.duration);
              wordBoundariesRef.current = boundaries;
            }
            startRealtimeHighlighting(audio);
          } else {
            // Fallback to legacy setTimeout system
            startWordHighlighting(audio);
          }
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        onEnded?.();
        
        // Clean up real-time sync system
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        lastIndexRef.current = -1;
        
        // Clear legacy highlighting when audio ends
        highlightTimeoutRef.current.forEach(id => clearTimeout(id));
        highlightTimeoutRef.current = [];
        onWordHighlight?.(-1);
        
        // Unregister when audio ends naturally
        audioManager.unregisterAudio(audio);
      };

      // Listen for pause events (when audio is stopped externally)
      audio.onpause = () => {
        setIsPlaying(false);
        
        // Clean up real-time sync system
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        lastIndexRef.current = -1;
        
        // Clear legacy highlighting when audio is paused
        highlightTimeoutRef.current.forEach(id => clearTimeout(id));
        highlightTimeoutRef.current = [];
        onWordHighlight?.(-1);
      };

      audio.onerror = (event) => {
        console.error("HTML Audio element error:", event);
        console.error("Audio URL that failed:", audioUrl);
        setIsPlaying(false);
        setIsLoading(false);
        setHasError(true);
        onError?.("Failed to play audio");
        
        // Unregister on error
        audioManager.unregisterAudio(audio);
      };

      console.log("Attempting to play audio...");
      
      // Stop all other audio first, then register this audio
      audioManager.stopAllAudio();
      audioManager.registerAudio(audio);
      
      
      const playPromise = audio.play();
      console.log("Audio.play() promise created");
      await playPromise;
      console.log("Audio.play() promise resolved successfully");
    } catch (error) {
      console.error("Audio playback error:", error);
      console.error("Audio details - type:", type, "wordId:", wordId, "sentenceId:", sentenceId, "text:", text.substring(0, 100));
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);
      onError?.(error instanceof Error ? error.message : "Audio playback failed");
    }
  }, [
    text,
    type,
    speed,
    wordId,
    sentenceId,
    isPlaying,
    generateCacheKey,
    getCachedAudio,
    cacheAudio,
    onPlay,
    onEnded,
    onError,
    onWordHighlight,
    computeBoundaries,
    startRealtimeHighlighting,
    useRealtimeSync,
  ]);

  // Word highlighting function for sentences using ElevenLabs precise timing
  const startWordHighlighting = useCallback((audio: HTMLAudioElement) => {
    if (type !== "sentence" || !onWordHighlight) return;
    
    // Clear previous timeouts
    highlightTimeoutRef.current.forEach(id => clearTimeout(id));
    highlightTimeoutRef.current = [];
    
    // Use ElevenLabs word timings if available
    if (wordTimingsRef.current && wordTimingsRef.current.length > 0) {
      const timeoutIds: NodeJS.Timeout[] = [];
      
      wordTimingsRef.current.forEach((wordTiming, index) => {
        const delay = wordTiming.startTimeMs; // ElevenLabs provides precise start time in milliseconds
        
        const timeoutId = setTimeout(() => {
          if (audio.paused || audio.ended) return; // Don't highlight if audio stopped
          onWordHighlight(index);
          
          // Clear highlighting when word ends
          const clearDelay = wordTiming.endTimeMs - wordTiming.startTimeMs;
          const clearTimeoutId = setTimeout(() => {
            if (!audio.paused && !audio.ended) {
              // Only clear if we're not already highlighting the next word
              const nextWord = wordTimingsRef.current?.[index + 1];
              if (!nextWord || Date.now() >= wordTiming.endTimeMs) {
                onWordHighlight(-1);
              }
            }
          }, clearDelay);
          
          timeoutIds.push(clearTimeoutId);
        }, delay);
        
        timeoutIds.push(timeoutId);
      });
      
      highlightTimeoutRef.current = timeoutIds;
      return;
    }
    
    // Fallback to estimated timing if no ElevenLabs data
    const words = text.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return;
    
    const estimatedDuration = audio.duration || (words.length * 0.4);
    const timePerWord = estimatedDuration / words.length;
    
    const timeoutIds: NodeJS.Timeout[] = [];
    
    words.forEach((word, index) => {
      const delay = index * timePerWord * 1000;
      
      const timeoutId = setTimeout(() => {
        if (audio.paused || audio.ended) return;
        onWordHighlight(index);
      }, delay);
      
      timeoutIds.push(timeoutId);
    });
    
    highlightTimeoutRef.current = timeoutIds;
  }, [text, type, onWordHighlight]);

  const getIcon = () => {
    if (hasError) return <VolumeX className="w-5 h-5" />;
    if (isLoading) return <RotateCcw className="w-5 h-5 animate-spin" />;
    if (isPlaying) return <Pause className="w-5 h-5" />;
    return type === "word" ? <Play className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />;
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return "audio-control-primary";
      case "secondary":
        return "audio-control-secondary";
      case "outline":
        return "btn-dyslexia-outline";
      default:
        return "btn-dyslexia";
    }
  };

  return (
    <button
      onClick={playAudio}
      disabled={isLoading}
      className={cn(
        "inline-flex items-center justify-center transition-colors disabled:opacity-50",
        className
      )}
      data-testid={testId}
      aria-label={`${isPlaying ? "Stop" : "Play"} ${type === "word" ? "word" : "sentence"}: ${text}`}
      aria-pressed={isPlaying}
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
      ) : isPlaying ? (
        <Pause className="w-6 h-6" />
      ) : hasError ? (
        <VolumeX className="w-6 h-6" />
      ) : (
        children || <Play className="w-6 h-6" />
      )}
    </button>
  );
}
