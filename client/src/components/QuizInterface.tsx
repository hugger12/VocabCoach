import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { quizService, type QuizSession, type QuizAttempt, type ClozeQuizQuestion, type PassageQuizQuestion } from "@/services/QuizService";
import type { WordWithProgress } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";
import { AppShell } from "@/components/ui/AppShell";
import { ScrollableSection } from "@/components/ui/ScrollableSection";
import { useScrollToTop } from "@/hooks/useScrollToTop";

export interface QuizInterfaceProps {
  words: WordWithProgress[];
  onClose: () => void;
  onComplete?: (score: number) => void;
  listId?: string;
  // SECURITY: Removed instructorId prop - now using server session auth
}

export function QuizInterface({ words, onClose, onComplete, listId }: QuizInterfaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentSection, setCurrentSection] = useState<'cloze' | 'passage'>('cloze');
  const [clozeQuestions, setClozeQuestions] = useState<ClozeQuizQuestion[]>([]);
  const [passageQuestion, setPassageQuestion] = useState<PassageQuizQuestion | null>(null);
  const [currentPassageBlankIndex, setCurrentPassageBlankIndex] = useState(0);
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const { toast } = useToast();
  
  // Ref for scrollable content area (main element in AppShell)
  const contentRef = useRef<HTMLElement>(null);
  
  // Scroll to top when question changes - triggers on BOTH cloze and passage question changes
  useScrollToTop(contentRef, [currentQuestionIndex, currentPassageBlankIndex]);

  // Generate comprehensive quiz when component mounts
  useEffect(() => {
    generateQuiz();
  }, []);

  // Generate quiz using QuizService
  const generateQuiz = async () => {
    try {
      setIsLoading(true);
      
      // Use QuizService to generate comprehensive quiz
      const session = await quizService.generateComprehensiveQuiz(words, listId);
      
      setQuizSession(session);
      setClozeQuestions(session.clozeQuestions);
      setPassageQuestion(session.passageQuestion);
      setCurrentSection('cloze');
      
    } catch (error) {
      console.error("Error generating quiz:", error);
      toast({
        title: "Quiz Error",
        description: error instanceof Error ? error.message : "Could not generate quiz questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (!selectedAnswer) return;

    if (currentSection === 'cloze') {
      const currentQuestion = clozeQuestions[currentQuestionIndex];
      const attempt: QuizAttempt = {
        questionId: currentQuestion.id,
        questionNumber: currentQuestion.questionNumber,
        selectedAnswer,
        correctAnswer: currentQuestion.correctAnswer,
        isCorrect: selectedAnswer === currentQuestion.correctAnswer,
      };
      setAttempts(prev => [...prev, attempt]);
      setShowResult(true);
    } else if (currentSection === 'passage' && passageQuestion) {
      const currentBlank = passageQuestion.blanks[currentPassageBlankIndex];
      const attempt: QuizAttempt = {
        questionId: currentBlank.id,
        questionNumber: currentBlank.questionNumber,
        selectedAnswer,
        correctAnswer: currentBlank.correctAnswer,
        isCorrect: selectedAnswer === currentBlank.correctAnswer,
      };
      setAttempts(prev => [...prev, attempt]);
      setShowResult(true);
    }
  };

  const handleNextQuestion = () => {
    if (currentSection === 'cloze') {
      if (currentQuestionIndex < clozeQuestions.length - 1) {
        // Next cloze question
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedAnswer("");
        setShowResult(false);
      } else {
        // Check if passage is loaded before transitioning
        if (passageQuestion) {
          setCurrentSection('passage');
          setCurrentQuestionIndex(0);
          setCurrentPassageBlankIndex(0);
          setSelectedAnswer("");
          setShowResult(false);
        } else {
          // Passage failed to load or not available - complete the quiz
          toast({
            title: "Quiz Complete",
            description: "Completing quiz with cloze questions only.",
          });
          setIsComplete(true);
          const scoreResult = quizService.calculateQuizScore(attempts);
          onComplete?.(scoreResult.score);
        }
      }
    } else if (currentSection === 'passage' && passageQuestion) {
      if (currentPassageBlankIndex < passageQuestion.blanks.length - 1) {
        // Next passage blank
        setCurrentPassageBlankIndex(currentPassageBlankIndex + 1);
        setSelectedAnswer("");
        setShowResult(false);
      } else {
        // Quiz complete - calculate final score using QuizService
        setIsComplete(true);
        const scoreResult = quizService.calculateQuizScore(attempts);
        onComplete?.(scoreResult.score);
      }
    }
  };

  // Calculate progress based on current position
  const totalQuestions = 12;
  let currentQuestionNum = 0;
  if (currentSection === 'cloze') {
    currentQuestionNum = currentQuestionIndex + 1;
  } else {
    currentQuestionNum = 6 + currentPassageBlankIndex + 1;
  }
  const progress = (currentQuestionNum / totalQuestions) * 100;

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground dyslexia-text-base">🚀 Progressive Loading: Starting cloze questions...</p>
        </div>
      </div>
    );
  }

  if (clozeQuestions.length === 0 && !passageQuestion) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between p-6">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">Quiz</h1>
          <button
            onClick={onClose}
            className="p-2 text-foreground hover:text-muted-foreground transition-colors"
            data-testid="close-quiz"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-center">
            <p className="text-xl text-muted-foreground mb-6 dyslexia-text-lg">
              Unable to create quiz questions.
            </p>
            <Button
              onClick={onClose}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="close-quiz-button"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const scoreResult = quizService.calculateQuizScore(attempts);
    const { score, correctAnswers, totalQuestions } = scoreResult;
    
    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between p-6">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">Quiz Complete!</h1>
          <button
            onClick={onClose}
            className="p-2 text-foreground hover:text-muted-foreground transition-colors"
            data-testid="close-quiz"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-2xl">
            <div className="mb-8">
              {score >= 80 ? (
                <CheckCircle className="w-24 h-24 text-green-500 mx-auto mb-4" />
              ) : score >= 60 ? (
                <CheckCircle className="w-24 h-24 text-yellow-500 mx-auto mb-4" />
              ) : (
                <XCircle className="w-24 h-24 text-red-500 mx-auto mb-4" />
              )}
              
              <h2 className="text-4xl font-bold text-foreground mb-4 dyslexia-text-2xl">
                Your Score: {score}%
              </h2>
              
              <p className="text-xl text-muted-foreground mb-6 dyslexia-text-lg">
                You got {correctAnswers} out of {totalQuestions} questions correct!
              </p>
              
              {score >= 80 ? (
                <p className="text-lg text-green-600 font-medium dyslexia-text-base">
                  Excellent work! You really understand these words.
                </p>
              ) : score >= 60 ? (
                <p className="text-lg text-yellow-600 font-medium dyslexia-text-base">
                  Good job! Keep practicing to improve even more.
                </p>
              ) : (
                <p className="text-lg text-red-600 font-medium dyslexia-text-base">
                  Keep studying! Review the words and try again.
                </p>
              )}
            </div>
            
            <Button
              onClick={onClose}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg dyslexia-text-base"
              data-testid="finish-quiz"
            >
              Finish
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get current question based on section and index
  const getCurrentQuestion = () => {
    if (currentSection === 'cloze' && clozeQuestions.length > 0) {
      return clozeQuestions[currentQuestionIndex];
    } else if (currentSection === 'passage' && passageQuestion) {
      return passageQuestion.blanks[currentPassageBlankIndex];
    }
    return null;
  };

  const currentQuestion = getCurrentQuestion();

  // Main quiz display - one question at a time
  const quizHeader = (
    <header className="flex items-center justify-between p-6">
      <img 
        src={huggerLogo} 
        alt="Hugger Digital" 
        className="w-[100px] h-[100px] object-contain"
      />
      <h1 className="text-2xl font-bold text-foreground">Quiz</h1>
      <button
        onClick={onClose}
        className="p-2 text-foreground hover:text-muted-foreground transition-colors"
        data-testid="close-quiz"
      >
        <X className="w-6 h-6" />
      </button>
    </header>
  );

  const quizFooter = currentQuestion && (
    <div className="p-6 border-t border-border bg-background">
      <div className="flex flex-col items-center gap-4">
        {/* Action buttons */}
        <div className="flex justify-center gap-4">
          {!showResult ? (
            <Button
              onClick={handleSubmitAnswer}
              disabled={!selectedAnswer}
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-8 py-4 text-lg dyslexia-text-base"
              data-testid="submit-answer"
            >
              Submit Answer
            </Button>
          ) : (
            <Button
              onClick={handleNextQuestion}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg dyslexia-text-base"
              data-testid="next-question"
            >
              {currentQuestionNum < totalQuestions ? (
                <>
                  Next Question <ArrowRight className="ml-2 w-5 h-5" />
                </>
              ) : (
                "Finish Quiz"
              )}
            </Button>
          )}
        </div>

        {/* Result feedback - Fixed height to prevent UI jumping */}
        <div className="min-h-20 flex items-center justify-center" aria-live="polite" role="status" aria-atomic="true">
          {showResult && (
            <div className="p-4 rounded-lg">
              {selectedAnswer === (currentQuestion as any).correctAnswer ? (
                <p className="text-green-600 text-lg font-medium dyslexia-text-base" data-testid="feedback-correct">
                  ✓ Correct! Well done!
                </p>
              ) : (
                <p className="text-red-600 text-lg font-medium dyslexia-text-base" data-testid="feedback-incorrect">
                  ✗ The correct answer is "{(currentQuestion as any).correctAnswer}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      header={quizHeader}
      footer={quizFooter}
      contentRef={contentRef}
    >
      <div className="h-full">
        {/* Progress bar */}
        <div className="px-6 py-4">
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2 dyslexia-text-base">
            Question {currentQuestionNum} of {totalQuestions}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center px-6 py-8">
          <div className="max-w-4xl w-full text-center">
          {currentQuestion && (
            <>
              {/* Section 1: Cloze Questions */}
              {currentSection === 'cloze' && (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-foreground mb-6 dyslexia-text-xl">
                      Fill in the blank with the correct word:
                    </h2>
                    
                    <div className="bg-card border border-border rounded-lg p-6 mb-6">
                      <p className="text-xl text-foreground mb-4 leading-relaxed dyslexia-text-lg">
                        {(currentQuestion as ClozeQuizQuestion).sentence1}
                      </p>
                      <p className="text-xl text-foreground leading-relaxed dyslexia-text-lg">
                        {(currentQuestion as ClozeQuizQuestion).sentence2}
                      </p>
                    </div>
                  </div>

                  {/* Answer choices */}
                  {/* DEBUG: Log choices data */}
                  {console.log("🎯 QUIZ DEBUG - Current Question:", currentQuestion)}
                  {console.log("🎯 QUIZ DEBUG - Choices Array:", (currentQuestion as ClozeQuizQuestion).choices)}
                  {console.log("🎯 QUIZ DEBUG - Choices Length:", (currentQuestion as ClozeQuizQuestion).choices?.length)}
                  
                  {(currentQuestion as ClozeQuizQuestion).choices?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {(currentQuestion as ClozeQuizQuestion).choices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(choice)}
                        disabled={showResult}
                        className={`p-4 border-2 rounded-lg transition-all text-lg font-medium dyslexia-text-base ${
                          selectedAnswer === choice
                            ? showResult
                              ? choice === (currentQuestion as ClozeQuizQuestion).correctAnswer
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-red-500 bg-red-50 text-red-700"
                              : "border-primary bg-primary/10 text-primary"
                            : showResult && choice === (currentQuestion as ClozeQuizQuestion).correctAnswer
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-border bg-card hover:border-primary hover:bg-primary/5"
                        }`}
                        data-testid={`answer-choice-${index}`}
                      >
                        {choice}
                        {showResult && choice === (currentQuestion as ClozeQuizQuestion).correctAnswer && (
                          <CheckCircle className="inline ml-2 w-5 h-5" />
                        )}
                        {showResult && selectedAnswer === choice && choice !== (currentQuestion as ClozeQuizQuestion).correctAnswer && (
                          <XCircle className="inline ml-2 w-5 h-5" />
                        )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mb-8">
                      <p className="text-red-500 mb-4">🚨 DEBUG: No choices available! Rendering fallback text input.</p>
                      <input 
                        type="text"
                        value={selectedAnswer}
                        onChange={(e) => setSelectedAnswer(e.target.value)}
                        className="w-full max-w-md mx-auto p-4 border border-border rounded-lg text-lg"
                        placeholder="Type your answer..."
                        data-testid="fallback-text-input"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Section 2: Passage Questions */}
              {currentSection === 'passage' && passageQuestion && (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-foreground mb-6 dyslexia-text-xl">
                      Choose the best word for the passage:
                    </h2>
                    
                    {/* Show passage with current blank highlighted */}
                    <ScrollableSection maxHeight="300px" className="mb-6">
                      {passageQuestion.passage.title && (
                        <h3 className="text-xl font-bold text-foreground mb-4 dyslexia-text-lg">
                          {passageQuestion.passage.title}
                        </h3>
                      )}
                      <div className="text-lg text-foreground leading-relaxed dyslexia-text-base whitespace-pre-line">
                        {passageQuestion.passage.passageText}
                      </div>
                    </ScrollableSection>
                    
                    <p className="text-lg text-muted-foreground dyslexia-text-base mb-4">
                      Question {(currentQuestion as any).questionNumber}: Choose the word for blank ({(currentQuestion as any).blankNumber})
                    </p>
                  </div>

                  {/* Answer choices */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {(currentQuestion as any).choices.map((choice: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(choice)}
                        disabled={showResult}
                        className={`p-4 border-2 rounded-lg transition-all text-lg font-medium dyslexia-text-base ${
                          selectedAnswer === choice
                            ? showResult
                              ? choice === (currentQuestion as any).correctAnswer
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-red-500 bg-red-50 text-red-700"
                              : "border-primary bg-primary/10 text-primary"
                            : showResult && choice === (currentQuestion as any).correctAnswer
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-border bg-card hover:border-primary hover:bg-primary/5"
                        }`}
                        data-testid={`answer-choice-${index}`}
                      >
                        {choice}
                        {showResult && choice === (currentQuestion as any).correctAnswer && (
                          <CheckCircle className="inline ml-2 w-5 h-5" />
                        )}
                        {showResult && selectedAnswer === choice && choice !== (currentQuestion as any).correctAnswer && (
                          <XCircle className="inline ml-2 w-5 h-5" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}