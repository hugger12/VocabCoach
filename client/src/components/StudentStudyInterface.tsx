import { useState, useEffect, useMemo, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Volume2, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { SpeechSynthesisPlayer } from "./SpeechSynthesisPlayer";
import { DyslexicReader } from "./DyslexicReader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { WordWithProgress, StudySession } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";
import { stopAllAudio } from "@/lib/audioManager";

interface StudentStudyInterfaceProps {
  onClose: () => void;
}

interface MeaningChoice {
  text: string;
  isCorrect: boolean;
}

type StudyStep = 'landing' | 'word' | 'definition' | 'sentence' | 'session-complete' | 'quiz' | 'feedback';

// Separate memoized header component to prevent logo flashing
const StudyHeader = memo(({ onClose }: { onClose: () => void }) => (
  <header className="flex items-center justify-between p-6">
    <img 
      src={huggerLogo} 
      alt="Hugger Digital" 
      className="w-[100px] h-[100px] object-contain"
      style={{ 
        willChange: 'auto',
        transform: 'translateZ(0)', // Force hardware acceleration
        backfaceVisibility: 'hidden' // Prevent flicker
      }}
    />
    <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
    <button
      onClick={onClose}
      className="p-2 text-foreground hover:text-muted-foreground transition-colors"
      data-testid="close-session"
    >
      <X className="w-6 h-6" />
    </button>
  </header>
));

export function StudentStudyInterface({ onClose }: StudentStudyInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<StudyStep>('landing');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentHighlightedWord, setCurrentHighlightedWord] = useState(-1);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [sessionWords, setSessionWords] = useState<WordWithProgress[]>([]);
  const [totalSessionWords, setTotalSessionWords] = useState(0);
  const [allWordsReviewed, setAllWordsReviewed] = useState(false);

  // Always fetch the study session since students are authenticated
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: !sessionComplete && currentStep !== 'quiz',
  });

  // Store session words when first loaded and check if all words have been reviewed
  useEffect(() => {
    if (session?.words && sessionWords.length === 0) {
      setSessionWords([...session.words]);
      setTotalSessionWords(session.totalWords);
      
      // Check if all words have been reviewed (have attempts recorded)
      const hasReviewedAllWords = session.words.length > 0 && 
        session.words.every(word => word.attempts && word.attempts.length > 0);
      
      if (hasReviewedAllWords) {
        setAllWordsReviewed(true);
      }
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
  });

  const currentWord = sessionWords[currentIndex];
  const totalWords = totalSessionWords || sessionWords.length || 0;
  const progressPercentage = totalWords > 0 ? ((currentIndex + 1) / totalWords) * 100 : 0;

  // Generate meaning choices with stable shuffling
  const [meaningChoices, setMeaningChoices] = useState<{ text: string; isCorrect: boolean }[]>([]);
  const [loadingChoices, setLoadingChoices] = useState(false);
  
  // Quiz state for teacher-approved format
  const [quizAnswers, setQuizAnswers] = useState<{[key: number]: string}>({});
  const [clozeQuestions, setClozeQuestions] = useState<any[]>([]);
  const [passageQuestions, setPassageQuestions] = useState<any[]>([]);
  const [passage, setPassage] = useState<string>("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuizQuestion, setCurrentQuizQuestion] = useState(1);
  const [totalQuizQuestions, setTotalQuizQuestions] = useState(12);

  // Generate quiz choices when word changes
  useEffect(() => {
    if (!currentWord) return;

    const generateChoices = async () => {
      if (loadingChoices) return;
      
      setLoadingChoices(true);
      try {
        const response = await fetch("/api/quiz/distractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            word: currentWord.text,
            correctDefinition: currentWord.kidDefinition 
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // Create choices with correct answer and distractors
          const choices = [
            { text: currentWord.kidDefinition, isCorrect: true },
            ...data.distractors.map((d: any) => ({ text: d.text, isCorrect: false }))
          ];
          
          // Shuffle choices
          const shuffled = [...choices].sort(() => Math.random() - 0.5);
          setMeaningChoices(shuffled);
        } else {
          // Fallback to simple choices
          setMeaningChoices([
            { text: currentWord.kidDefinition, isCorrect: true },
            { text: "incorrect choice 1", isCorrect: false },
            { text: "incorrect choice 2", isCorrect: false },
            { text: "incorrect choice 3", isCorrect: false }
          ]);
        }
      } catch (error) {
        console.error("Error generating choices:", error);
        // Fallback choices
        setMeaningChoices([
          { text: currentWord.kidDefinition, isCorrect: true },
          { text: "incorrect choice 1", isCorrect: false },
          { text: "incorrect choice 2", isCorrect: false },
          { text: "incorrect choice 3", isCorrect: false }
        ]);
      } finally {
        setLoadingChoices(false);
      }
    };

    if (currentStep === 'definition') {
      generateChoices();
    }
  }, [currentWord, currentStep, loadingChoices]);

  // Rest of the StudyInterface logic (quiz generation, navigation, etc.)
  // I'll include the essential parts for now and can expand as needed

  const handleNextStep = () => {
    switch (currentStep) {
      case 'landing':
        setCurrentStep('word');
        break;
      case 'word':
        setCurrentStep('definition');
        break;
      case 'definition':
        setCurrentStep('sentence');
        break;
      case 'sentence':
        if (currentIndex + 1 < sessionWords.length) {
          setCurrentIndex(currentIndex + 1);
          setCurrentStep('word');
          setSelectedChoice(null);
          setCurrentSentenceIndex(0);
          setCurrentHighlightedWord(-1);
        } else {
          setSessionComplete(true);
        }
        break;
    }
  };

  const handleQuizMode = () => {
    setCurrentStep('quiz');
  };

  const getCurrentSentence = () => {
    if (!currentWord?.sentences || currentWord.sentences.length === 0) {
      return `Here is an example: The ${currentWord?.partOfSpeech} "${currentWord?.text}" means ${currentWord?.kidDefinition}.`;
    }
    return currentWord.sentences[currentSentenceIndex]?.text || "";
  };

  const goToPreviousSentence = () => {
    if (currentSentenceIndex > 0) {
      stopAllAudio();
      setCurrentSentenceIndex(currentSentenceIndex - 1);
      setCurrentHighlightedWord(-1);
    }
  };

  const goToNextSentence = () => {
    if (currentWord?.sentences && currentSentenceIndex < currentWord.sentences.length - 1) {
      stopAllAudio();
      setCurrentSentenceIndex(currentSentenceIndex + 1);
      setCurrentHighlightedWord(-1);
    }
  };

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

  if (error || (sessionWords.length === 0 && !isLoading && totalSessionWords === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center p-8">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            No Words Available
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            {error ? "Error loading words." : "Ask your teacher to add vocabulary words first."}
          </p>
          <button
            onClick={onClose}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            OK
          </button>
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
            onClick={onClose}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
            data-testid="back-to-start"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Student Landing Modal - Frame 2
  if (currentStep === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={onClose} />

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6">
          <h2 className="text-6xl font-bold text-foreground mb-16">
            {currentWord?.text || 'Loading...'}
          </h2>
          
          {/* Action Buttons */}
          <div className="flex gap-6 mb-16">
            <button
              onClick={handleNextStep}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-4 text-xl font-medium transition-all"
              data-testid="practice-words"
            >
              Practice Words
            </button>
            
            {allWordsReviewed && (
              <button
                onClick={handleQuizMode}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-12 py-4 text-xl font-medium transition-all"
                data-testid="take-quiz"
              >
                Take Quiz
              </button>
            )}
          </div>

          {/* Progress indicator */}
          <div className="text-center text-muted-foreground">
            <p>Word {currentIndex + 1} of {totalWords}</p>
          </div>
        </main>
      </div>
    );
  }

  // Basic word display for now - can expand with full functionality
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StudyHeader onClose={onClose} />
      
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-foreground mb-8">
            {currentWord?.text}
          </h2>
          
          {currentStep === 'word' && (
            <div className="space-y-8 text-center">
              <div className="space-y-6">
                <AudioPlayer 
                  text={currentWord?.text || ''} 
                  type="word"
                  className="mx-auto"
                  data-testid="play-word"
                />
                <p className="text-lg text-muted-foreground">
                  {currentWord?.partOfSpeech && `(${currentWord.partOfSpeech})`}
                </p>
              </div>
              
              <button
                onClick={handleNextStep}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-4 text-xl font-medium transition-all"
                data-testid="learn-meaning"
              >
                Learn Meaning
              </button>
            </div>
          )}

          {currentStep === 'definition' && (
            <div className="space-y-8 max-w-3xl">
              {/* Definition Display */}
              <div className="text-center space-y-6">
                <p className="text-2xl font-medium text-foreground mb-8">
                  {currentWord?.kidDefinition}
                </p>
                <AudioPlayer 
                  text={currentWord?.kidDefinition || ''} 
                  type="word"
                  className="mx-auto"
                  data-testid="play-definition"
                />
              </div>

              {/* Multiple Choice Quiz */}
              {meaningChoices.length > 0 && !loadingChoices ? (
                <div className="space-y-4">
                  <p className="text-lg font-medium text-center text-foreground mb-6">
                    Which definition matches "{currentWord?.text}"?
                  </p>
                  <div className="grid gap-3">
                    {meaningChoices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedChoice(index);
                          // Record the attempt
                          recordAttempt.mutate({
                            wordId: currentWord?.id || '',
                            mode: 'definition',
                            success: choice.isCorrect,
                            errorType: choice.isCorrect ? undefined : 'wrong_definition'
                          });
                          if (choice.isCorrect) {
                            setCorrectAnswers(prev => prev + 1);
                          }
                        }}
                        disabled={selectedChoice !== null}
                        className={cn(
                          "p-4 rounded-xl text-left transition-all border-2 text-base",
                          selectedChoice === index
                            ? choice.isCorrect
                              ? "bg-green-50 border-green-500 text-green-800"
                              : "bg-red-50 border-red-500 text-red-800"
                            : selectedChoice !== null
                            ? "bg-muted text-muted-foreground border-muted"
                            : "bg-card hover:bg-accent border-border hover:border-primary"
                        )}
                        data-testid={`choice-${index}`}
                      >
                        {choice.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-muted-foreground">Loading choices...</p>
                </div>
              )}
              
              {selectedChoice !== null && (
                <div className="text-center pt-6">
                  <button
                    onClick={handleNextStep}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-4 text-xl font-medium transition-all"
                    data-testid="continue-to-sentence"
                  >
                    See Example
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 'sentence' && (
            <div className="space-y-8 max-w-4xl text-center">
              <div className="space-y-6">
                <p className="text-xl text-foreground leading-relaxed">
                  {getCurrentSentence()}
                </p>
                
                {currentWord?.sentences?.[currentSentenceIndex] && (
                  <div className="space-y-4">
                    <DyslexicReader
                      text={currentWord.sentences[currentSentenceIndex].text}
                      currentWordIndex={currentHighlightedWord}
                    />
                    
                    {/* Sentence Navigation */}
                    {currentWord?.sentences && currentWord.sentences.length > 1 && (
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={goToPreviousSentence}
                          disabled={currentSentenceIndex === 0}
                          className="p-2 rounded-full bg-secondary text-secondary-foreground disabled:opacity-50"
                          data-testid="previous-sentence"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        
                        <span className="text-sm text-muted-foreground">
                          {currentSentenceIndex + 1} of {currentWord.sentences.length}
                        </span>
                        
                        <button
                          onClick={goToNextSentence}
                          disabled={currentSentenceIndex === currentWord.sentences.length - 1}
                          className="p-2 rounded-full bg-secondary text-secondary-foreground disabled:opacity-50"
                          data-testid="next-sentence"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={handleNextStep}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-12 py-4 text-xl font-medium transition-all"
                data-testid="next-word"
              >
                {currentIndex + 1 < sessionWords.length ? "Next Word" : "Finish Practice"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}