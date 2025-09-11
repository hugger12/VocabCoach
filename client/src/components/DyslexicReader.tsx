import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { tokenizeText } from "@/utils/tokenization";

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

  // Use shared tokenization utility to ensure perfect sync with AudioPlayer
  useEffect(() => {
    const tokenized = tokenizeText(text);
    setLines(tokenized.linesWithWords);
    setWords(tokenized.allWords);
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