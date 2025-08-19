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
  highlightColor,
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
            "relative inline-block mx-1 px-3 py-1",
            currentWordIndex === index ? 
              "font-medium z-10" :
              ""
          )}
          style={{
            color: currentWordIndex === index ? 'var(--highlight-text)' : 'inherit',
          }}
        >
          {currentWordIndex === index && (
            <span 
              className="absolute inset-0 rounded -z-10"
              style={{
                backgroundColor: 'var(--highlight-yellow)',
              }}
            />
          )}
          {word}
        </span>
      ))}
    </div>
  );
}