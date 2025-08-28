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

export function QuizInterface({ words, onClose, onComplete }: QuizInterfaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentSection, setCurrentSection] = useState<'cloze' | 'passage'>('cloze');
  const [passageAnswers, setPassageAnswers] = useState<{ [key: number]: string }>({});
  const { toast } = useToast();

  // Generate comprehensive quiz when component mounts
  useEffect(() => {
    generateComprehensiveQuiz();
  }, []);

  const generateComprehensiveQuiz = async () => {
    try {
      setIsLoading(true);
      
      // Split words into two groups: first 6 for cloze, next 6 for passage
      const clozeWords = words.slice(0, 6);
      const passageWords = words.slice(6, 12);
      
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
            weekId: "2025-W34", // Use current week
          }),
        })
      ]);

      if (!clozeResponse.ok || !passageResponse.ok) {
        throw new Error("Failed to generate quiz questions");
      }

      const clozeData = await clozeResponse.json();
      const passageData = await passageResponse.json();
      
      const allQuestions: QuizQuestion[] = [];
      
      // Add cloze questions (1-6)
      if (clozeData.questions) {
        clozeData.questions.forEach((q: any, index: number) => {
          allQuestions.push({
            ...q,
            questionType: 'cloze',
            questionNumber: index + 1,
            choices: [q.correctAnswer, ...q.distractors].sort(() => Math.random() - 0.5)
          });
        });
      }
      
      // Add passage question (7-12)
      if (passageData.passage && passageData.blanks) {
        allQuestions.push({
          questionType: 'passage',
          passage: passageData.passage,
          blanks: passageData.blanks.map((blank: any, index: number) => ({
            ...blank,
            questionNumber: 7 + index,
            choices: [blank.correctAnswer, ...blank.distractors].sort(() => Math.random() - 0.5)
          }))
        });
      }
      
      setQuestions(allQuestions);
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

  const handleClozeAnswerSelect = (questionNumber: number, answer: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionNumber]: answer }));
  };

  const handlePassageAnswerSelect = (blankNumber: number, answer: string) => {
    setPassageAnswers(prev => ({ ...prev, [blankNumber]: answer }));
  };

  const handleSubmitSection = () => {
    const currentQuestion = questions[currentQuestionIndex];
    
    if (currentQuestion.questionType === 'cloze') {
      // Submit cloze questions (1-6)
      const clozeQuestions = questions.filter(q => q.questionType === 'cloze') as ClozeQuizQuestion[];
      
      clozeQuestions.forEach((question) => {
        const selectedAnswer = selectedAnswers[question.questionNumber];
        if (selectedAnswer) {
          const attempt: QuizAttempt = {
            questionId: question.id,
            questionNumber: question.questionNumber,
            selectedAnswer,
            correctAnswer: question.correctAnswer,
            isCorrect: selectedAnswer === question.correctAnswer,
          };
          setAttempts(prev => [...prev, attempt]);
        }
      });
      
      // Move to passage section
      setCurrentSection('passage');
      setCurrentQuestionIndex(questions.findIndex(q => q.questionType === 'passage'));
      setShowResult(false);
      
    } else if (currentQuestion.questionType === 'passage') {
      // Submit passage questions (7-12)
      const passageQuestion = currentQuestion;
      
      passageQuestion.blanks.forEach((blank) => {
        const selectedAnswer = passageAnswers[blank.blankNumber];
        if (selectedAnswer) {
          const attempt: QuizAttempt = {
            questionId: blank.id,
            questionNumber: blank.questionNumber,
            selectedAnswer,
            correctAnswer: blank.correctAnswer,
            isCorrect: selectedAnswer === blank.correctAnswer,
          };
          setAttempts(prev => [...prev, attempt]);
        }
      });
      
      // Quiz complete
      setIsComplete(true);
      setTimeout(() => {
        const totalQuestions = 12;
        const correctAnswers = attempts.filter(a => a.isCorrect).length + 
                             Object.values(passageAnswers).filter((answer, index) => 
                               answer === passageQuestion.blanks[index]?.correctAnswer).length;
        const score = Math.round((correctAnswers / totalQuestions) * 100);
        onComplete?.(score);
      }, 100);
    }
  };

  const isCurrentSectionComplete = () => {
    if (currentSection === 'cloze') {
      const clozeQuestions = questions.filter(q => q.questionType === 'cloze') as ClozeQuizQuestion[];
      return clozeQuestions.every(q => selectedAnswers[q.questionNumber]);
    } else {
      const passageQuestion = questions.find(q => q.questionType === 'passage') as PassageQuizQuestion;
      return passageQuestion ? passageQuestion.blanks.every(b => passageAnswers[b.blankNumber]) : false;
    }
  };

  const clozeQuestions = questions.filter(q => q.questionType === 'cloze') as ClozeQuizQuestion[];
  const passageQuestion = questions.find(q => q.questionType === 'passage') as PassageQuizQuestion;
  const progress = currentSection === 'cloze' ? 25 : 75; // Rough progress indicator

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

  // Render Section 1: Cloze Questions (1-6)
  if (currentSection === 'cloze') {
    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between p-6">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">Quiz - Section 1</h1>
          <button
            onClick={onClose}
            className="p-2 text-foreground hover:text-muted-foreground transition-colors"
            data-testid="close-quiz"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="px-6 pb-4">
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2 dyslexia-text-base">
            Section 1: Questions 1-6 (Sentence Completion)
          </p>
        </div>

        <main className="flex-1 flex flex-col px-6 py-8 overflow-auto">
          <div className="max-w-4xl w-full mx-auto">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4 dyslexia-text-xl">
                Choose the best word to complete each pair of sentences
              </h2>
            </div>

            <div className="space-y-8">
              {clozeQuestions.map((question) => (
                <div key={question.id} className="bg-card border border-border rounded-lg p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-4 dyslexia-text-base">
                      Question {question.questionNumber}
                    </h3>
                    <div className="space-y-3">
                      <p className="text-lg text-foreground leading-relaxed dyslexia-text-base">
                        {question.sentence1}
                      </p>
                      <p className="text-lg text-foreground leading-relaxed dyslexia-text-base">
                        {question.sentence2}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {question.choices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => handleClozeAnswerSelect(question.questionNumber, choice)}
                        className={`p-3 border-2 rounded-lg transition-all text-base font-medium dyslexia-text-base text-left ${
                          selectedAnswers[question.questionNumber] === choice
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:border-primary hover:bg-primary/5"
                        }`}
                        data-testid={`cloze-choice-${question.questionNumber}-${index}`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center mt-8">
              <Button
                onClick={handleSubmitSection}
                disabled={!isCurrentSectionComplete()}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-8 py-4 text-lg dyslexia-text-base"
                data-testid="submit-cloze-section"
              >
                Continue to Section 2 <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Render Section 2: Passage Questions (7-12)
  if (currentSection === 'passage' && passageQuestion) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <header className="flex items-center justify-between p-6">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">Quiz - Section 2</h1>
          <button
            onClick={onClose}
            className="p-2 text-foreground hover:text-muted-foreground transition-colors"
            data-testid="close-quiz"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="px-6 pb-4">
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2 dyslexia-text-base">
            Section 2: Questions 7-12 (Reading Passage)
          </p>
        </div>

        <main className="flex-1 flex flex-col px-6 py-8 overflow-auto">
          <div className="max-w-4xl w-full mx-auto">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4 dyslexia-text-xl">
                Read the passage and choose the best word for each blank
              </h2>
            </div>

            {/* Passage Text */}
            <div className="bg-card border border-border rounded-lg p-6 mb-8">
              {passageQuestion.passage.title && (
                <h3 className="text-xl font-bold text-foreground mb-4 text-center dyslexia-text-lg">
                  {passageQuestion.passage.title}
                </h3>
              )}
              <div className="text-lg text-foreground leading-relaxed dyslexia-text-base whitespace-pre-line">
                {passageQuestion.passage.passageText}
              </div>
            </div>

            {/* Blanks */}
            <div className="space-y-6">
              {passageQuestion.blanks.map((blank) => (
                <div key={blank.id} className="bg-card border border-border rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 dyslexia-text-base">
                    Question {blank.questionNumber}: Choose the word for blank ({blank.blankNumber})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {blank.choices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => handlePassageAnswerSelect(blank.blankNumber, choice)}
                        className={`p-3 border-2 rounded-lg transition-all text-base font-medium dyslexia-text-base text-left ${
                          passageAnswers[blank.blankNumber] === choice
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:border-primary hover:bg-primary/5"
                        }`}
                        data-testid={`passage-choice-${blank.blankNumber}-${index}`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center mt-8">
              <Button
                onClick={handleSubmitSection}
                disabled={!isCurrentSectionComplete()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg dyslexia-text-base"
                data-testid="submit-passage-section"
              >
                Finish Quiz
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}