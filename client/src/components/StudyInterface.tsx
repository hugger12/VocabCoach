import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RotateCcw, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";
import { AudioPlayer } from "./AudioPlayer";
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

  // Generate meaning choices for current word
  const generateMeaningChoices = (word: WordWithProgress): MeaningChoice[] => {
    if (!word) return [];

    const choices: MeaningChoice[] = [
      { text: word.kidDefinition, isCorrect: true },
    ];

    // Add distractors (in a real app, these would come from the API)
    const distractors = [
      "To forget about an important event",
      "To prepare food for a gathering",
      "To clean and organize a space",
    ];

    distractors.slice(0, 2).forEach(distractor => {
      choices.push({ text: distractor, isCorrect: false });
    });

    // Shuffle choices
    return choices.sort(() => Math.random() - 0.5);
  };

  const meaningChoices = currentWord ? generateMeaningChoices(currentWord) : [];

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

    // Show feedback
    setShowFeedback(true);

    if (isCorrect) {
      toast({
        title: "Correct!",
        description: `Great job! You understood "${currentWord.text}" from context.`,
        variant: "default",
      });
    } else {
      toast({
        title: "Try again",
        description: "Listen to the sentence once more and think about the context.",
        variant: "destructive",
      });
    }

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
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedChoice(null);
      setShowFeedback(false);
      setCurrentSentenceIndex(0); // Reset to first sentence for new word
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
        <div className="max-w-2xl w-full">
          
          {/* Current Word Card */}
          <Card className="card-dyslexia mb-8">
            <CardContent>
              
              {/* Word Display */}
              <div className="text-center mb-8">
                <h2 className="text-dyslexia-2xl font-bold text-foreground mb-4 tracking-wide">
                  {currentWord?.text}
                </h2>
                <p className="text-dyslexia-base text-muted-foreground italic">
                  {currentWord?.partOfSpeech}
                </p>
              </div>

              {/* Audio Controls */}
              <div className="flex flex-col space-y-4 mb-8">
                <AudioPlayer
                  text={currentWord?.text || ""}
                  type="word"
                  variant="primary"
                  className="w-full h-16"
                  wordId={currentWord?.id}
                  data-testid="play-word"
                >
                  Play Word
                </AudioPlayer>
                
                <div className="relative">
                  <AudioPlayer
                    text={getCurrentSentence()}
                    type="sentence"
                    variant="secondary"
                    className="w-full h-16"
                    wordId={currentWord?.id}
                    data-testid="play-sentence"
                  >
                    Play Sentence {currentWord?.sentences && currentWord.sentences.length > 1 ? `(${currentSentenceIndex + 1}/${currentWord.sentences.length})` : ''}
                  </AudioPlayer>
                  {currentWord?.sentences && currentWord.sentences.length > 1 && (
                    <DyslexiaButton
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-12 px-2 text-xs"
                      onClick={handleNextSentence}
                      data-testid="cycle-sentence"
                    >
                      Next
                    </DyslexiaButton>
                  )}
                </div>

                <AudioPlayer
                  text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
                  type="sentence"
                  variant="outline"
                  className="w-full h-16"
                  wordId={currentWord?.id}
                  data-testid="play-definition"
                >
                  Play Definition
                </AudioPlayer>
              </div>

              {/* Current Sentence Display */}
              <div className="bg-muted rounded-xl p-6 mb-6">
                <p className="text-dyslexia-lg text-foreground text-center leading-relaxed">
                  Listen to learn how <strong className="text-primary font-semibold">{currentWord?.text}</strong> is used.
                </p>
                {currentWord?.sentences && currentWord.sentences.length > 0 && (
                  <p className="text-dyslexia-base text-muted-foreground text-center mt-3 italic">
                    "{getCurrentSentence()}"
                  </p>
                )}
              </div>

              {/* Practice Mode: Hear & Choose */}
              <div className="space-y-4">
                <h3 className="text-dyslexia-lg font-semibold text-foreground text-center mb-6">
                  Choose the meaning:
                </h3>
                
                {meaningChoices.map((choice, index) => (
                  <DyslexiaButton
                    key={index}
                    variant="outline"
                    className={cn(
                      "choice-button h-16",
                      selectedChoice === index && choice.isCorrect && "choice-button-correct",
                      selectedChoice === index && !choice.isCorrect && "choice-button-incorrect"
                    )}
                    onClick={() => handleChoiceSelect(index)}
                    disabled={selectedChoice !== null}
                    data-testid={`choice-${index}`}
                  >
                    {choice.text}
                  </DyslexiaButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Navigation Controls */}
          <div className="flex justify-between items-center">
            <DyslexiaButton
              variant="outline"
              onClick={handleBack}
              disabled={currentIndex === 0}
              className="w-24 h-16"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </DyslexiaButton>
            
            <DyslexiaButton
              onClick={handleNext}
              disabled={selectedChoice === null || !meaningChoices[selectedChoice]?.isCorrect}
              className="w-24 h-16"
              data-testid="next-btn"
            >
              <ArrowRight className="w-5 h-5" />
            </DyslexiaButton>
          </div>
        </div>
      </main>
    </div>
  );
}
