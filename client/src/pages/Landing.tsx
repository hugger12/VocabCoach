import { Button } from "@/components/ui/button";
import { BookOpen, Users, UserCheck } from "lucide-react";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl p-6">
        {/* Header */}
        <div className="text-center py-12">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[120px] h-[120px] object-contain mx-auto mb-8"
          />
          <h1 className="text-4xl font-bold text-foreground mb-4 dyslexia-text-2xl">WordWizard</h1>
          <p className="text-xl text-muted-foreground dyslexia-text-lg">Smart vocabulary learning for every student</p>
        </div>

        {/* Mode Selection */}
        <div className="grid md:grid-cols-2 gap-12 max-w-3xl mx-auto">
          {/* Instructor Mode */}
          <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-shadow text-center">
            <div className="mx-auto mb-6 p-4 bg-accent rounded-xl w-fit">
              <Users className="h-10 w-10 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3 dyslexia-text-xl">Instructor</h2>
            <p className="text-muted-foreground mb-8 dyslexia-text-base">
              Create student accounts, manage words, track progress
            </p>
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="w-full h-14 tap-target bg-primary text-primary-foreground hover:bg-primary/90 dyslexia-text-base"
              data-testid="button-instructor-login"
            >
              <UserCheck className="mr-3 h-5 w-5" />
              Sign In as Instructor
            </Button>
          </div>

          {/* Student Mode */}
          <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-shadow text-center">
            <div className="mx-auto mb-6 p-4 bg-accent rounded-xl w-fit">
              <BookOpen className="h-10 w-10 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3 dyslexia-text-xl">Student</h2>
            <p className="text-muted-foreground mb-8 dyslexia-text-base">
              Practice vocabulary words and take quizzes
            </p>
            <Button 
              onClick={() => window.location.href = '/student-login'}
              className="w-full h-14 tap-target bg-secondary text-secondary-foreground hover:bg-secondary/90 dyslexia-text-base"
              data-testid="button-student-login"
            >
              <BookOpen className="mr-3 h-5 w-5" />
              Enter as Student
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Test PIN: <span className="font-mono font-semibold">1234</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-sm text-muted-foreground dyslexia-text-base">
            Designed for effective learning with accessible, engaging features
          </p>
        </div>
      </div>
    </div>
  );
}