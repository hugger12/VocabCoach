/**
 * Shared tokenization utility for audio-text synchronization
 * 
 * This utility ensures that text tokenization is identical between:
 * - AudioPlayer (for word boundary calculation and timing sync)  
 * - DyslexicReader (for text display and highlighting)
 * 
 * Consistent tokenization prevents sync bugs where highlighting doesn't match audio.
 */

export interface TokenizedText {
  /** Flat array of all words across all lines */
  allWords: string[];
  /** 2D array preserving line structure: lines[lineIndex][wordIndex] */
  linesWithWords: string[][];
  /** Total word count */
  wordCount: number;
}

/**
 * Tokenizes text into words while preserving line structure.
 * 
 * This is the canonical tokenization function that both AudioPlayer and DyslexicReader
 * must use to ensure perfect synchronization.
 * 
 * Algorithm:
 * 1. Split text by line breaks (/\r?\n/) to preserve formatting
 * 2. For each line, split by whitespace (/\s+/) and filter empty strings
 * 3. Build both flat word array and structured line array
 * 
 * @param text The input text to tokenize
 * @returns TokenizedText object with both flat and structured word arrays
 */
export function tokenizeText(text: string): TokenizedText {
  // Split by line breaks to preserve formatting exactly as entered
  const textLines = text.split(/\r?\n/);
  
  // Build both flat and structured arrays
  const linesWithWords: string[][] = [];
  const allWords: string[] = [];
  
  textLines.forEach(line => {
    // Split each line by whitespace and filter empty strings
    const lineWords = line.split(/\s+/).filter(word => word.length > 0);
    linesWithWords.push(lineWords);
    allWords.push(...lineWords);
  });
  
  return {
    allWords,
    linesWithWords,
    wordCount: allWords.length,
  };
}

/**
 * Gets the flat word array from tokenized text.
 * Used primarily by AudioPlayer for boundary calculations.
 * 
 * @param text The input text
 * @returns Flat array of all words
 */
export function getWordsArray(text: string): string[] {
  return tokenizeText(text).allWords;
}

/**
 * Gets the structured line-word array from tokenized text.
 * Used primarily by DyslexicReader for display formatting.
 * 
 * @param text The input text  
 * @returns 2D array where lines[lineIndex][wordIndex] gives the word
 */
export function getLinesWithWords(text: string): string[][] {
  return tokenizeText(text).linesWithWords;
}

/**
 * Validates that two tokenization results are identical.
 * Used in tests to ensure AudioPlayer and DyslexicReader stay in sync.
 * 
 * @param text1 First text to tokenize
 * @param text2 Second text to tokenize  
 * @returns true if tokenization results are identical
 */
export function validateTokenizationSync(text1: string, text2: string): boolean {
  const result1 = tokenizeText(text1);
  const result2 = tokenizeText(text2);
  
  if (result1.wordCount !== result2.wordCount) return false;
  
  // Compare flat word arrays
  for (let i = 0; i < result1.allWords.length; i++) {
    if (result1.allWords[i] !== result2.allWords[i]) return false;
  }
  
  // Compare line structure
  if (result1.linesWithWords.length !== result2.linesWithWords.length) return false;
  
  for (let lineIndex = 0; lineIndex < result1.linesWithWords.length; lineIndex++) {
    const line1 = result1.linesWithWords[lineIndex];
    const line2 = result2.linesWithWords[lineIndex];
    
    if (line1.length !== line2.length) return false;
    
    for (let wordIndex = 0; wordIndex < line1.length; wordIndex++) {
      if (line1[wordIndex] !== line2[wordIndex]) return false;
    }
  }
  
  return true;
}