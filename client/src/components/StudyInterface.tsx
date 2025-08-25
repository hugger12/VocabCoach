import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Volume2, RotateCcw } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { SpeechSynthesisPlayer } from "./SpeechSynthesisPlayer";
import { DyslexicReader } from "./DyslexicReader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { WordWithProgress, StudySession } from "@shared/schema";

interface StudyInterfaceProps {
  onOpenParentDashboard: () => void;
}

interface MeaningChoice {
  text: string;
  isCorrect: boolean;
}

type StudyStep = 'word' | 'definition' | 'sentence' | 'quiz' | 'feedback';

export function StudyInterface({ onOpenParentDashboard }: StudyInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState<StudyStep>('word');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentHighlightedWord, setCurrentHighlightedWord] = useState(-1);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [sessionWords, setSessionWords] = useState<WordWithProgress[]>([]);
  const [totalSessionWords, setTotalSessionWords] = useState(0);

  // Fetch study session
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: sessionStarted && !sessionComplete,
  });

  // Store session words when first loaded
  useEffect(() => {
    if (session?.words && sessionWords.length === 0) {
      setSessionWords([...session.words]);
      setTotalSessionWords(session.totalWords);
    }
  }, [session?.words, sessionWords.length, session?.totalWords]);

  // Record attempt mutation
  const recordAttempt = useMutation({
    mutationFn: async (attempt: { wordId: string; mode: string; success: boolean; errorType?: string }) => {
      const response = await fetch("/api/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
      if (!response.ok) throw new Error("Failed to record attempt");
      return response.json();
    },
    onSuccess: () => {
      // Don't invalidate session during active study - it breaks the flow
      // Only invalidate when session is complete
    },
  });

  const currentWord = sessionWords[currentIndex];
  const totalWords = totalSessionWords || sessionWords.length || 0;
  const progressPercentage = totalWords > 0 ? ((currentIndex + 1) / totalWords) * 100 : 0;

  // Generate meaning choices with stable shuffling (FIXED)
  const meaningChoices = useMemo(() => {
    if (!currentWord) return [];

    const choices = [
      { text: currentWord.kidDefinition, isCorrect: true },
      { text: "To forget about an important event", isCorrect: false },
      { text: "To prepare food for a gathering", isCorrect: false },
      { text: "To clean and organize a space", isCorrect: false },
    ].slice(0, 3);

    // Stable shuffle using word ID as seed
    const seed = currentWord.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seededRandom = (index: number) => {
      const x = Math.sin(seed + index) * 10000;
      return x - Math.floor(x);
    };

    const shuffled = [...choices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(i) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }, [currentWord?.id, currentWord?.kidDefinition]);

  const handleChoiceSelect = async (choiceIndex: number) => {
    if (!currentWord || selectedChoice !== null) return;

    setSelectedChoice(choiceIndex);
    const choice = meaningChoices[choiceIndex];
    const isCorrect = choice.isCorrect;

    // Record the attempt
    try {
      await recordAttempt.mutateAsync({
        wordId: currentWord.id,
        mode: "meaning",
        success: isCorrect,
        errorType: isCorrect ? undefined : "meaning",
      });
    } catch (error) {
      console.error("Failed to record attempt:", error);
    }

    // Show feedback step
    setCurrentStep('feedback');

    // Track correct answers
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      
      // Auto-advance after 2 seconds if correct
      setTimeout(() => {
        handleNext();
      }, 2000);
    } else {
      // Reset after 3 seconds to try again
      setTimeout(() => {
        setSelectedChoice(null);
        setCurrentStep('quiz');
      }, 3000);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalWords - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedChoice(null);
      setCurrentStep('word');
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    } else {
      // Session complete - show final score and invalidate cache for next session
      setSessionComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/study/session"] });
    }
  };

  const handleStepNavigation = (step: StudyStep) => {
    setCurrentStep(step);
    if (step === 'word') {
      setSelectedChoice(null);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    }
  };

  const handleStartSession = () => {
    setSessionStarted(true);
    setSessionComplete(false);
    setCurrentIndex(0);
    setCorrectAnswers(0);
    setSessionWords([]);
    setTotalSessionWords(0);
    setSelectedChoice(null);
    setCurrentStep('word');
    setCurrentSentenceIndex(0);
  };

  const handleCloseSession = () => {
    setSessionStarted(false);
    setSessionComplete(false);
    setCurrentIndex(0);
    setCorrectAnswers(0);
    setSessionWords([]);
    setTotalSessionWords(0);
  };

  // Cycle through sentences for current word
  const handleNextSentence = () => {
    if (currentWord?.sentences && currentWord.sentences.length > 1) {
      setCurrentSentenceIndex((prev) => 
        (prev + 1) % (currentWord.sentences?.length || 1)
      );
      // Stop any current highlighting when switching sentences
      setCurrentHighlightedWord(-1);
    }
  };

  // Get current sentence text
  const getCurrentSentence = () => {
    if (!currentWord?.sentences || currentWord.sentences.length === 0) {
      return `Here is an example: The ${currentWord?.partOfSpeech} "${currentWord?.text}" means ${currentWord?.kidDefinition}.`;
    }
    return currentWord.sentences[currentSentenceIndex]?.text || "";
  };

  // Auto-play word and sentence when word changes
  useEffect(() => {
    if (currentWord && sessionStarted) {
      // Small delay to ensure components are ready
      setTimeout(() => {
        // Auto-play word first, then sentence
        const playSequence = async () => {
          // This would trigger the audio player automatically
          // For now, we'll just focus on the first audio button
          const wordButton = document.querySelector('[data-testid="play-word"]') as HTMLButtonElement;
          if (wordButton) {
            wordButton.focus();
          }
        };
        playSequence();
      }, 100);
    }
  }, [currentWord, sessionStarted]);

  if (!sessionStarted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Main Study Interface - Simple Start */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <button
              onClick={handleStartSession}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-6 text-xl font-medium transition-all w-full"
              data-testid="start-session"
            >
              Start
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <RotateCcw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg">Loading your words...</p>
        </div>
      </div>
    );
  }

  // Show completion screen with score
  if (sessionComplete) {
    const percentage = Math.round((correctAnswers / totalWords) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center p-8">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Well Done!
          </h2>
          <div className="mb-8">
            <div className="text-5xl font-bold text-primary mb-4">
              {correctAnswers}/{totalWords}
            </div>
            <p className="text-lg text-muted-foreground">
              {percentage >= 80 ? "Excellent work!" : 
               percentage >= 60 ? "Good job!" : 
               "Keep practicing!"}
            </p>
          </div>
          <button
            onClick={handleCloseSession}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (error || (sessionStarted && sessionWords.length === 0 && !isLoading && totalSessionWords === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center p-8">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            No Words Available
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            {error ? "Error loading words." : "Add vocabulary words first."}
          </p>
          <button
            onClick={handleCloseSession}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  // Modal overlay background
  const ModalOverlay = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="relative bg-card rounded-3xl shadow-xl max-w-lg w-full p-8 text-center">
        {/* Close button */}
        <button
          onClick={handleCloseSession}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground"
          data-testid="close-session"
        >
          <X className="w-6 h-6" />
        </button>
        
        {/* Progress indicator */}
        <div className="text-sm text-muted-foreground mb-6">
          {currentIndex + 1} of {totalWords}
        </div>
        
        {children}
      </div>
    </div>
  );

  // Step 1: Word Introduction
  if (currentStep === 'word') {
    return (
      <ModalOverlay>
        <h1 className="text-5xl font-bold text-foreground mb-8">
          {currentWord?.text}
        </h1>
        <AudioPlayer
          text={currentWord?.text || ""}
          type="word"
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-20 h-20 flex items-center justify-center shadow-lg transition-all text-3xl font-bold mx-auto mb-8"
          wordId={currentWord?.id}
          data-testid="play-word"
        >
          ▶
        </AudioPlayer>
        <button
          onClick={() => handleStepNavigation('definition')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
          data-testid="next-to-definition"
        >
          Continue
        </button>
      </ModalOverlay>
    );
  }

  // Step 2: Definition
  if (currentStep === 'definition') {
    return (
      <ModalOverlay>
        <h2 className="text-4xl font-bold text-foreground mb-6">
          {currentWord?.text}
        </h2>
        <p className="text-lg text-muted-foreground mb-6">
          {currentWord?.kidDefinition}
        </p>
        <AudioPlayer
          text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
          type="sentence"
          className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all text-2xl font-bold mx-auto mb-8"
          wordId={currentWord?.id}
          data-testid="play-definition"
        >
          ▶
        </AudioPlayer>
        <button
          onClick={() => handleStepNavigation('sentence')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
          data-testid="next-to-sentence"
        >
          Continue
        </button>
      </ModalOverlay>
    );
  }

  // Step 3: Sentence Practice
  if (currentStep === 'sentence') {
    return (
      <ModalOverlay>
        <h3 className="text-3xl font-bold text-foreground mb-6">
          {currentWord?.text}
        </h3>
        <p className="text-base text-muted-foreground mb-6">
          Listen to how the word is used:
        </p>
        <div className="bg-muted rounded-2xl p-6 mb-8">
          <DyslexicReader
            text={getCurrentSentence()}
            currentWordIndex={currentHighlightedWord}
            className="text-lg text-foreground leading-relaxed"
            highlightColor="bg-yellow-200"
          />
        </div>
        <div className="flex flex-col gap-4">
          <SpeechSynthesisPlayer
            text={getCurrentSentence()}
            onWordHighlight={(wordIndex: number) => setCurrentHighlightedWord(wordIndex)}
            enableHighlighting={true}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all text-2xl font-bold mx-auto"
            data-testid="play-sentence"
          >
            ▶
          </SpeechSynthesisPlayer>
          {currentWord?.sentences && currentWord.sentences.length > 1 && (
            <button
              onClick={handleNextSentence}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="next-sentence"
            >
              Another Example ({currentSentenceIndex + 1}/{currentWord.sentences.length})
            </button>
          )}
          <button
            onClick={() => handleStepNavigation('quiz')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all mt-4"
            data-testid="next-to-quiz"
          >
            Continue
          </button>
        </div>
      </ModalOverlay>
    );
  }

  // Step 4: Quiz
  if (currentStep === 'quiz') {
    return (
      <ModalOverlay>
        <h3 className="text-3xl font-bold text-foreground mb-8">
          {currentWord?.text}
        </h3>
        <p className="text-lg text-muted-foreground mb-8">
          What does it mean?
        </p>
        <div className="space-y-3">
          {meaningChoices.map((choice, index) => (
            <button
              key={`choice-${index}-${choice.text}`}
              onClick={() => handleChoiceSelect(index)}
              disabled={selectedChoice !== null}
              data-testid={`choice-${index}`}
              className="w-full p-4 text-left rounded-2xl transition-all bg-card hover:bg-muted text-foreground border-2 border-border hover:border-primary/50"
            >
              <span className="text-base">
                {choice.text}
              </span>
            </button>
          ))}
        </div>
      </ModalOverlay>
    );
  }

  // Step 5: Feedback
  if (currentStep === 'feedback') {
    const isCorrect = selectedChoice !== null && meaningChoices[selectedChoice]?.isCorrect;
    return (
      <ModalOverlay>
        <div className={cn("text-center", isCorrect ? "text-green-600" : "text-orange-500")}>
          <div className="text-6xl mb-6">
            {isCorrect ? "✓" : "✗"}
          </div>
          <h3 className="text-2xl font-bold mb-4">
            {isCorrect ? "Correct!" : "Try Again"}
          </h3>
          <p className="text-lg mb-6">
            {isCorrect ? 
              `Great! You know what "${currentWord?.text}" means.` :
              `Let's practice "${currentWord?.text}" some more.`
            }
          </p>
          {!isCorrect && (
            <p className="text-base text-muted-foreground">
              The correct answer was: <strong>{meaningChoices.find(c => c.isCorrect)?.text}</strong>
            </p>
          )}
        </div>
      </ModalOverlay>
    );
  }

  return null;
}
