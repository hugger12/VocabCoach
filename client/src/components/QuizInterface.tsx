import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClozeQuestion, WordWithProgress } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export interface QuizInterfaceProps {
  words: WordWithProgress[];
  onClose: () => void;
  onComplete?: (score: number) => void;
}

interface QuizQuestion extends ClozeQuestion {
  choices: string[];
}

interface QuizAttempt {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
}

export function QuizInterface({ words, onClose, onComplete }: QuizInterfaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  // Generate quiz questions when component mounts
  useEffect(() => {
    generateQuiz();
  }, []);

  const generateQuiz = async () => {
    try {
      setIsLoading(true);
      
      // Generate cloze questions for the words
      const response = await fetch("/api/quiz/cloze/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          words: words.map(word => ({
            id: word.id,
            text: word.text,
            partOfSpeech: word.partOfSpeech,
            kidDefinition: word.kidDefinition,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate quiz");
      }

      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error("Error generating quiz:", error);
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
    if (!selectedAnswer || !questions[currentQuestionIndex]) return;

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    const attempt: QuizAttempt = {
      questionId: currentQuestion.id,
      selectedAnswer,
      isCorrect,
    };

    setAttempts([...attempts, attempt]);
    setShowResult(true);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer("");
      setShowResult(false);
    } else {
      // Quiz complete
      setIsComplete(true);
      const score = Math.round((attempts.filter(a => a.isCorrect).length / attempts.length) * 100);
      onComplete?.(score);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground dyslexia-text-base">Creating your quiz...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
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
    const score = Math.round((correctAnswers / attempts.length) * 100);
    
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
                You got {correctAnswers} out of {attempts.length} questions correct!
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

      {/* Progress bar */}
      <div className="px-6 pb-4">
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2 dyslexia-text-base">
          Question {currentQuestionIndex + 1} of {questions.length}
        </p>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="max-w-4xl w-full text-center">
          {currentQuestion && (
            <>
              {/* Question */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-6 dyslexia-text-xl">
                  Fill in the blank with the correct word:
                </h2>
                
                <div className="bg-card border border-border rounded-lg p-6 mb-6">
                  <p className="text-xl text-foreground mb-4 leading-relaxed dyslexia-text-lg">
                    {currentQuestion.sentence1}
                  </p>
                  <p className="text-xl text-foreground leading-relaxed dyslexia-text-lg">
                    {currentQuestion.sentence2}
                  </p>
                </div>
              </div>

              {/* Answer choices */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {currentQuestion.choices.map((choice, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(choice)}
                    disabled={showResult}
                    className={`p-4 border-2 rounded-lg transition-all text-lg font-medium dyslexia-text-base ${
                      selectedAnswer === choice
                        ? showResult
                          ? choice === currentQuestion.correctAnswer
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-red-500 bg-red-50 text-red-700"
                          : "border-primary bg-primary/10 text-primary"
                        : showResult && choice === currentQuestion.correctAnswer
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-border bg-card hover:border-primary hover:bg-primary/5"
                    }`}
                    data-testid={`answer-choice-${index}`}
                  >
                    {choice}
                    {showResult && choice === currentQuestion.correctAnswer && (
                      <CheckCircle className="inline ml-2 w-5 h-5" />
                    )}
                    {showResult && selectedAnswer === choice && choice !== currentQuestion.correctAnswer && (
                      <XCircle className="inline ml-2 w-5 h-5" />
                    )}
                  </button>
                ))}
              </div>

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
                    {currentQuestionIndex < questions.length - 1 ? (
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
                  {selectedAnswer === currentQuestion.correctAnswer ? (
                    <p className="text-green-600 text-lg font-medium dyslexia-text-base">
                      ✓ Correct! Well done!
                    </p>
                  ) : (
                    <p className="text-red-600 text-lg font-medium dyslexia-text-base">
                      ✗ The correct answer is "{currentQuestion.correctAnswer}"
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