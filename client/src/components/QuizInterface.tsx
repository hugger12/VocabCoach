import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, ArrowRight, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClozeQuestion, PassageQuestion, PassageBlank, WordWithProgress } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export interface QuizInterfaceProps {
  words: WordWithProgress[];
  onClose: () => void;
  onComplete?: (score: number) => void;
  instructorId?: string;
  listId?: string;
}

interface ClozeQuizQuestion extends ClozeQuestion {
  choices: string[];
  questionType: 'cloze';
  questionNumber: number;
}

interface PassageQuizQuestion {
  questionType: 'passage';
  passage: PassageQuestion;
  blanks: (PassageBlank & { choices: string[]; questionNumber: number })[];
}

type QuizQuestion = ClozeQuizQuestion | PassageQuizQuestion;

interface QuizAttempt {
  questionId: string;
  questionNumber: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export function QuizInterface({ words, onClose, onComplete, instructorId, listId }: QuizInterfaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentSection, setCurrentSection] = useState<'cloze' | 'passage'>('cloze');
  const [clozeQuestions, setClozeQuestions] = useState<ClozeQuizQuestion[]>([]);
  const [passageQuestion, setPassageQuestion] = useState<PassageQuizQuestion | null>(null);
  const [currentPassageBlankIndex, setCurrentPassageBlankIndex] = useState(0);
  const { toast } = useToast();

  // Generate comprehensive quiz when component mounts
  useEffect(() => {
    generateComprehensiveQuiz();
  }, []);

  const generateComprehensiveQuiz = async () => {
    try {
      setIsLoading(true);
      
      // Get listId from props or extract from first word as fallback
      const currentListId = listId || (words.length > 0 ? words[0].listId : null);
      
      if (!currentListId) {
        throw new Error("Unable to determine vocabulary list for quiz generation");
      }
      
      // Randomize word order each time to prevent memorization patterns
      const shuffledWords = [...words].sort(() => Math.random() - 0.5);
      
      // Split shuffled words into two groups: first 6 for cloze, next 6 for passage
      const clozeWords = shuffledWords.slice(0, 6);
      const passageWords = shuffledWords.slice(6, 12);
      
      // Generate both cloze and passage questions
      const [clozeResponse, passageResponse] = await Promise.all([
        // Generate cloze questions (questions 1-6)
        fetch("/api/quiz/cloze/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: clozeWords.map(word => ({
              id: word.id,
              text: word.text,
              partOfSpeech: word.partOfSpeech,
              kidDefinition: word.kidDefinition,
            })),
          }),
        }),
        
        // Generate passage questions (questions 7-12)
        fetch("/api/quiz/passage/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: passageWords.map(word => ({
              id: word.id,
              text: word.text,
              partOfSpeech: word.partOfSpeech,
              kidDefinition: word.kidDefinition,
            })),
            listId: currentListId, // Use current vocabulary list
          }),
        })
      ]);

      if (!clozeResponse.ok || !passageResponse.ok) {
        throw new Error("Failed to generate quiz questions");
      }

      const clozeData = await clozeResponse.json();
      const passageData = await passageResponse.json();
      
      const allQuestions: QuizQuestion[] = [];
      
      // Store cloze questions (1-6)
      if (clozeData.questions) {
        const clozeQs = clozeData.questions.map((q: any, index: number) => ({
          ...q,
          questionType: 'cloze' as const,
          questionNumber: index + 1,
          choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
        }));
        setClozeQuestions(clozeQs);
      }
      
      // Store passage question (7-12)
      if (passageData.passage && passageData.blanks) {
        const passageQ = {
          questionType: 'passage' as const,
          passage: passageData.passage,
          blanks: passageData.blanks.map((blank: any, index: number) => ({
            ...blank,
            questionNumber: 7 + index,
            choices: [blank.correctAnswer, ...blank.distractors].sort(() => Math.random() - 0.5)
          }))
        };
        setPassageQuestion(passageQ);
      }
    } catch (error) {
      console.error("Error generating comprehensive quiz:", error);
      toast({
        title: "Quiz Error",
        description: "Could not generate quiz questions. Please try again.",
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
        // Move to passage section
        setCurrentSection('passage');
        setCurrentQuestionIndex(0);
        setCurrentPassageBlankIndex(0);
        setSelectedAnswer("");
        setShowResult(false);
      }
    } else if (currentSection === 'passage' && passageQuestion) {
      if (currentPassageBlankIndex < passageQuestion.blanks.length - 1) {
        // Next passage blank
        setCurrentPassageBlankIndex(currentPassageBlankIndex + 1);
        setSelectedAnswer("");
        setShowResult(false);
      } else {
        // Quiz complete
        setIsComplete(true);
        const score = Math.round((attempts.filter(a => a.isCorrect).length + 1) / 12 * 100);
        onComplete?.(score);
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
          <p className="text-muted-foreground dyslexia-text-base">Creating your comprehensive quiz...</p>
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
    const correctAnswers = attempts.filter(a => a.isCorrect).length;
    const score = Math.round((correctAnswers / 12) * 100); // Total 12 questions
    
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
                You got {correctAnswers} out of 12 questions correct!
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
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="flex items-center justify-between p-6 flex-shrink-0">
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

      {/* Progress bar */}
      <div className="px-6 pb-4 flex-shrink-0">
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

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto min-h-0">
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
                    <div className="bg-card border border-border rounded-lg p-6 mb-6">
                      {passageQuestion.passage.title && (
                        <h3 className="text-xl font-bold text-foreground mb-4 dyslexia-text-lg">
                          {passageQuestion.passage.title}
                        </h3>
                      )}
                      <div className="text-lg text-foreground leading-relaxed dyslexia-text-base whitespace-pre-line">
                        {passageQuestion.passage.passageText}
                      </div>
                    </div>
                    
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

              {/* Result feedback */}
              {showResult && (
                <div className="mt-6 p-4 rounded-lg">
                  {selectedAnswer === (currentQuestion as any).correctAnswer ? (
                    <p className="text-green-600 text-lg font-medium dyslexia-text-base">
                      ✓ Correct! Well done!
                    </p>
                  ) : (
                    <p className="text-red-600 text-lg font-medium dyslexia-text-base">
                      ✗ The correct answer is "{(currentQuestion as any).correctAnswer}"
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}