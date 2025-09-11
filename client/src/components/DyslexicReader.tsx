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
  const [lines, setLines] = useState<string[][]>([]);

  // Split text into lines first, then words - preserve line breaks exactly as entered
  useEffect(() => {
    // Split by line breaks to preserve formatting
    const textLines = text.split(/\r?\n/);
    
    // For each line, split into words
    const linesWithWords: string[][] = [];
    const allWords: string[] = [];
    
    textLines.forEach(line => {
      const lineWords = line.split(/\s+/).filter(word => word.length > 0);
      linesWithWords.push(lineWords);
      allWords.push(...lineWords);
    });
    
    setLines(linesWithWords);
    setWords(allWords);
  }, [text]);

  useEffect(() => {
    console.log('DyslexicReader - highlighting word:', currentWordIndex, words[currentWordIndex]);
  }, [currentWordIndex, words]);

  // Calculate which word index we're on across all lines
  let wordIndex = 0;

  return (
    <div className={cn("leading-relaxed text-center", className)} style={{ minHeight: '3rem' }}>
      {lines.map((lineWords, lineIndex) => (
        <div key={lineIndex} className="flex flex-wrap items-center justify-center gap-1 mb-2 last:mb-0">
          {lineWords.map((word, wordInLineIndex) => {
            const currentWordGlobalIndex = wordIndex++;
            return (
              <span
                key={`${text}-${lineIndex}-${wordInLineIndex}`}
                className="inline-block"
                style={{
                  backgroundColor: currentWordIndex === currentWordGlobalIndex ? 'var(--highlight-yellow)' : 'transparent',
                  color: currentWordIndex === currentWordGlobalIndex ? 'var(--highlight-text)' : 'inherit',
                  borderRadius: currentWordIndex === currentWordGlobalIndex ? '2px' : '0',
                  transition: 'background-color 0.1s ease',
                  padding: '0', // IMPORTANT: Never add padding here - it causes text jiggling during highlighting
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}