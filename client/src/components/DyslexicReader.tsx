import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface DyslexicReaderProps {
  text: string;
  currentWordIndex: number; // Controlled by synchronized audio player
  className?: string;
  highlightColor?: string;
}

export function DyslexicReader({
  text,
  currentWordIndex,
  className,
  highlightColor = "bg-primary/40 dark:bg-primary/50 border-2 border-primary/60",
}: DyslexicReaderProps) {
  const [words, setWords] = useState<string[]>([]);

  // Split text into words - keep original formatting
  useEffect(() => {
    const wordArray = text.split(/\s+/).filter(word => word.length > 0);
    setWords(wordArray);
  }, [text]);

  useEffect(() => {
    console.log('DyslexicReader - highlighting word:', currentWordIndex, words[currentWordIndex]);
  }, [currentWordIndex, words]);

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