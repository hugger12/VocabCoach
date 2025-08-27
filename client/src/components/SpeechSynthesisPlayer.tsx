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
  const [isCancelling, setIsCancelling] = useState(false);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordsRef = useRef<string[]>([]);

  useEffect(() => {
    // Split text into words for tracking
    wordsRef.current = text.split(/\s+/).filter(word => word.length > 0);
    
    // Reset error state when text changes (new sentence)
    setHasError(false);
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentWordIndex(-1);
    
    // Cleanup on unmount or text change
    return () => {
      if (utteranceRef.current) {
        speechSynthesis.cancel();
      }
    };
  }, [text]);

  const stopCurrentSpeech = useCallback((clearError = true) => {
    if (speechSynthesis.speaking || isPlaying) {
      setIsCancelling(true);
      
      // Clear the utterance reference before canceling to prevent error callback
      if (utteranceRef.current) {
        utteranceRef.current.onerror = null;
        utteranceRef.current.onend = null;
        utteranceRef.current = null;
      }
      
      speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      setIsLoading(false);
      if (clearError) {
        setHasError(false);
      }
      onWordHighlight?.(-1);
      onPause?.();
      
      // Reset cancelling flag after a short delay
      setTimeout(() => setIsCancelling(false), 100);
    }
  }, [isPlaying, onWordHighlight, onPause]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stopCurrentSpeech();
      return;
    }

    try {
      // Stop any existing speech first
      stopCurrentSpeech();
      
      setIsLoading(true);
      setHasError(false);
      setCurrentWordIndex(-1);

      // Process text to expand abbreviations
      const processedText = text
        .replace(/\(adj\)/gi, '(adjective)')
        .replace(/\(n\)/gi, '(noun)')
        .replace(/\(v\)/gi, '(verb)');

      // Create new utterance with processed text
      const utterance = new SpeechSynthesisUtterance(processedText);
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

          // Only update if word actually changed - prevent rapid fire updates
          if (wordIndex !== currentWordIndex && wordIndex < wordsRef.current.length) {
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
        utteranceRef.current = null;
        onEnded?.();
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        // Only set error state if this wasn't an intentional cancellation
        if (utteranceRef.current === utterance && !isCancelling) {
          setIsPlaying(false);
          setIsLoading(false);
          setHasError(true);
          setCurrentWordIndex(-1);
          onWordHighlight?.(-1);
          utteranceRef.current = null;
        }
      };

      // Start speech synthesis
      speechSynthesis.speak(utterance);

    } catch (error) {
      console.error('Error starting speech synthesis:', error);
      setIsLoading(false);
      setHasError(true);
    }
  }, [text, isPlaying, isCancelling, enableHighlighting, onWordHighlight, onPlay, onPause, onEnded, stopCurrentSpeech]);

  return (
    <button
      onClick={handlePlay}
      disabled={isLoading}
      className={className}
      data-testid="speech-synthesis-player"
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mx-auto" />
      ) : hasError ? (
        <div onClick={(e) => {
          e.stopPropagation();
          setHasError(false);
          handlePlay();
        }}>
          Retry
        </div>
      ) : (
        children
      )}
    </button>
  );
}