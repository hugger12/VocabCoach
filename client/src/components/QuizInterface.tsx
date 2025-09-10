import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, ArrowRight } from "lucide-react";
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

  // Shared utility to process quiz data consistently
  const processQuizData = (clozeData: any, passageData: any) => {
    // Process cloze questions with proper choice construction
    const clozeQuestions: ClozeQuizQuestion[] = clozeData.questions.map((q: any, index: number) => ({
      ...q,
      questionType: 'cloze' as const,
      questionNumber: index + 1,
      // Build choices from correctAnswer + distractors, then shuffle
      choices: [q.correctAnswer, ...(q.distractors || [])].sort(() => Math.random() - 0.5)
    }));

    // Process passage question with proper data structure
    const passageQuestion: PassageQuizQuestion | null = passageData.blanks ? {
      questionType: 'passage' as const,
      passage: passageData.passage || passageData, // Handle both data shapes
      blanks: passageData.blanks
        .sort((a: any, b: any) => (a.blankNumber || 0) - (b.blankNumber || 0)) // Ensure proper ordering
        .map((blank: any) => ({
          ...blank,
          choices: [blank.correctAnswer, ...(blank.distractors || [])].sort(() => Math.random() - 0.5),
          questionNumber: blank.blankNumber || 7
        }))
    } : null;

    return { clozeQuestions, passageQuestion };
  };

  // Check for pre-generated quiz variants in localStorage
  const checkForPreGeneratedQuiz = (words: WordWithProgress[]) => {
    try {
      const wordIds = words.map(w => w.id).sort().join(',');
      
      // Look for available variants (1, 2, 3)
      for (let variant = 1; variant <= 3; variant++) {
        const cacheKey = `preGeneratedQuiz_${wordIds}_variant_${variant}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
          const preGenerated = JSON.parse(cached);
          
          // Check if cache is still valid (not too old)
          const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days for weekly vocab
          if (Date.now() - preGenerated.generatedAt < maxAge && preGenerated.ready) {
            console.log(`Found variant ${variant} cached quiz, checking word match...`);
            
            // Check if this cached quiz matches our current words
            const cachedWordIds = preGenerated.words.map((w: any) => w.id).sort().join(',');
            
            if (cachedWordIds === wordIds) {
              console.log(`🎯 Using variant ${variant} - consuming cache entry`);
              
              // Remove this variant from cache so next quiz uses a different one
              localStorage.removeItem(cacheKey);
              
              // Check how many variants remain
              const remainingVariants = [];
              for (let v = 1; v <= 3; v++) {
                const checkKey = `preGeneratedQuiz_${wordIds}_variant_${v}`;
                if (localStorage.getItem(checkKey)) {
                  remainingVariants.push(v);
                }
              }
              console.log(`📊 Remaining variants after consumption: [${remainingVariants.join(', ')}]`);
              
              return preGenerated;
            }
          } else {
            // Clean up expired cache
            localStorage.removeItem(cacheKey);
            console.log(`Cleaned up expired variant ${variant}`);
          }
        }
      }
      
      console.log("No valid quiz variants found in cache");
      return null;
    } catch (error) {
      console.log("Error checking for pre-generated quiz variants:", error);
      return null;
    }
  };

  const generateComprehensiveQuiz = async () => {
    try {
      setIsLoading(true);
      
      // Get listId from props or extract from first word as fallback
      const currentListId = listId || (words.length > 0 ? words[0].listId : null);
      
      if (!currentListId) {
        throw new Error("Unable to determine vocabulary list for quiz generation");
      }
      
      // Validate we have exactly 12 words
      if (words.length !== 12) {
        throw new Error(`Quiz requires exactly 12 words, but got ${words.length}`);
      }

      // Check for pre-generated quiz first
      const preGeneratedQuiz = checkForPreGeneratedQuiz(words);
      if (preGeneratedQuiz && preGeneratedQuiz.ready) {
        console.log("🚀 Using pre-generated quiz variant for instant loading!");
        console.log("Cache details:", {
          variant: preGeneratedQuiz.variant,
          clozeQuestions: preGeneratedQuiz.clozeData?.questions?.length || 0,
          passageBlanks: preGeneratedQuiz.passageData?.blanks?.length || 0,
          generatedAt: new Date(preGeneratedQuiz.generatedAt).toLocaleTimeString()
        });
        
        // Use the pre-generated data
        const { clozeData, passageData, words: shuffledWords } = preGeneratedQuiz;
        
        // Process cached data using same logic as fresh generation
        const processedData = processQuizData(clozeData, passageData);
        
        setClozeQuestions(processedData.clozeQuestions);
        setPassageQuestion(processedData.passageQuestion);
        setIsLoading(false);
        return;
      }

      console.log("⏳ No pre-generated quiz found, generating new quiz...");
      
      // Proper Fisher-Yates shuffle for unbiased randomization
      const shuffledWords = [...words];
      for (let i = shuffledWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
      }
      
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
      
      // Validate responses
      if (!clozeData.questions || clozeData.questions.length !== 6) {
        throw new Error(`Expected 6 cloze questions, got ${clozeData.questions?.length || 0}`);
      }
      
      if (!passageData.blanks || passageData.blanks.length !== 6) {
        throw new Error(`Expected 6 passage blanks, got ${passageData.blanks?.length || 0}`);
      }
      
      const allQuestions: QuizQuestion[] = [];
      
      // Store cloze questions (1-6)
      const clozeQs = clozeData.questions.map((q: any, index: number) => ({
        ...q,
        questionType: 'cloze' as const,
        questionNumber: index + 1,
        choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
      }));
      setClozeQuestions(clozeQs);
      console.log(`Generated ${clozeQs.length} cloze questions (1-6)`);
      
      // Store passage question (7-12) - Sort by blankNumber then force sequential numbering
      // This ensures questions display in reading order regardless of AI generation order
      const sortedBlanks = [...passageData.blanks].sort((a, b) => {
        const aNum = parseInt(String(a.blankNumber)) || 0;
        const bNum = parseInt(String(b.blankNumber)) || 0;
        return aNum - bNum;
      });
      const passageQ = {
        questionType: 'passage' as const,
        passage: passageData.passage,
        blanks: sortedBlanks.map((blank: any, index: number) => ({
          ...blank,
          questionNumber: 7 + index, // Force sequential 7-12 for display
          choices: [blank.correctAnswer, ...blank.distractors].sort(() => Math.random() - 0.5)
        }))
      };
      setPassageQuestion(passageQ);
      console.log(`Generated passage with ${passageQ.blanks.length} blanks (7-12)`);
      console.log(`Blank order: ${passageQ.blanks.map(b => b.questionNumber).join(', ')}`);
      console.log(`Total quiz questions: ${clozeQs.length + passageQ.blanks.length}`);
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
        // Quiz complete - use existing attempts (already added in handleSubmitAnswer)
        setIsComplete(true);
        const score = Math.round((attempts.filter(a => a.isCorrect).length) / attempts.length * 100);
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
    const totalQuestions = attempts.length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    
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

              {/* Result feedback - Fixed height to prevent UI jumping */}
              <div className="mt-6 min-h-20 flex items-center justify-center" aria-live="polite" role="status" aria-atomic="true">
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}