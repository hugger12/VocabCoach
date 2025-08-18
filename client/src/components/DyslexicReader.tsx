import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DyslexicReaderProps {
  text: string;
  isPlaying: boolean;
  onWordHighlight?: (wordIndex: number) => void;
  className?: string;
  highlightColor?: string;
  speed?: number; // words per minute
}

export function DyslexicReader({
  text,
  isPlaying,
  onWordHighlight,
  className,
  highlightColor = "bg-yellow-200 dark:bg-yellow-600",
  speed = 150, // average reading speed for TTS
}: DyslexicReaderProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Split text into words
  useEffect(() => {
    const wordArray = text.split(/\s+/).filter(word => word.length > 0);
    setWords(wordArray);
    setCurrentWordIndex(-1);
  }, [text]);

  // Handle word highlighting during playback
  useEffect(() => {
    if (isPlaying && words.length > 0) {
      setCurrentWordIndex(0);
      const msPerWord = (60 / speed) * 1000; // Convert WPM to milliseconds per word
      
      intervalRef.current = setInterval(() => {
        setCurrentWordIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= words.length) {
            // Finished reading
            setCurrentWordIndex(-1);
            onWordHighlight?.(-1);
            return -1;
          }
          onWordHighlight?.(nextIndex);
          return nextIndex;
        });
      }, msPerWord);
    } else {
      // Stop highlighting when not playing
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentWordIndex(-1);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, words.length, speed, onWordHighlight]);

  return (
    <div className={cn("leading-relaxed", className)}>
      {words.map((word, index) => (
        <span
          key={index}
          className={cn(
            "inline-block mx-1 px-1 py-0.5 rounded transition-colors duration-200",
            currentWordIndex === index && highlightColor
          )}
        >
          {word}
        </span>
      ))}
    </div>
  );
}