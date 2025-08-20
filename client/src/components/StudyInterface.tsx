import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RotateCcw, Settings, Volume2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";
import { AudioPlayer } from "./AudioPlayer";
import { SpeechSynthesisPlayer } from "./SpeechSynthesisPlayer";
import { DyslexicReader } from "./DyslexicReader";
import { Progress } from "@/components/ui/progress";
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

export function StudyInterface({ onOpenParentDashboard }: StudyInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentHighlightedWord, setCurrentHighlightedWord] = useState(-1);
  const [showDefinition, setShowDefinition] = useState(true);
  const [showChoices, setShowChoices] = useState(false);
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

    // Show integrated feedback (no more disruptive modals)
    setShowFeedback(true);

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
        setShowFeedback(false);
      }, 3000);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalWords - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedChoice(null);
      setShowFeedback(false);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
      setShowDefinition(true);
      setShowChoices(false);
    } else {
      // Session complete - show final score and invalidate cache for next session
      setSessionComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/study/session"] });
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedChoice(null);
      setShowFeedback(false);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
      setShowDefinition(true);
      setShowChoices(false);
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
    setShowFeedback(false);
    setCurrentSentenceIndex(0);
    setShowDefinition(true);
    setShowChoices(false);
  };

  const handleStartChallenge = () => {
    setShowDefinition(false);
    setShowChoices(true);
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
        {/* Header */}
        <header className="p-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-foreground">
              Vocabulary Coach
            </h1>
            <button
              onClick={onOpenParentDashboard}
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-2xl px-6 py-3 text-lg font-medium transition-all"
              data-testid="parent-access"
            >
              ⚙ Parent
            </button>
          </div>
        </header>

        {/* Start Session */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full text-center">
            <h2 className="text-4xl font-bold mb-6 text-foreground">
              Ready to Practice?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Let's work on today's vocabulary words together. 
              You'll hear each word and use it in a sentence.
            </p>
            <button
              onClick={handleStartSession}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
              data-testid="start-session"
            >
              Start Today's Practice
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RotateCcw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-dyslexia-lg">Loading your words...</p>
        </div>
      </div>
    );
  }

  // Show completion screen with score
  if (sessionComplete) {
    const percentage = Math.round((correctAnswers / totalWords) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center">
          <h2 className="text-4xl font-bold mb-6 text-foreground">
            Session Complete!
          </h2>
          <div className="mb-8">
            <div className="text-6xl font-bold text-primary mb-4">
              {correctAnswers}/{totalWords}
            </div>
            <p className="text-xl text-muted-foreground">
              {percentage >= 80 ? "Excellent work!" : 
               percentage >= 60 ? "Good job!" : 
               "Keep practicing!"}
            </p>
          </div>
          <button
            onClick={() => {
              setSessionStarted(false);
              setSessionComplete(false);
              setCurrentIndex(0);
              setCorrectAnswers(0);
              setSessionWords([]);
              setTotalSessionWords(0);
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            Back to Start
          </button>
        </div>
      </div>
    );
  }

  if (error || (sessionStarted && sessionWords.length === 0 && !isLoading && totalSessionWords === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            No Words to Practice
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            {error ? "There was an error loading your words." : "You need to add some vocabulary words first."}
          </p>
          <button
            onClick={() => setSessionStarted(false)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            Back to Start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Progress Section */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1" />
            <button
              onClick={onOpenParentDashboard}
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-2xl px-6 py-3 text-lg font-medium transition-all"
              data-testid="parent-access"
            >
              ⚙ Parent
            </button>
          </div>
          
          {/* Progress Indicator */}
          <div className="flex items-center space-x-4">
            <span className="text-lg text-muted-foreground">
              Word {currentIndex + 1} of {totalWords}
            </span>
            <div className="flex-1">
              <div className="bg-muted rounded-full h-3">
                <div 
                  className="bg-primary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
            <span className="text-lg font-medium text-primary">
              {Math.round(progressPercentage)}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Study Area */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          
          {/* Clean Word Display */}
          <div className="mb-12">
            {/* Word and Audio */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-6 mb-6">
                <h2 className="text-6xl font-bold text-foreground tracking-tight">
                  {currentWord?.text}
                </h2>
                <AudioPlayer
                  text={currentWord?.text || ""}
                  type="word"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all text-2xl font-bold"
                  wordId={currentWord?.id}
                  data-testid="play-word"
                >
                  ▶
                </AudioPlayer>
              </div>
              
              <div className="text-muted-foreground mb-8">
                <span className="text-lg font-medium">{currentWord?.partOfSpeech}</span>
              </div>
            </div>

            {/* Definition */}
            {showDefinition && (
              <div className="text-center mb-12">
                <p className="text-xl text-foreground mb-6">
                  <strong>Definition:</strong> {currentWord?.kidDefinition}
                </p>
                <AudioPlayer
                  text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
                  type="sentence"
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
                  wordId={currentWord?.id}
                  data-testid="play-definition"
                >
                  Hear Definition
                </AudioPlayer>
              </div>
            )}
          </div>

          {/* Sentence Practice */}
          <div className="mb-12">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-semibold text-foreground mb-6">
                Listen & Learn
              </h3>
              <div className="flex justify-center gap-4 mb-8">
                <SpeechSynthesisPlayer
                  text={getCurrentSentence()}
                  onWordHighlight={(wordIndex: number) => setCurrentHighlightedWord(wordIndex)}
                  enableHighlighting={true}
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
                  data-testid="play-sentence"
                >
                  Play Sentence
                </SpeechSynthesisPlayer>
                {currentWord?.sentences && currentWord.sentences.length > 1 && (
                  <button
                    onClick={handleNextSentence}
                    className="bg-muted hover:bg-muted/80 text-muted-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
                    data-testid="next-sentence"
                  >
                    Next Example ({currentSentenceIndex + 1}/{currentWord.sentences.length})
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-muted rounded-2xl p-8 min-h-[120px] flex items-center justify-center">
              {currentWord?.sentences && currentWord.sentences.length > 0 && (
                <DyslexicReader
                  text={getCurrentSentence()}
                  currentWordIndex={currentHighlightedWord}
                  className="text-xl text-foreground leading-relaxed text-center"
                  highlightColor="bg-yellow-200 dark:bg-yellow-600"
                />
              )}
            </div>
          </div>

          {/* Challenge Interface */}
          <div className="mb-12">
            {!showChoices ? (
              <div className="text-center">
                <button
                  onClick={handleStartChallenge}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-6 text-2xl font-medium transition-all hover:scale-105 active:scale-95"
                  data-testid="start-challenge"
                >
                  What does <span className="font-bold">{currentWord?.text}</span> mean?
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-semibold text-foreground text-center mb-8">
                  Choose the meaning of <span className="text-primary">{currentWord?.text}</span>
                </h3>
                
                <div className="space-y-4">
                  {meaningChoices.map((choice, index) => (
                    <button
                      key={`choice-${index}-${choice.text}`}
                      onClick={() => handleChoiceSelect(index)}
                      disabled={selectedChoice !== null}
                      data-testid={`choice-${index}`}
                      className={cn(
                        "w-full p-6 text-left rounded-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]",
                        selectedChoice === index && choice.isCorrect && "bg-green-500 text-white shadow-lg",
                        selectedChoice === index && !choice.isCorrect && "bg-orange-500 text-white shadow-lg",
                        selectedChoice !== index && "bg-card hover:bg-muted",
                        selectedChoice !== null && selectedChoice !== index && "opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-medium">
                          {choice.text}
                        </span>
                        {selectedChoice === index && choice.isCorrect && (
                          <span className="text-2xl">✓</span>
                        )}
                        {selectedChoice === index && !choice.isCorrect && (
                          <span className="text-2xl">×</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Clean Feedback */}
            {showFeedback && selectedChoice !== null && (
              <div className="mt-8 text-center transition-all duration-500">
                {meaningChoices[selectedChoice]?.isCorrect ? (
                  <div className="text-green-600 dark:text-green-400">
                    <div className="text-4xl mb-4">✓</div>
                    <div className="text-2xl font-bold mb-2">Excellent Work!</div>
                    <p className="text-lg mb-4">
                      You understood "{currentWord?.text}" perfectly from context.
                    </p>
                    <div className="text-base font-medium">
                      Moving to the next word in 2 seconds...
                    </div>
                  </div>
                ) : (
                  <div className="text-orange-500 dark:text-orange-400">
                    <div className="text-4xl mb-4">↻</div>
                    <div className="text-2xl font-bold mb-2">Let's Try Again</div>
                    <p className="text-lg mb-4">
                      Listen to the sentence once more and think about the context.
                    </p>
                    <div className="text-base font-medium">
                      Try again in 3 seconds...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={handleBack}
              disabled={currentIndex === 0}
              className={cn(
                "px-8 py-4 rounded-2xl text-lg font-medium transition-all",
                currentIndex === 0 
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-secondary hover:bg-secondary/90 text-secondary-foreground hover:scale-105 active:scale-95"
              )}
              data-testid="back-btn"
            >
              Previous
            </button>
            
            <button
              onClick={handleNext}
              disabled={!showChoices || selectedChoice === null || (selectedChoice !== null && !meaningChoices[selectedChoice]?.isCorrect)}
              className={cn(
                "px-8 py-4 rounded-2xl text-lg font-medium transition-all",
                (!showChoices || selectedChoice === null || (selectedChoice !== null && !meaningChoices[selectedChoice]?.isCorrect))
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-105 active:scale-95"
              )}
              data-testid="next-btn"
            >
              Next Word
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
