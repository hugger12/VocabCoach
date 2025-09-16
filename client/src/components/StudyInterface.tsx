import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, BookOpen, Trophy } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { DyslexicReader } from "./DyslexicReader";
import { QuizInterface } from "./QuizInterface";
import { stopAllAudio } from "@/lib/audioManager";
import { learningService, type LearningSessionState } from "@/services/LearningService";
import type { WordWithProgress, StudySession } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export interface StudyInterfaceProps {
  onClose: () => void;
  // SECURITY: Removed instructorId prop - now using server session auth
}

// Simple header component
const StudyHeader = ({ onClose }: { onClose: () => void }) => (
  <header className="flex items-center justify-between p-6">
    <img 
      src={huggerLogo} 
      alt="Hugger Digital" 
      className="w-[100px] h-[100px] object-contain"
    />
    <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
    <button
      onClick={() => {
        stopAllAudio(); // Stop any playing audio when closing
        onClose();
      }}
      className="p-2 text-foreground hover:text-muted-foreground transition-colors"
      data-testid="close-session"
    >
      <X className="w-6 h-6" />
    </button>
  </header>
);

export function StudyInterface({ onClose }: StudyInterfaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [sessionWords, setSessionWords] = useState<WordWithProgress[]>([]);
  const [totalSessionWords, setTotalSessionWords] = useState(0);
  const [currentWordHighlightIndex, setCurrentWordHighlightIndex] = useState(-1);
  const [currentSentenceHighlightIndex, setCurrentSentenceHighlightIndex] = useState(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [learningSession, setLearningSession] = useState<LearningSessionState | null>(null);

  // Fetch study session - now using secure session-based auth
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    queryFn: async () => {
      // SECURITY: Removed instructor query parameter - now using server session auth
      const response = await fetch(`/api/study/session`, {
        credentials: 'include' // Include session cookies for authentication
      });
      if (!response.ok) throw new Error("Failed to fetch session");
      return response.json();
    },
    enabled: !sessionComplete,
  });

  // Store session words when first loaded and start learning session
  useEffect(() => {
    if (session?.words && sessionWords.length === 0) {
      setSessionWords([...session.words]);
      setTotalSessionWords(session.totalWords);
      
      // Start learning session using LearningService
      startLearningSession(session.words);
    }
  }, [session?.words, sessionWords.length, session?.totalWords]);
  
  // Initialize learning session with background quiz generation
  const startLearningSession = async (words: WordWithProgress[]) => {
    try {
      const newSession = await learningService.startLearningSession({
        sessionType: 'study',
        listId: session?.id,
      });
      setLearningSession(newSession);
    } catch (error) {
      console.error("Failed to start learning session:", error);
    }
  };


  // Stop audio when word changes or component unmounts
  useEffect(() => {
    return () => {
      stopAllAudio(); // Cleanup on unmount
    };
  }, []);

  // Reset highlighting when currentIndex changes (word changes) - don't stop audio here
  useEffect(() => {
    setCurrentWordHighlightIndex(-1);
    setCurrentSentenceHighlightIndex(-1);
    setActiveSentenceIndex(-1);
  }, [currentIndex]);

  const handleDefinitionPlay = () => {
    // Reset sentence highlighting when definition plays
    console.log('Definition play clicked - resetting sentence highlighting');
    setCurrentSentenceHighlightIndex(-1);
    setActiveSentenceIndex(-1);
    // Audio stopping will be handled by the AudioPlayer's onPlay callback
  };

  const handleDefinitionWordHighlight = (wordIndex: number) => {
    console.log("Definition word highlight:", wordIndex);
    setCurrentWordHighlightIndex(wordIndex);
  };

  const handleDefinitionEnded = () => {
    setCurrentWordHighlightIndex(-1);
  };

  const handleSentencePlay = (sentenceIndex: number) => {
    // Reset definition highlighting when sentence plays
    console.log(`Sentence ${sentenceIndex} play clicked - resetting definition highlighting`);
    setCurrentWordHighlightIndex(-1);
    setActiveSentenceIndex(sentenceIndex);
    setCurrentSentenceHighlightIndex(-1);
    // Audio stopping will be handled by the AudioPlayer's onPlay callback
  };

  const handleSentenceWordHighlight = (wordIndex: number) => {
    console.log("Sentence word highlight:", wordIndex);
    setCurrentSentenceHighlightIndex(wordIndex);
  };

  const handleSentenceEnded = () => {
    setCurrentSentenceHighlightIndex(-1);
    setActiveSentenceIndex(-1);
  };

  const handleStartQuiz = async () => {
    try {
      // Use LearningService to start quiz session
      if (learningSession) {
        // await learningService.startQuizSession(learningSession.sessionId, sessionWords);
        console.log('Starting quiz session');
      }
      setShowQuiz(true);
    } catch (error) {
      console.error("Failed to start quiz session:", error);
    }
  };

  const handleQuizComplete = async (score: number) => {
    try {
      // Use LearningService to handle quiz completion
      if (learningSession) {
        // await learningService.endSession(learningSession.sessionId, { 
        //   quizScore: score,
        //   studyProgress: currentIndex + 1,
        //   totalWords: sessionWords.length
        // });
        console.log('Quiz completed with score:', score);
      }
      console.log("Quiz completed with score:", score);
    } catch (error) {
      console.error("Failed to complete quiz session:", error);
    }
  };

  const handleQuizClose = () => {
    setShowQuiz(false);
    // After closing quiz, user can either retake or finish
  };

  const currentWord = sessionWords[currentIndex];
  const totalWords = totalSessionWords || sessionWords.length || 0;

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your words...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading study session</p>
          <button
            onClick={onClose}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-6 py-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Show quiz interface if quiz is active
  if (showQuiz) {
    return (
      <QuizInterface 
        words={sessionWords}
        onClose={handleQuizClose}
        onComplete={handleQuizComplete}
      />
    );
  }

  if (sessionComplete) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <StudyHeader onClose={onClose} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-2xl">
            <h2 className="text-4xl font-bold text-foreground mb-8 dyslexia-text-2xl">Great job!</h2>
            <p className="text-xl text-muted-foreground mb-8 dyslexia-text-lg">
              You've reviewed all {totalWords} words.
            </p>
            
            <div className="space-y-4 mb-8">
              <p className="text-lg text-foreground mb-6 dyslexia-text-base">
                What would you like to do next?
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleStartQuiz}
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all flex items-center justify-center gap-3 min-w-[200px] dyslexia-text-base"
                  data-testid="start-quiz"
                >
                  <Trophy className="w-6 h-6" />
                  Take Quiz
                </button>
                
                <button
                  onClick={onClose}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all flex items-center justify-center gap-3 min-w-[200px] dyslexia-text-base"
                  data-testid="finish-session"
                >
                  <BookOpen className="w-6 h-6" />
                  Finish
                </button>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground dyslexia-text-base">
              The quiz will test what you've learned with fun questions!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main word display with compact layout and word highlighting
  return (
    <div className="h-screen bg-background flex flex-col">
      <StudyHeader onClose={onClose} />
      
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-auto">
        <div className="text-center max-w-4xl w-full">
          
          {/* Word Display */}
          <h2 className="text-6xl font-bold text-foreground mb-6">
            {currentWord?.text}
          </h2>
          
          {/* Definition with word highlighting */}
          <div className="mb-8">
            <DyslexicReader
              text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
              currentWordIndex={currentWordHighlightIndex}
              className="text-2xl text-foreground mb-6 leading-relaxed"
            />
            <AudioPlayer
              text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
              type="sentence"
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-20 h-20 flex items-center justify-center shadow-lg transition-all mx-auto border-0 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              wordId={currentWord?.id}
              onPlay={handleDefinitionPlay}
              onWordHighlight={handleDefinitionWordHighlight}
              onEnded={handleDefinitionEnded}
              data-testid="play-definition"
            />
          </div>

          {/* Compact Sentences Section */}
          {currentWord?.sentences && currentWord.sentences.length > 0 && (
            <div className="mb-8 space-y-4">
              {currentWord.sentences.map((sentence, index) => (
                <div key={sentence.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <AudioPlayer
                      text={sentence.text}
                      type="sentence"
                      className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all flex-shrink-0 border-0 outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
                      sentenceId={sentence.id}
                      onPlay={() => handleSentencePlay(index)}
                      onWordHighlight={handleSentenceWordHighlight}
                      onEnded={handleSentenceEnded}
                      data-testid={`play-sentence-${index}`}
                    />
                    <div className="flex-1 text-left">
                      <DyslexicReader
                        text={sentence.text}
                        currentWordIndex={activeSentenceIndex === index ? currentSentenceHighlightIndex : -1}
                        className="text-lg text-foreground leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Navigation - Always visible at bottom */}
          <div className="flex items-center justify-center gap-8 mb-4">
            <button
              onClick={() => {
                stopAllAudio(); // Stop any playing audio and highlighting
                if (currentIndex > 0) {
                  setCurrentIndex(currentIndex - 1);
                }
              }}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 bg-muted hover:bg-muted/90 disabled:opacity-50 text-muted-foreground rounded-xl px-6 py-3 font-medium transition-all disabled:cursor-not-allowed"
              data-testid="previous-word"
            >
              ← Previous
            </button>
            
            <button
              onClick={() => {
                stopAllAudio(); // Stop any playing audio and highlighting
                if (currentIndex + 1 < sessionWords.length) {
                  setCurrentIndex(currentIndex + 1);
                } else {
                  setSessionComplete(true);
                }
              }}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl px-6 py-3 font-medium transition-all"
              data-testid="next-word"
            >
              {currentIndex + 1 < sessionWords.length ? 'Next →' : 'Finish'}
            </button>
          </div>

          {/* Progress indicator */}
          <div className="text-center text-muted-foreground">
            <p className="text-lg">Word {currentIndex + 1} of {totalWords}</p>
          </div>
        </div>
      </main>
    </div>
  );
}