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

interface StudyInterfaceProps {
  onOpenParentDashboard: () => void;
}

interface MeaningChoice {
  text: string;
  isCorrect: boolean;
}

type StudyStep = 'landing' | 'word' | 'definition' | 'sentence' | 'quiz' | 'feedback';

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

export function StudyInterface({ onOpenParentDashboard }: StudyInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState<StudyStep>('landing');
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
  const [meaningChoices, setMeaningChoices] = useState<{ text: string; isCorrect: boolean }[]>([]);
  const [loadingChoices, setLoadingChoices] = useState(false);
  
  // Quiz state for new teacher-approved format
  const [quizAnswers, setQuizAnswers] = useState<{[key: number]: string}>({});

  // Generate quiz choices when word changes
  useEffect(() => {
    if (!currentWord) return;

    const generateChoices = async () => {
      setLoadingChoices(true);
      try {
        // Fetch AI-generated distractors
        const response = await fetch("/api/quiz/distractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: currentWord.text,
            definition: currentWord.kidDefinition,
            partOfSpeech: currentWord.partOfSpeech,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate distractors");
        }

        const data = await response.json();
        const distractors = data.distractors || [];

        // Create choices array with correct answer and AI distractors
        const choices = [
          { text: currentWord.kidDefinition, isCorrect: true },
          ...distractors.map((d: { text: string }) => ({ text: d.text, isCorrect: false }))
        ];

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

        setMeaningChoices(shuffled);
      } catch (error) {
        console.error("Failed to generate quiz choices:", error);
        // Fallback to basic choices if AI fails
        const fallbackChoices = [
          { text: currentWord.kidDefinition, isCorrect: true },
          { text: "To forget about an important event", isCorrect: false },
          { text: "To prepare food for a gathering", isCorrect: false },
        ];
        setMeaningChoices(fallbackChoices);
      } finally {
        setLoadingChoices(false);
      }
    };

    generateChoices();
  }, [currentWord?.id, currentWord?.kidDefinition, currentWord?.text, currentWord?.partOfSpeech]);

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
      setCurrentStep('landing');
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    } else {
      // Session complete - show final score and invalidate cache for next session
      setSessionComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/study/session"] });
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedChoice(null);
      setCurrentStep('landing');
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    }
  };

  const handleStepNavigation = (step: StudyStep) => {
    // Stop all audio playback when navigating to a new step
    stopAllAudio();
    
    setCurrentStep(step);
    if (step === 'word') {
      setSelectedChoice(null);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    } else if (step === 'sentence') {
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    }
  };

  const handleAnswerSelect = (questionNum: number, answer: string) => {
    setQuizAnswers(prev => ({
      ...prev,
      [questionNum]: answer
    }));
  };

  const handleStartSession = () => {
    setSessionStarted(true);
    setSessionComplete(false);
    setCurrentIndex(0);
    setCorrectAnswers(0);
    setSessionWords([]);
    setTotalSessionWords(0);
    setSelectedChoice(null);
    setCurrentStep('landing');
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center flex-1 flex flex-col justify-center">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[200px] h-[200px] mx-auto mb-8 object-contain"
          />
          <h1 className="text-4xl font-bold text-foreground mb-16">WordWizard</h1>
          <div className="flex gap-4">
            <button
              onClick={handleStartSession}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-8 py-3 text-lg font-medium transition-all"
              data-testid="student-button"
            >
              Student
            </button>
            <button
              onClick={onOpenParentDashboard}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-8 py-3 text-lg font-medium transition-all"
              data-testid="instructor-button"
            >
              Instructor
            </button>
          </div>
        </div>
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



  // Student Landing Modal - Frame 2
  if (currentStep === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6">
          <h2 className="text-6xl font-bold text-foreground mb-16">
            {currentWord?.text || 'Loading...'}
          </h2>
          
          {/* Action Buttons */}
          <div className="flex gap-4 mb-16">
            <button
              onClick={() => handleStepNavigation('definition')}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-3 text-lg font-medium transition-all"
              data-testid="definition-button"
            >
              Definition
            </button>
            <button
              onClick={() => handleStepNavigation('sentence')}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-3 text-lg font-medium transition-all"
              data-testid="sentences-button"
            >
              Sentences
            </button>
            <button
              onClick={() => handleStepNavigation('quiz')}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-3 text-lg font-medium transition-all"
              data-testid="quiz-button"
            >
              Quiz
            </button>
          </div>
        </main>

        {/* Bottom Navigation */}
        <footer className="flex items-center justify-center gap-4 p-6">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={cn(
              "p-2 rounded-full transition-colors",
              currentIndex === 0 
                ? "text-muted-foreground cursor-not-allowed"
                : "text-foreground hover:bg-muted"
            )}
            data-testid="previous-word"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-medium text-foreground">
            {currentIndex + 1} of {totalWords}
          </span>
          <button
            onClick={handleNext}
            disabled={currentIndex >= totalWords - 1}
            className={cn(
              "p-2 rounded-full transition-colors",
              currentIndex >= totalWords - 1
                ? "text-muted-foreground cursor-not-allowed"
                : "text-foreground hover:bg-muted"
            )}
            data-testid="next-word"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </footer>
      </div>
    );
  }

  // Progress dots component
  const ProgressDots = () => (
    <div className="flex justify-center space-x-2 mb-8">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "w-3 h-3 rounded-full",
            i === (['word', 'definition', 'sentence', 'quiz'].indexOf(currentStep)) 
              ? "bg-primary" 
              : "bg-muted"
          )}
        />
      ))}
    </div>
  );

  // Step 1: Word Introduction - matches your Screenshot 2
  if (currentStep === 'word') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center flex-1 flex flex-col justify-center">
          <h1 className="text-6xl font-bold text-foreground mb-12">
            {currentWord?.text}
          </h1>
          <AudioPlayer
            text={currentWord?.text || ""}
            type="word"
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-20 h-20 flex items-center justify-center shadow-lg transition-all mx-auto mb-12 border-0 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onPlay={() => {
              // Stop any existing speech when starting new audio
              if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
              }
            }}
            wordId={currentWord?.id}
            data-testid="play-word"
          />
          <button
            onClick={() => handleStepNavigation('definition')}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all inline-block"
            data-testid="next-to-definition"
          >
            Continue
          </button>
          </div>
          <ProgressDots />
        </div>
      </div>
    );
  }

  // Step 2: Definition - matches your Screenshot 3
  if (currentStep === 'definition') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center flex-1 flex flex-col justify-center max-w-2xl">
          <h2 className="text-4xl font-bold text-foreground mb-8">
            {currentWord?.text}
          </h2>
          <p className="text-xl text-foreground mb-12 leading-relaxed">
            {currentWord?.kidDefinition}
          </p>
          <AudioPlayer
            text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
            type="sentence"
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all mx-auto mb-12 border-0 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            wordId={currentWord?.id}
            data-testid="play-definition"
            onPlay={() => {
              // Stop any existing speech when starting new audio
              if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
              }
            }}
          />
          <button
            onClick={() => handleStepNavigation('sentence')}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all inline-block"
            data-testid="next-to-sentence"
          >
            Continue
          </button>
          </div>
          <ProgressDots />
        </div>
      </div>
    );
  }

  // Step 3: Sentence Practice - matches your Screenshot 4
  if (currentStep === 'sentence') {
    const totalSentences = currentWord?.sentences?.length || 0;
    const sentenceNumber = currentSentenceIndex + 1;
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center flex-1 flex flex-col justify-center max-w-3xl">
          <h3 className="text-4xl font-bold text-foreground mb-8">
            {currentWord?.text}
          </h3>
          <p className="text-lg text-muted-foreground mb-8">
            Sentence {sentenceNumber} of {totalSentences}
          </p>
          <div className="text-xl text-foreground mb-12 leading-relaxed max-w-2xl mx-auto">
            <DyslexicReader
              text={getCurrentSentence()}
              currentWordIndex={currentHighlightedWord}
              className="text-xl text-foreground leading-relaxed"
              highlightColor="bg-yellow-200"
            />
          </div>
          
          {/* Navigation Controls */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <button
              onClick={goToPreviousSentence}
              disabled={currentSentenceIndex === 0}
              className="rounded-full w-12 h-12 flex items-center justify-center border-2 border-foreground/20 hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              data-testid="previous-sentence"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            
            <AudioPlayer
              text={getCurrentSentence()}
              type="sentence"
              variant="primary"
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all border-0 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              data-testid="play-sentence"
              wordId={currentWord?.id}
              sentenceId={currentWord?.sentences?.[currentSentenceIndex]?.id}
              onWordHighlight={setCurrentHighlightedWord}
              onEnded={() => {
                setCurrentHighlightedWord(-1);
              }}
            >
              <div className="flex items-center justify-center w-full h-full text-2xl">▶</div>
            </AudioPlayer>
            
            <button
              onClick={goToNextSentence}
              disabled={currentSentenceIndex >= totalSentences - 1}
              className="rounded-full w-12 h-12 flex items-center justify-center border-2 border-foreground/20 hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              data-testid="next-sentence"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
          
          <button
            onClick={() => handleStepNavigation('quiz')}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all inline-block"
            data-testid="next-to-quiz"
          >
            Continue
          </button>
          </div>
          <ProgressDots />
        </div>
      </div>
    );
  }

  // Step 4: New Teacher-Approved Quiz Format
  if (currentStep === 'quiz') {

    // Sample quiz data - will be replaced with AI-generated content
    const clozeQuestions = [
      {
        id: 1,
        sentence: "The grass was crushed in the _______. The crowd began to _______ toward the exit.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'stampede'
      },
      {
        id: 2,
        sentence: "The teacher will _______ the students about their career choices. We need good _______ before making this decision.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'counsel'
      },
      {
        id: 3,
        sentence: "The workers will _______ the heavy boxes to the truck. It took great effort to _______ the furniture upstairs.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'haul'
      },
      {
        id: 4,
        sentence: "Students must _______ to follow the school rules. I make a _______ to do my homework every day.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'pledge'
      },
      {
        id: 5,
        sentence: "The horses began to _______ when they heard the loud noise. There was a _______ of people rushing to the exit.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'stampede'
      },
      {
        id: 6,
        sentence: "The school _______ helped students choose their classes. Parents often _______ their children about important decisions.",
        choices: ['counsel', 'stampede', 'haul', 'pledge'],
        correct: 'counsel'
      }
    ];

    const passageQuestions = [
      { id: 7, choices: ['pledge', 'hardship', 'haul', 'counsel'], correct: 'hardship' },
      { id: 8, choices: ['celebrity', 'counsel', 'stampede', 'pledge'], correct: 'celebrity' },
      { id: 9, choices: ['comfortable', 'annual', 'hardship', 'haul'], correct: 'comfortable' },
      { id: 10, choices: ['restless', 'comfortable', 'celebrity', 'annual'], correct: 'restless' },
      { id: 11, choices: ['demonstrate', 'pledge', 'counsel', 'haul'], correct: 'demonstrate' },
      { id: 12, choices: ['sincere', 'comfortable', 'celebrity', 'restless'], correct: 'sincere' }
    ];

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 px-6 py-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-8 text-center">Weekly Vocabulary Quiz</h1>
            
            {/* Section 1: Cloze Questions (1-6) */}
            <div className="mb-12">
              <div className="bg-muted/30 rounded-lg p-6 mb-8">
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  For Numbers 1-6, read the sentences. Then choose the word that best completes both sentences.
                </h2>
              </div>
              
              <div className="space-y-8">
                {clozeQuestions.map(question => (
                  <div key={question.id} className="bg-card border rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        quizAnswers[question.id] ? "bg-green-100" : "bg-gray-100"
                      )}>
                        {quizAnswers[question.id] ? (
                          <span className="text-green-700 font-semibold">✓</span>
                        ) : (
                          <span className="text-gray-500 font-semibold">{question.id}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-right text-sm text-muted-foreground mb-2">
                          {quizAnswers[question.id] ? "1/1" : "0/1"}
                        </div>
                        <div className="space-y-3 mb-6">
                          <p className="text-lg leading-relaxed">
                            {question.id}. {question.sentence}
                          </p>
                        </div>
                        
                        <div className="space-y-3">
                          {question.choices.map((choice, index) => (
                            <label 
                              key={choice} 
                              className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded"
                              onClick={() => handleAnswerSelect(question.id, choice)}
                            >
                              <div className="w-6 h-6 border-2 border-gray-400 rounded-full flex items-center justify-center">
                                {quizAnswers[question.id] === choice && <div className="w-4 h-4 bg-gray-700 rounded-full"></div>}
                              </div>
                              <span className="text-lg">{choice}</span>
                              {quizAnswers[question.id] === choice && <span className="ml-auto text-green-600">✓</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Passage Questions (7-12) */}
            <div>
              <div className="bg-muted/30 rounded-lg p-6 mb-8">
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  For 7 through 12, read the passage. For each numbered blank, there is a list of words with the same number. Choose the word from each list that best completes the meaning of the passage.
                </h2>
              </div>
              
              <div className="bg-card border rounded-lg p-6 mb-8">
                <div className="prose prose-lg max-w-none">
                  <p className="text-lg leading-relaxed">
                    Do you toss and turn at night? Some people have insomnia and find that falling asleep is a <span className="border-b-2 border-foreground px-1">__(7)__</span>. It happens to many people, whether they are a regular "Joe" or a <span className="border-b-2 border-foreground px-1">__(8)__</span>. There are tips that can help. 1. Sleep in a <span className="border-b-2 border-foreground px-1">__(9)__</span> room that is dark and quiet. 2. Have a snack. You won't feel <span className="border-b-2 border-foreground px-1">__(10)__</span> if you are thinking about food. 3. Have good sleepers <span className="border-b-2 border-foreground px-1">__(11)__</span> their habits. It helps when someone shows what to do. A person who makes a <span className="border-b-2 border-foreground px-1">__(12)__</span> effort to try these tips will sleep better soon.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {passageQuestions.map(question => (
                  <div key={question.id} className="bg-card border rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        quizAnswers[question.id] ? "bg-green-100" : "bg-gray-100"
                      )}>
                        {quizAnswers[question.id] ? (
                          <span className="text-green-700 font-semibold">✓</span>
                        ) : (
                          <span className="text-gray-500 font-semibold">{question.id}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-right text-sm text-muted-foreground mb-4">
                          {quizAnswers[question.id] ? "1/1" : "0/1"}
                        </div>
                        <div className="mb-4">
                          <span className="text-lg font-semibold text-foreground">{question.id}.</span>
                        </div>
                        <div className="space-y-3">
                          {question.choices.map((choice, index) => (
                            <label 
                              key={choice} 
                              className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded"
                              onClick={() => handleAnswerSelect(question.id, choice)}
                            >
                              <div className="w-6 h-6 border-2 border-gray-400 rounded-full flex items-center justify-center">
                                {quizAnswers[question.id] === choice && <div className="w-4 h-4 bg-gray-700 rounded-full"></div>}
                              </div>
                              <span className="text-lg">{choice}</span>
                              {quizAnswers[question.id] === choice && <span className="ml-auto text-green-600">✓</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-12 text-center">
              <button
                onClick={() => handleStepNavigation('feedback')}
                disabled={Object.keys(quizAnswers).length < 12}
                className={cn(
                  "rounded-2xl px-12 py-4 text-xl font-medium transition-all",
                  Object.keys(quizAnswers).length >= 12 
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground" 
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                )}
                data-testid="submit-quiz"
              >
                Submit Quiz ({Object.keys(quizAnswers).length}/12)
              </button>
            </div>
          </div>
          <ProgressDots />
        </div>
      </div>
    );
  }

  // Step 5: Feedback
  if (currentStep === 'feedback') {
    const isCorrect = selectedChoice !== null && meaningChoices[selectedChoice]?.isCorrect;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center flex-1 flex flex-col justify-center">
          <div className={cn("text-6xl mb-8", isCorrect ? "text-green-600" : "text-red-500")}>
            {isCorrect ? "✓" : "✗"}
          </div>
          <h3 className="text-3xl font-bold mb-6 text-foreground">
            {isCorrect ? "Correct!" : "Try Again"}
          </h3>
          <p className="text-xl text-muted-foreground mb-8">
            {isCorrect ? 
              `Great work!` :
              `The correct answer was: ${meaningChoices.find(c => c.isCorrect)?.text}`
            }
          </p>
          </div>
          <ProgressDots />
        </div>
      </div>
    );
  }

  return null;
}
