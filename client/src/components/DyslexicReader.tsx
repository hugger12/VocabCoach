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
    <div className={cn("leading-relaxed text-center", className)} style={{ minHeight: '3rem' }}>
      {words.map((word, index) => (
        <span
          key={`${text}-${index}`}
          className="inline-block mr-1"
          style={{
            backgroundColor: currentWordIndex === index ? 'var(--highlight-yellow)' : 'transparent',
            color: currentWordIndex === index ? 'var(--highlight-text)' : 'inherit',
            padding: '2px 4px', // Fixed padding so layout doesn't shift
            borderRadius: '3px',
            transition: 'background-color 0.1s ease',
            transform: 'none',
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}