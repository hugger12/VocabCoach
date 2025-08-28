import { useState, useRef, useCallback } from "react";
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
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimingsRef = useRef<Array<{ word: string; startTimeMs: number; endTimeMs: number }> | null>(null);
  const { getCachedAudio, cacheAudio } = useAudioCache();

  const generateCacheKey = useCallback((text: string, type: string, speed: string) => {
    return `${type}-${speed}-${text}`.replace(/[^a-zA-Z0-9]/g, "_");
  }, []);

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setIsLoading(false);
      setHasError(false);
    }
    // Clear word highlighting timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    // Clear word timings
    wordTimingsRef.current = null;
    // Reset highlighting
    onWordHighlight?.(-1);
  }, [onWordHighlight]);

  const playAudio = useCallback(async () => {
    if (isPlaying) {
      stopCurrentAudio();
      return;
    }

    // Stop any existing audio first
    stopCurrentAudio();
    
    setIsLoading(true);
    setHasError(false);
    onPlay?.();

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
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // Register audio with global manager for tracking
      audioManager.registerAudio(audio);

      audio.onplay = () => {
        console.log('Audio started playing:', type, text.substring(0, 50));
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
        
        // Start word highlighting for sentences only
        if (type === "sentence" && onWordHighlight) {
          startWordHighlighting(audio);
        }
      };

      audio.onended = () => {
        console.log('Audio ended:', type, text.substring(0, 50));
        setIsPlaying(false);
        onEnded?.();
        
        // Clear highlighting when audio ends
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = null;
        }
        onWordHighlight?.(-1);
      };

      audio.onerror = (event) => {
        console.error("HTML Audio element error:", event);
        console.error("Audio URL that failed:", audioUrl);
        setIsPlaying(false);
        setIsLoading(false);
        setHasError(true);
        onError?.("Failed to play audio");
      };

      await audio.play();
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
  ]);

  // Word highlighting function for sentences using ElevenLabs precise timing
  const startWordHighlighting = useCallback((audio: HTMLAudioElement) => {
    if (type !== "sentence" || !onWordHighlight) return;
    
    // Use ElevenLabs word timings if available
    if (wordTimingsRef.current && wordTimingsRef.current.length > 0) {
      console.log(`Starting ElevenLabs word highlighting with ${wordTimingsRef.current.length} precise timings`);
      
      wordTimingsRef.current.forEach((wordTiming, index) => {
        const delay = wordTiming.startTimeMs; // ElevenLabs provides precise start time in milliseconds
        
        const timeoutId = setTimeout(() => {
          if (audio.paused || audio.ended) return; // Don't highlight if audio stopped
          console.log(`Highlighting word ${index}: "${wordTiming.word}" at ${wordTiming.startTimeMs}ms`);
          onWordHighlight(index);
          
          // Clear highlighting when word ends
          const clearDelay = wordTiming.endTimeMs - wordTiming.startTimeMs;
          setTimeout(() => {
            if (!audio.paused && !audio.ended) {
              // Only clear if we're not already highlighting the next word
              const nextWord = wordTimingsRef.current?.[index + 1];
              if (!nextWord || Date.now() >= wordTiming.endTimeMs) {
                onWordHighlight(-1);
              }
            }
          }, clearDelay);
          
        }, delay);
        
        // Store timeout for cleanup
        if (index === 0) {
          highlightTimeoutRef.current = timeoutId;
        }
      });
      
      return;
    }
    
    // Fallback to estimated timing if no ElevenLabs data
    const words = text.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return;
    
    const estimatedDuration = audio.duration || (words.length * 0.4);
    const timePerWord = estimatedDuration / words.length;
    
    console.log(`Using estimated word highlighting: ${words.length} words, ${estimatedDuration}s duration, ${timePerWord}s per word`);
    
    words.forEach((word, index) => {
      const delay = index * timePerWord * 1000;
      
      const timeoutId = setTimeout(() => {
        if (audio.paused || audio.ended) return;
        console.log(`Highlighting word ${index}: ${word} (estimated)`);
        onWordHighlight(index);
      }, delay);
      
      if (index === 0) {
        highlightTimeoutRef.current = timeoutId;
      }
    });
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
        <div className="flex items-center justify-center w-full h-full text-2xl">⏸</div>
      ) : hasError ? (
        <div className="flex items-center justify-center w-full h-full text-lg">❌</div>
      ) : (
        children || <div className="flex items-center justify-center w-full h-full text-2xl">▶</div>
      )}
    </button>
  );
}
