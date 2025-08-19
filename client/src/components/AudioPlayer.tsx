import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, RotateCcw, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioCache } from "@/hooks/use-audio-cache";
import { cn } from "@/lib/utils";

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
  "data-testid": testId,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { getCachedAudio, cacheAudio } = useAudioCache();

  const generateCacheKey = useCallback((text: string, type: string, speed: string) => {
    return `${type}-${speed}-${text}`.replace(/[^a-zA-Z0-9]/g, "_");
  }, []);

  const playAudio = useCallback(async () => {
    if (isPlaying) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
      }
      return;
    }

    setIsLoading(true);
    setHasError(false);
    onPlay?.();

    try {
      const cacheKey = generateCacheKey(text, type, speed);
      let audioUrl = getCachedAudio(cacheKey);

      if (!audioUrl) {
        // Generate new audio
        const endpoint = speed === "slow" ? "/api/audio/slow" : "/api/audio/generate";
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
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        audioUrl = cacheAudio(cacheKey, audioBlob);
      }

      // Play the audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        console.log('Audio started playing:', type, text.substring(0, 50));
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
      };

      audio.onended = () => {
        console.log('Audio ended:', type, text.substring(0, 50));
        setIsPlaying(false);
        onEnded?.();
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        setHasError(true);
        onError?.("Failed to play audio");
      };

      await audio.play();
    } catch (error) {
      console.error("Audio playback error:", error);
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
      aria-label={`${isPlaying ? "Stop" : "Play"} ${type === "word" ? "word" : "sentence"}: ${text}`}
      aria-pressed={isPlaying}
    >
      {children ? children : getIcon()}
    </Button>
  );
}
