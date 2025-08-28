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

  // Fetch study session (disabled for quiz mode)
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: sessionStarted && !sessionComplete && currentStep !== 'quiz',
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

  const handleNextWord = () => {
    if (currentIndex < totalWords - 1) {
      // Go to next word - show landing with Definition/Sentences buttons
      setCurrentIndex(currentIndex + 1);
      setCurrentStep('landing');
      setSelectedChoice(null);
      setCurrentSentenceIndex(0);
      setCurrentHighlightedWord(-1);
    } else {
      // Session complete - show completion screen
      setCurrentStep('session-complete');
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

  // Generate quiz content using AI and actual weekly words
  const generateQuizContent = async () => {
    try {
      setQuizLoading(true);
      
      // Determine how many questions we can make based on available words
      const availableWords = sessionWords.length;
      if (availableWords === 0) {
        setTotalQuizQuestions(0);
        return;
      }

      // Use available words for cloze questions (up to 6)
      const wordsForCloze = sessionWords.slice(0, Math.min(6, availableWords));
      const clozeCount = wordsForCloze.length;
      
      // Use remaining words for passage questions if we have enough
      const wordsForPassage = sessionWords.slice(6, Math.min(12, availableWords));
      const passageCount = wordsForPassage.length;
      
      setTotalQuizQuestions(clozeCount + passageCount);

      // Generate cloze questions (Section 1)
      if (clozeCount > 0) {
        const clozeResponse = await fetch("/api/quiz/cloze/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordsForCloze }),
        });

        if (clozeResponse.ok) {
          const clozeData = await clozeResponse.json();
          setClozeQuestions(clozeData.questions || []);
        }
      }

      // Generate passage quiz (Section 2) - only if we have enough words
      if (passageCount >= 6) {
        const passageResponse = await fetch("/api/quiz/passage/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordsForPassage }),
        });

        if (passageResponse.ok) {
          const passageData = await passageResponse.json();
          setPassage(passageData.passage || "");
          setPassageQuestions(passageData.questions || []);
        }
      }

    } catch (error) {
      console.error("Error generating quiz content:", error);
      // Set to basic quiz if AI fails
      setTotalQuizQuestions(1);
      setClozeQuestions([
        {
          id: 1,
          sentence1: "The grass was crushed in the _______.",
          sentence2: "The crowd began to _______ toward the exit.",
          choices: ['counsel', 'stampede', 'haul', 'pledge'],
          correctAnswer: 'stampede'
        }
      ]);
    } finally {
      setQuizLoading(false);
    }
  };

  // Generate quiz content when quiz step is reached
  useEffect(() => {
    if (currentStep === 'quiz' && clozeQuestions.length === 0) {
      // For quiz, we need all weekly words, not just the session words
      fetchQuizSession();
    }
  }, [currentStep]);

  // Fetch all weekly words for quiz (separate from regular study session)
  const fetchQuizSession = async () => {
    try {
      console.log("Fetching quiz session with all weekly words...");
      const response = await fetch("/api/study/session?quiz=true");
      if (response.ok) {
        const quizSession = await response.json();
        console.log("Quiz session received:", quizSession);
        if (quizSession.words && quizSession.words.length > 0) {
          console.log(`Found ${quizSession.words.length} words for quiz`);
          // Generate quiz content directly with fetched words
          await generateQuizContentWithWords(quizSession.words);
        } else {
          console.log("No words available for quiz");
          setTotalQuizQuestions(0);
        }
      } else {
        console.error("Failed to fetch quiz session:", response.status);
        setTotalQuizQuestions(0);
      }
    } catch (error) {
      console.error("Error fetching quiz session:", error);
      setTotalQuizQuestions(0);
    }
  };

  // Generate quiz content with specific words array
  const generateQuizContentWithWords = async (words: any[]) => {
    try {
      setQuizLoading(true);
      
      // Determine how many questions we can make based on available words
      const availableWords = words.length;
      if (availableWords === 0) {
        setTotalQuizQuestions(0);
        return;
      }

      // Use available words for cloze questions (up to 6)
      const wordsForCloze = words.slice(0, Math.min(6, availableWords));
      const clozeCount = wordsForCloze.length;
      
      // Use remaining words for passage questions if we have enough
      const wordsForPassage = words.slice(6, Math.min(12, availableWords));
      const passageCount = wordsForPassage.length;
      
      setTotalQuizQuestions(clozeCount + passageCount);

      // Generate cloze questions (Section 1)
      if (clozeCount > 0) {
        const clozeResponse = await fetch("/api/quiz/cloze/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordsForCloze }),
        });

        if (clozeResponse.ok) {
          const clozeData = await clozeResponse.json();
          setClozeQuestions(clozeData.questions || []);
        }
      }

      // Generate passage quiz (Section 2) - only if we have enough words
      if (passageCount >= 6) {
        const passageResponse = await fetch("/api/quiz/passage/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordsForPassage }),
        });

        if (passageResponse.ok) {
          const passageData = await passageResponse.json();
          setPassage(passageData.passage || "");
          setPassageQuestions(passageData.questions || []);
        }
      }

    } catch (error) {
      console.error("Error generating quiz content:", error);
      // Set to basic quiz if AI fails
      setTotalQuizQuestions(1);
      setClozeQuestions([
        {
          id: 1,
          sentence1: "The grass was crushed in the _______.",
          sentence2: "The crowd began to _______ toward the exit.",
          choices: ['counsel', 'stampede', 'haul', 'pledge'],
          correctAnswer: 'stampede'
        }
      ]);
    } finally {
      setQuizLoading(false);
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
            onClick={handleNextWord}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all inline-block"
            data-testid="next-word-button"
          >
            {currentIndex >= totalWords - 1 ? 'Complete Session' : 'Next Word'}
          </button>
          </div>
        </div>
      </div>
    );
  }

  // Session Complete Screen - Show after all words studied
  if (currentStep === 'session-complete') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-2xl">
            <h1 className="text-4xl font-bold text-foreground mb-8">
              Great Work!
            </h1>
            <p className="text-xl text-muted-foreground mb-12">
              You've completed studying all {totalWords} vocabulary words for this week.
            </p>
            
            <div className="flex flex-col gap-4 mb-8">
              <button
                onClick={() => handleStepNavigation('quiz')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
                data-testid="take-quiz-button"
              >
                Take Weekly Quiz
              </button>
              <button
                onClick={handleCloseSession}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
                data-testid="finish-session-button"
              >
                Finish for Now
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              The quiz contains {totalWords} questions covering all the words you just studied.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: New Teacher-Approved Quiz Format with AI-Generated Content
  if (currentStep === 'quiz') {

    // Get current question data
    const getCurrentQuestion = () => {
      if (currentQuizQuestion <= clozeQuestions.length) {
        // Cloze question (1-6)
        const question = clozeQuestions[currentQuizQuestion - 1];
        return {
          type: 'cloze',
          question,
          instructions: "Read the sentences. Then choose the word that best completes both sentences."
        };
      } else {
        // Passage question (7-12)
        const passageIndex = currentQuizQuestion - clozeQuestions.length - 1;
        const question = passageQuestions[passageIndex];
        return {
          type: 'passage',
          question,
          instructions: "Read the passage. Choose the word from the list that best completes the meaning of the passage.",
          passage: passage
        };
      }
    };

    const currentQuestion = getCurrentQuestion();

    const handleNextQuestion = () => {
      if (currentQuizQuestion < totalQuizQuestions) {
        setCurrentQuizQuestion(prev => prev + 1);
      } else {
        // Quiz complete, go to feedback
        handleStepNavigation('feedback');
      }
    };

    const handlePreviousQuestion = () => {
      if (currentQuizQuestion > 1) {
        setCurrentQuizQuestion(prev => prev - 1);
      }
    };

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StudyHeader onClose={handleCloseSession} />
        <div className="flex-1 px-6 py-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-4">Weekly Vocabulary Quiz</h1>
              <div className="text-xl text-foreground/60">
                Question {currentQuizQuestion} of {totalQuizQuestions}
              </div>
            </div>
            
            {quizLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
                <p className="text-xl text-foreground/60">Generating your quiz...</p>
              </div>
            ) : totalQuizQuestions === 0 ? (
              <div className="text-center py-16">
                <p className="text-xl text-foreground/60">No words available for quiz. Please add vocabulary words first.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Instructions */}
                <div className="bg-muted/30 rounded-lg p-6 text-center">
                  <h2 className="text-xl font-semibold text-foreground">
                    {currentQuestion?.instructions}
                  </h2>
                </div>

                {/* Question Content */}
                {currentQuestion?.type === 'cloze' && currentQuestion.question && (
                  <div className="bg-card border rounded-lg p-8">
                    <div className="space-y-6">
                      <p className="text-lg leading-relaxed text-center">
                        {currentQuestion.question.sentence1}<br />
                        {currentQuestion.question.sentence2}
                      </p>
                      
                      <div className="space-y-4">
                        {currentQuestion.question.choices?.map((choice: string) => (
                          <label 
                            key={choice} 
                            className="flex items-center gap-4 cursor-pointer hover:bg-muted/50 p-4 rounded-lg border transition-colors"
                            onClick={() => handleAnswerSelect(currentQuizQuestion, choice)}
                          >
                            <div className="w-6 h-6 border-2 border-gray-400 rounded-full flex items-center justify-center flex-shrink-0">
                              {quizAnswers[currentQuizQuestion] === choice && <div className="w-4 h-4 bg-gray-700 rounded-full"></div>}
                            </div>
                            <span className="text-lg">{choice}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentQuestion?.type === 'passage' && (
                  <>
                    {/* Show passage first */}
                    {currentQuestion.passage && (
                      <div className="bg-card border rounded-lg p-6 mb-6">
                        <div className="prose prose-lg max-w-none">
                          <p className="text-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: currentQuestion.passage }} />
                        </div>
                      </div>
                    )}
                    
                    {/* Show current passage question */}
                    {currentQuestion.question && (
                      <div className="bg-card border rounded-lg p-8">
                        <div className="space-y-6">
                          <p className="text-lg font-semibold text-foreground text-center">
                            {currentQuizQuestion}.
                          </p>
                          
                          <div className="space-y-4">
                            {currentQuestion.question.choices?.map((choice: string) => (
                              <label 
                                key={choice} 
                                className="flex items-center gap-4 cursor-pointer hover:bg-muted/50 p-4 rounded-lg border transition-colors"
                                onClick={() => handleAnswerSelect(currentQuizQuestion, choice)}
                              >
                                <div className="w-6 h-6 border-2 border-gray-400 rounded-full flex items-center justify-center flex-shrink-0">
                                  {quizAnswers[currentQuizQuestion] === choice && <div className="w-4 h-4 bg-gray-700 rounded-full"></div>}
                                </div>
                                <span className="text-lg">{choice}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between items-center pt-8">
                  <button
                    onClick={handlePreviousQuestion}
                    disabled={currentQuizQuestion === 1}
                    className={cn(
                      "rounded-xl px-8 py-3 text-lg font-medium transition-all",
                      currentQuizQuestion > 1 
                        ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground" 
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                    data-testid="previous-question"
                  >
                    Previous
                  </button>

                  <div className="text-center">
                    {quizAnswers[currentQuizQuestion] ? (
                      <span className="text-green-600 font-semibold">Answer Selected</span>
                    ) : (
                      <span className="text-gray-500">Select an answer</span>
                    )}
                  </div>

                  <button
                    onClick={handleNextQuestion}
                    disabled={!quizAnswers[currentQuizQuestion]}
                    className={cn(
                      "rounded-xl px-8 py-3 text-lg font-medium transition-all",
                      quizAnswers[currentQuizQuestion]
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground" 
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                    data-testid="next-question"
                  >
                    {currentQuizQuestion === totalQuizQuestions ? "Finish Quiz" : "Next"}
                  </button>
                </div>
              </div>
            )}
          </div>
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
        </div>
      </div>
    );
  }

  return null;
}
