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
  const [showQuiz, setShowQuiz] = useState(() => localStorage.getItem('activeQuiz') === 'true');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // SECURITY: Use server session instead of localStorage
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/student/session", {
          credentials: "include"
        });
        
        if (response.ok) {
          const data = await response.json();
          setStudent(data.student);
        } else {
          // Not authenticated, redirect to login
          window.location.href = "/student-login";
        }
      } catch (error) {
        console.error("Error checking student authentication:", error);
        window.location.href = "/student-login";
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      // SECURITY: Server-side logout with session cleanup
      await fetch("/api/student/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear any client-side session data
      sessionStorage.removeItem("studentLoggedIn");
      window.location.href = "/";
    }
  };

  // Fetch current vocabulary list - now using secure session-based auth
  const { data: currentList } = useQuery({
    queryKey: ["/api/vocabulary-lists/current"],
    queryFn: async () => {
      // SECURITY: Removed insecure Authorization header - now using server session auth
      const response = await fetch("/api/vocabulary-lists/current", {
        credentials: 'include' // Include session cookies for authentication
      });
      if (!response.ok) return null; // No current list
      return response.json();
    },
    enabled: !!student,
  });

  // Fetch study session data for quiz purposes - now secure with caching for persistence
  const { data: session, isLoading: sessionLoading } = useQuery<StudySession>({
    queryKey: ["/api/study/session", "quiz"],
    queryFn: async () => {
      // SECURITY: Removed instructor query parameter spoofing - now using server session auth
      const response = await fetch(`/api/study/session?quiz=true`, {
        credentials: 'include' // Include session cookies for authentication
      });
      if (!response.ok) throw new Error("Failed to fetch session");
      return response.json();
    },
    enabled: showQuiz && !!student, // Only fetch when quiz is needed and student is authenticated
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - prevents refetch on refresh
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (renamed from cacheTime in v5)
  });

  const handleStartStudy = () => {
    setShowStudy(true);
  };

  const handleStartQuiz = () => {
    localStorage.setItem('activeQuiz', 'true');
    setShowQuiz(true);
  };

  const handleCloseStudy = () => {
    setShowStudy(false);
  };

  const handleCloseQuiz = () => {
    localStorage.removeItem('activeQuiz');
    setShowQuiz(false);
  };

  const handleQuizComplete = (score: number) => {
    console.log("Quiz completed with score:", score);
    // Could save score or show additional feedback here
  };

  if (loading || !student) {
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
    // SECURITY: Remove instructor ID prop - StudyInterface will use server session auth
    return <StudyInterface onClose={handleCloseStudy} />;
  }

  if (showQuiz) {
    // React Query caching means session will be available instantly on refresh
    if (sessionLoading || !session?.words) {
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
        listId={currentList?.id}
      />
    );
  }

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
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

      <div className="flex-1 overflow-y-auto">
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
    </div>
  );
}