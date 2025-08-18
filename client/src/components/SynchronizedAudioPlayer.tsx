import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, RotateCcw, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioCache } from "@/hooks/use-audio-cache";
import { cn } from "@/lib/utils";

interface WordTiming {
  word: string;
  originalWord: string;
  startTime: number;
  endTime: number;
  index: number;
}

interface SynchronizedAudioPlayerProps {
  text: string;
  type: "word" | "sentence";
  variant?: "primary" | "secondary" | "outline";
  children?: React.ReactNode;
  className?: string;
  wordId?: string;
  sentenceId?: string;
  onPlay?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onWordHighlight?: (wordIndex: number) => void;
  enableHighlighting?: boolean;
  "data-testid"?: string;
}

export function SynchronizedAudioPlayer({
  text,
  type,
  variant = "primary",
  children,
  className,
  wordId,
  sentenceId,
  onPlay,
  onEnded,
  onError,
  onWordHighlight,
  enableHighlighting = false,
  "data-testid": testId,
}: SynchronizedAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState(-1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimingsRef = useRef<WordTiming[]>([]);
  const { getCachedAudio, cacheAudio } = useAudioCache();

  const generateCacheKey = useCallback((text: string, type: string) => {
    return `${type}-${text}`.replace(/[^a-zA-Z0-9]/g, "_");
  }, []);

  const playAudio = useCallback(async () => {
    if (isPlaying) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentHighlightIndex(-1);
      }
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    setHasError(false);
    setCurrentHighlightIndex(-1);
    onPlay?.();

    try {
      const cacheKey = generateCacheKey(text, type);
      let audioUrl: string | null = getCachedAudio(cacheKey);
      let wordTimings: WordTiming[] = [];

      if (!audioUrl || (enableHighlighting && type === "sentence")) {
        // Generate new audio with timing data for sentences
        const endpoint = "/api/audio/generate";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            type,
            wordId,
            sentenceId,
            includeTimings: enableHighlighting && type === "sentence",
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (enableHighlighting && type === "sentence") {
          // Parse JSON response with timing data
          const data = await response.json();
          audioUrl = data.audioData;
          wordTimings = data.wordTimings || [];
          wordTimingsRef.current = wordTimings;
          console.log('Received word timings:', wordTimings);
        } else {
          // Standard audio blob response
          const audioBlob = await response.blob();
          audioUrl = cacheAudio(cacheKey, audioBlob) || "";
        }
      }

      // Play the audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl || "");
      audioRef.current = audio;

      audio.onplay = () => {
        console.log('Audio started playing:', type, text.substring(0, 50));
        setIsPlaying(true);
        setIsLoading(false);
        
        // Start word highlighting for sentences
        if (enableHighlighting && type === "sentence" && wordTimingsRef.current.length > 0) {
          console.log('Starting synchronized highlighting with timings');
          timeUpdateIntervalRef.current = setInterval(() => {
            if (audio.currentTime) {
              const currentTime = audio.currentTime;
              
              // Find which word should be highlighted
              const activeWordIndex = wordTimingsRef.current.findIndex(timing => 
                currentTime >= timing.startTime && currentTime <= timing.endTime
              );
              
              if (activeWordIndex !== -1 && activeWordIndex !== currentHighlightIndex) {
                setCurrentHighlightIndex(activeWordIndex);
                onWordHighlight?.(activeWordIndex);
                console.log('Highlighting word:', activeWordIndex, wordTimingsRef.current[activeWordIndex]?.word);
              }
            }
          }, 50); // Update every 50ms for smooth highlighting
        }
        
        onPlay?.();
      };

      audio.onended = () => {
        console.log('Audio ended:', type, text.substring(0, 50));
        setIsPlaying(false);
        setCurrentHighlightIndex(-1);
        
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
          timeUpdateIntervalRef.current = null;
        }
        
        onWordHighlight?.(-1);
        onEnded?.();
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        setHasError(true);
        setCurrentHighlightIndex(-1);
        
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
          timeUpdateIntervalRef.current = null;
        }
        
        onError?.("Failed to play audio");
      };

      await audio.play();
    } catch (error) {
      console.error("Audio playback error:", error);
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);
      setCurrentHighlightIndex(-1);
      onError?.(error instanceof Error ? error.message : "Audio playback failed");
    }
  }, [
    text,
    type,
    wordId,
    sentenceId,
    isPlaying,
    enableHighlighting,
    generateCacheKey,
    getCachedAudio,
    cacheAudio,
    onPlay,
    onEnded,
    onError,
    onWordHighlight,
    currentHighlightIndex
  ]);

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
    <Button
      onClick={playAudio}
      disabled={isLoading}
      className={cn(getVariantStyles(), className)}
      data-testid={testId}
    >
      {getIcon()}
      {children && <span className="ml-2">{children}</span>}
    </Button>
  );
}