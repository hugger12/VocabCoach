import { useState, useEffect } from "react";
import { StudyInterface } from "@/components/StudyInterface";
import { QuizInterface } from "@/components/QuizInterface";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";
import type { StudySession } from "@shared/schema";

interface StudentData {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  pin: string;
  instructorId: string;
  grade?: number;
  isActive: boolean;
}

export function StudentInterface() {
  const [student, setStudent] = useState<StudentData | null>(null);
  const [showStudy, setShowStudy] = useState(false); // Show welcome screen first
  const [showQuiz, setShowQuiz] = useState(false);

  useEffect(() => {
    // Get student data from localStorage
    const savedStudent = localStorage.getItem("currentStudent");
    if (savedStudent) {
      try {
        setStudent(JSON.parse(savedStudent));
      } catch (error) {
        console.error("Error parsing student data:", error);
        // Redirect back to login if data is corrupted
        window.location.href = "/student-login";
      }
    } else {
      // No student data, redirect to login
      window.location.href = "/student-login";
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("currentStudent");
    window.location.href = "/";
  };

  // Fetch study session data for quiz purposes
  const { data: session } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: showQuiz, // Only fetch when quiz is needed
  });

  const handleStartStudy = () => {
    setShowStudy(true);
  };

  const handleStartQuiz = () => {
    setShowQuiz(true);
  };

  const handleCloseStudy = () => {
    setShowStudy(false);
  };

  const handleCloseQuiz = () => {
    setShowQuiz(false);
  };

  const handleQuizComplete = (score: number) => {
    console.log("Quiz completed with score:", score);
    // Could save score or show additional feedback here
  };

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (showStudy) {
    return <StudyInterface onClose={handleCloseStudy} />;
  }

  if (showQuiz) {
    if (!session?.words) {
      return (
        <div className="h-screen bg-background flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground dyslexia-text-base">Preparing your quiz...</p>
          </div>
        </div>
      );
    }
    
    return (
      <QuizInterface 
        words={session.words}
        onClose={handleCloseQuiz}
        onComplete={handleQuizComplete}
      />
    );
  }

  return (
    <div className="h-screen bg-background overflow-auto">
      {/* Header */}
      <header className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
            <p className="text-muted-foreground dyslexia-text-base">
              Welcome, {student.displayName || student.firstName}!
            </p>
          </div>
        </div>
        
        <Button
          onClick={handleLogout}
          variant="outline"
          className="tap-target border-border text-foreground hover:bg-accent"
          data-testid="button-student-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </header>

      <div className="container mx-auto max-w-4xl p-6">
        {/* Welcome Section */}
        <div className="text-center py-12">
          <h2 className="text-3xl font-bold text-foreground mb-4 dyslexia-text-2xl">
            Ready to Learn?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 dyslexia-text-lg">
            Let's practice your vocabulary words!
          </p>
          
          <div className="bg-card border border-border rounded-xl p-8 max-w-md mx-auto">
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-2">Logged in as:</p>
              <p className="text-lg font-bold text-foreground dyslexia-text-lg">
                {student.displayName || `${student.firstName} ${student.lastName}`}
              </p>
              {student.grade && (
                <p className="text-sm text-muted-foreground">Grade {student.grade}</p>
              )}
            </div>
            
            <div className="space-y-4">
              <Button
                onClick={handleStartStudy}
                className="w-full h-14 tap-target bg-secondary text-secondary-foreground hover:bg-secondary/90 dyslexia-text-lg flex items-center justify-center gap-3"
                data-testid="button-practice-words"
              >
                <BookOpen className="w-6 h-6" />
                Practice Words
              </Button>
              
              <Button
                onClick={handleStartQuiz}
                className="w-full h-14 tap-target bg-primary text-primary-foreground hover:bg-primary/90 dyslexia-text-lg flex items-center justify-center gap-3"
                data-testid="button-take-quiz"
              >
                <Trophy className="w-6 h-6" />
                Take Quiz
              </Button>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}