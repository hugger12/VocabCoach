import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DyslexicReaderProps {
  text: string;
  isPlaying: boolean;
  onWordHighlight?: (wordIndex: number) => void;
  className?: string;
  highlightColor?: string;
  audioDuration?: number; // Duration of the audio in seconds
}

export function DyslexicReader({
  text,
  isPlaying,
  onWordHighlight,
  className,
  highlightColor = "bg-yellow-300/50 dark:bg-yellow-500/30",
  audioDuration,
}: DyslexicReaderProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Split text into words and clean punctuation for better highlighting
  useEffect(() => {
    const wordArray = text.split(/\s+/).filter(word => word.length > 0);
    setWords(wordArray);
    setCurrentWordIndex(-1);
  }, [text]);

  // Handle word highlighting during playback
  useEffect(() => {
    console.log('DyslexicReader effect:', { isPlaying, wordsLength: words.length, text });
    
    if (isPlaying && words.length > 0) {
      console.log('Starting word highlighting animation');
      startTimeRef.current = Date.now();
      setCurrentWordIndex(0);
      
      // Calculate timing - more conservative estimate
      const estimatedDuration = audioDuration || Math.max(words.length * 0.8, 3); // At least 3 seconds
      const msPerWord = (estimatedDuration * 1000) / words.length;
      
      console.log(`Timing: ${estimatedDuration}s total, ${msPerWord}ms per word`);
      
      let currentIndex = 0;
      
      intervalRef.current = setInterval(() => {
        currentIndex++;
        console.log('Highlighting word:', currentIndex, words[currentIndex]);
        
        if (currentIndex >= words.length) {
          // Finished reading
          console.log('Finished highlighting all words');
          setCurrentWordIndex(-1);
          onWordHighlight?.(-1);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else {
          setCurrentWordIndex(currentIndex);
          onWordHighlight?.(currentIndex);
        }
      }, msPerWord);
      
    } else {
      // Stop highlighting when not playing
      console.log('Stopping word highlighting');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentWordIndex(-1);
      startTimeRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, words.length, text, audioDuration, onWordHighlight]);

  return (
    <div className={cn("leading-relaxed text-center", className)}>
      {words.map((word, index) => (
        <span
          key={`${text}-${index}`} // Better key for re-renders
          className={cn(
            "inline-block mx-1 px-2 py-1 rounded-md transition-all duration-300 ease-in-out",
            currentWordIndex === index ? [
              highlightColor,
              "transform scale-105 font-semibold shadow-sm"
            ] : "hover:bg-muted/50"
          )}
          style={{
            animationDelay: currentWordIndex === index ? '0ms' : `${index * 50}ms`
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}