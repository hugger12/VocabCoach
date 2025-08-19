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

  // Fetch study session
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: sessionStarted,
  });

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
      // Invalidate session to get updated progress
      queryClient.invalidateQueries({ queryKey: ["/api/study/session"] });
    },
  });

  const currentWord = session?.words[currentIndex];
  const totalWords = session?.totalWords || 0;
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

    // Auto-advance after 2 seconds if correct
    if (isCorrect) {
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
      setCurrentSentenceIndex(0); // Reset to first sentence for new word
      setCurrentHighlightedWord(-1); // Stop any sentence playback
    } else {
      // Session complete
      toast({
        title: "Session Complete!",
        description: `Great work! You've completed today's ${totalWords} words.`,
        variant: "default",
      });
      setSessionStarted(false);
      setCurrentIndex(0);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedChoice(null);
      setShowFeedback(false);
      setCurrentSentenceIndex(0); // Reset to first sentence for new word  
      setCurrentHighlightedWord(-1); // Stop any highlighting
    }
  };

  const handleStartSession = () => {
    setSessionStarted(true);
    setCurrentIndex(0);
    setSelectedChoice(null);
    setShowFeedback(false);
    setCurrentSentenceIndex(0);
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
        <header className="bg-card border-b border-border p-6 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-dyslexia-xl font-semibold text-foreground">
              Vocabulary Coach
            </h1>
            <DyslexiaButton
              variant="outline"
              onClick={onOpenParentDashboard}
              data-testid="parent-access"
            >
              <Settings className="w-5 h-5" />
              Parent
            </DyslexiaButton>
          </div>
        </header>

        {/* Start Session */}
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="card-dyslexia max-w-2xl w-full text-center">
            <CardContent>
              <h2 className="text-dyslexia-2xl font-bold mb-6">
                Ready to Practice?
              </h2>
              <p className="text-dyslexia-lg text-muted-foreground mb-8">
                Let's work on today's vocabulary words together. 
                You'll hear each word and use it in a sentence.
              </p>
              <DyslexiaButton
                size="lg"
                onClick={handleStartSession}
                data-testid="start-session"
              >
                Start Today's Practice
              </DyslexiaButton>
            </CardContent>
          </Card>
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

  if (error || !session || session.words.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="card-dyslexia max-w-md text-center">
          <CardContent>
            <h2 className="text-dyslexia-xl font-semibold mb-4">
              No Words to Practice
            </h2>
            <p className="text-dyslexia-base text-muted-foreground mb-6">
              {error ? "There was an error loading your words." : "You've completed all your words for today! Great job!"}
            </p>
            <DyslexiaButton
              onClick={() => setSessionStarted(false)}
              data-testid="back-to-start"
            >
              Back to Start
            </DyslexiaButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header with Progress */}
      <header className="bg-card border-b border-border p-6 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-dyslexia-xl font-semibold text-foreground">
              Vocabulary Coach
            </h1>
            <DyslexiaButton
              variant="outline"
              onClick={onOpenParentDashboard}
              data-testid="parent-access"
            >
              <Settings className="w-5 h-5" />
              Parent
            </DyslexiaButton>
          </div>
          
          {/* Progress Indicator */}
          <div className="flex items-center space-x-4">
            <span className="text-dyslexia-base text-muted-foreground">
              Word {currentIndex + 1} of {totalWords}
            </span>
            <div className="flex-1">
              <Progress value={progressPercentage} className="h-3" />
            </div>
            <span className="text-dyslexia-base font-medium text-primary">
              {Math.round(progressPercentage)}%
            </span>
          </div>
        </div>
      </header>

      {/* Main Study Area */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          
          {/* Modern Word Card */}
          <Card className="bg-white dark:bg-gray-900 shadow-xl rounded-3xl border-0 mb-8">
            <CardContent className="p-8">
              
              {/* Clean Word Header */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl px-8 py-6 mb-6">
                  <h2 className="text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {currentWord?.text}
                  </h2>
                  <AudioPlayer
                    text={currentWord?.text || ""}
                    type="word"
                    className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all border-0"
                    wordId={currentWord?.id}
                    data-testid="play-word"
                  >
                    ▶
                  </AudioPlayer>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-lg text-gray-600 dark:text-gray-400 mb-4">
                  <span className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                    {currentWord?.partOfSpeech}
                  </span>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-6 mb-8">
                  <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                    <strong>Definition:</strong> {currentWord?.kidDefinition}
                  </p>
                  <AudioPlayer
                    text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
                    type="sentence"
                    className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-800 dark:text-amber-200 rounded-xl px-6 py-3 text-sm font-medium transition-all border-0 inline-flex items-center gap-2"
                    wordId={currentWord?.id}
                    data-testid="play-definition"
                  >
                    ▶ Hear Definition
                  </AudioPlayer>
                </div>
              </div>

              {/* Modern Sentence Display */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 mb-8 relative">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Listen & Learn
                  </h3>
                  <div className="flex gap-3">
                    <SpeechSynthesisPlayer
                      text={getCurrentSentence()}
                      onWordHighlight={(wordIndex: number) => setCurrentHighlightedWord(wordIndex)}
                      enableHighlighting={true}
                      className="bg-green-500 hover:bg-green-600 text-white rounded-xl px-6 py-2 font-medium transition-all shadow-sm border-0 inline-flex items-center gap-2"
                      data-testid="play-sentence"
                    >
                      ▶ Play Sentence
                    </SpeechSynthesisPlayer>
                    {currentWord?.sentences && currentWord.sentences.length > 1 && (
                      <button
                        onClick={handleNextSentence}
                        className="bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm border border-gray-200 dark:border-gray-600 inline-flex items-center gap-1"
                        data-testid="next-sentence"
                      >
                        → Next Example ({currentSentenceIndex + 1}/{currentWord.sentences.length})
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 min-h-[100px] flex items-center justify-center">
                  {currentWord?.sentences && currentWord.sentences.length > 0 && (
                    <DyslexicReader
                      text={getCurrentSentence()}
                      currentWordIndex={currentHighlightedWord}
                      className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed text-center"
                      highlightColor="bg-yellow-200 dark:bg-yellow-600"
                    />
                  )}
                </div>
              </div>

              {/* Modern Choice Interface */}
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white text-center mb-8">
                  What does <span className="text-blue-600 dark:text-blue-400">{currentWord?.text}</span> mean?
                </h3>
                
                <div className="grid gap-4">
                  {meaningChoices.map((choice, index) => (
                    <button
                      key={`choice-${index}-${choice.text}`}
                      onClick={() => handleChoiceSelect(index)}
                      disabled={selectedChoice !== null}
                      data-testid={`choice-${index}`}
                      className={cn(
                        "w-full p-6 text-left rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
                        selectedChoice === index && choice.isCorrect && "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 shadow-lg ring-4 ring-green-200/50",
                        selectedChoice === index && !choice.isCorrect && "border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 shadow-lg ring-4 ring-orange-200/50",
                        selectedChoice !== index && "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md",
                        selectedChoice !== null && selectedChoice !== index && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                          {choice.text}
                        </span>
                        {selectedChoice === index && choice.isCorrect && (
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xl">✓</span>
                          </div>
                        )}
                        {selectedChoice === index && !choice.isCorrect && (
                          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xl">×</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Modern Integrated Feedback */}
                {showFeedback && selectedChoice !== null && (
                  <div className="mt-8 text-center transition-all duration-500">
                    {meaningChoices[selectedChoice]?.isCorrect ? (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-2xl p-8">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="text-white text-3xl">✓</span>
                        </div>
                        <div className="text-green-700 dark:text-green-300 text-2xl font-bold mb-2">
                          Excellent Work!
                        </div>
                        <p className="text-green-600 dark:text-green-400 text-lg mb-4">
                          You understood "{currentWord?.text}" perfectly from context.
                        </p>
                        <div className="text-green-500 dark:text-green-400 text-sm font-medium">
                          Moving to the next word in 2 seconds...
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border border-orange-200 dark:border-orange-700 rounded-2xl p-8">
                        <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="text-white text-2xl">↻</span>
                        </div>
                        <div className="text-orange-700 dark:text-orange-300 text-2xl font-bold mb-2">
                          Let's Try Again
                        </div>
                        <p className="text-orange-600 dark:text-orange-400 text-lg mb-4">
                          Listen to the sentence once more and think about the context.
                        </p>
                        <div className="text-orange-500 dark:text-orange-400 text-sm font-medium">
                          Try again in 3 seconds...
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Modern Navigation Controls */}
          <div className="flex justify-between items-center mt-8">
            <button
              onClick={handleBack}
              disabled={currentIndex === 0}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl font-medium transition-all",
                currentIndex === 0 
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                  : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 hover:scale-105 active:scale-95"
              )}
              data-testid="back-btn"
            >
              ← Previous
            </button>
            
            <button
              onClick={handleNext}
              disabled={selectedChoice === null || !meaningChoices[selectedChoice]?.isCorrect}
              className={cn(
                "flex items-center gap-2 px-8 py-3 rounded-2xl font-medium transition-all",
                (selectedChoice === null || !meaningChoices[selectedChoice]?.isCorrect)
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white hover:scale-105 active:scale-95 shadow-lg"
              )}
              data-testid="next-btn"
            >
              Next Word →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
