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
    <div className={cn("leading-relaxed text-center flex flex-wrap items-center justify-center gap-1", className)} style={{ minHeight: '3rem' }}>
      {words.map((word, index) => (
        <span
          key={`${text}-${index}`}
          className="inline-block"
          style={{
            backgroundColor: currentWordIndex === index ? 'var(--highlight-yellow)' : 'transparent',
            color: currentWordIndex === index ? 'var(--highlight-text)' : 'inherit',
            borderRadius: currentWordIndex === index ? '2px' : '0',
            transition: 'background-color 0.1s ease',
            padding: currentWordIndex === index ? '1px 2px' : '0',
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}