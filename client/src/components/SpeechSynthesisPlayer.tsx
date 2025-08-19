import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { DyslexiaButton } from '@/components/ui/dyslexia-button';

interface SpeechSynthesisPlayerProps {
  text: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'secondary' | 'outline';
  onWordHighlight?: (wordIndex: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  enableHighlighting?: boolean;
}

export function SpeechSynthesisPlayer({
  text,
  children,
  className = '',
  variant = 'default',
  onWordHighlight,
  onPlay,
  onPause,
  onEnded,
  enableHighlighting = true,
}: SpeechSynthesisPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordsRef = useRef<string[]>([]);

  useEffect(() => {
    // Split text into words for tracking
    wordsRef.current = text.split(/\s+/).filter(word => word.length > 0);
    
    // Cleanup on unmount or text change
    return () => {
      if (utteranceRef.current) {
        speechSynthesis.cancel();
      }
    };
  }, [text]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      // Pause/stop current speech
      speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      onWordHighlight?.(-1);
      onPause?.();
      return;
    }

    try {
      setIsLoading(true);
      setHasError(false);
      setCurrentWordIndex(-1);

      // Create new utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Configure voice settings for child-friendly speech
      utterance.rate = 0.8; // Slower for better comprehension
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Find a good voice (prefer female voices for children)
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Female') || voice.name.includes('female') || voice.name.includes('Samantha'))
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      let currentWordIdx = 0;

      utterance.onstart = () => {
        console.log('Speech synthesis started');
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word' && enableHighlighting) {
          // Find the word at the current character position
          let charCount = 0;
          let wordIndex = 0;
          
          for (let i = 0; i < wordsRef.current.length; i++) {
            if (charCount + wordsRef.current[i].length >= event.charIndex) {
              wordIndex = i;
              break;
            }
            charCount += wordsRef.current[i].length + 1; // +1 for space
          }

          if (wordIndex !== currentWordIndex) {
            setCurrentWordIndex(wordIndex);
            onWordHighlight?.(wordIndex);
            console.log('Highlighting word:', wordIndex, wordsRef.current[wordIndex], 'at char:', event.charIndex);
          }
        }
      };

      utterance.onend = () => {
        console.log('Speech synthesis ended');
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        onWordHighlight?.(-1);
        onEnded?.();
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsPlaying(false);
        setIsLoading(false);
        setHasError(true);
        setCurrentWordIndex(-1);
        onWordHighlight?.(-1);
      };

      // Start speech synthesis
      speechSynthesis.speak(utterance);

    } catch (error) {
      console.error('Error starting speech synthesis:', error);
      setIsLoading(false);
      setHasError(true);
    }
  }, [text, isPlaying, enableHighlighting, onWordHighlight, onPlay, onPause, onEnded]);

  return (
    <DyslexiaButton
      onClick={handlePlay}
      disabled={isLoading || hasError}
      variant={variant}
      className={`${className} relative`}
      data-testid="speech-synthesis-player"
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
      ) : isPlaying ? (
        <Pause className="h-4 w-4 mr-2" />
      ) : (
        <Play className="h-4 w-4 mr-2" />
      )}
      {hasError ? 'Error' : children}
      <Volume2 className="h-4 w-4 ml-2" />
    </DyslexiaButton>
  );
}