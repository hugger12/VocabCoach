import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, BarChart3, LogOut, Plus, UserPlus, FileText, PieChart } from "lucide-react";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";
import { Link } from "wouter";

export function InstructorDashboard() {
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="h-screen bg-background overflow-auto">
      {/* Header matching WordWizard style */}
      <header className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
            <p className="text-muted-foreground dyslexia-text-base">Instructor Dashboard</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <p className="font-semibold text-foreground dyslexia-text-lg">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="tap-target border-border text-foreground hover:bg-accent"
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="container mx-auto max-w-6xl p-6">
        {/* Main Dashboard Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {/* Students Card */}
          <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-accent rounded-xl">
                <Users className="h-8 w-8 text-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground dyslexia-text-xl">Students</h3>
                <p className="text-muted-foreground dyslexia-text-base">Manage student accounts and PINs</p>
              </div>
            </div>
            <Link href="/instructor/students">
              <Button className="w-full h-12 tap-target bg-primary text-primary-foreground hover:bg-primary/90 dyslexia-text-base">
                Manage Students
              </Button>
            </Link>
          </div>

          {/* Vocabulary Card */}
          <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-accent rounded-xl">
                <BookOpen className="h-8 w-8 text-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground dyslexia-text-xl">Vocabulary</h3>
                <p className="text-muted-foreground dyslexia-text-base">Add and manage weekly word lists</p>
              </div>
            </div>
            <Link href="/instructor/words">
              <Button className="w-full h-12 tap-target bg-primary text-primary-foreground hover:bg-primary/90 dyslexia-text-base">
                Manage Words
              </Button>
            </Link>
          </div>

          {/* Progress Card */}
          <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-accent rounded-xl">
                <BarChart3 className="h-8 w-8 text-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground dyslexia-text-xl">Progress</h3>
                <p className="text-muted-foreground dyslexia-text-base">Track student learning progress</p>
              </div>
            </div>
            <Link href="/instructor/progress">
              <Button className="w-full h-12 tap-target bg-primary text-primary-foreground hover:bg-primary/90 dyslexia-text-base">
                View Progress
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Actions Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-6 dyslexia-text-xl">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/instructor/words/add">
              <Button 
                variant="outline" 
                className="w-full h-16 tap-target border-border text-foreground hover:bg-accent generous-spacing dyslexia-text-base"
                data-testid="button-add-words"
              >
                <Plus className="mr-2 h-5 w-5" />
                Add New Words
              </Button>
            </Link>
            <Link href="/instructor/students/add">
              <Button 
                variant="outline" 
                className="w-full h-16 tap-target border-border text-foreground hover:bg-accent generous-spacing dyslexia-text-base"
                data-testid="button-add-student"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Add New Student
              </Button>
            </Link>
            <Link href="/instructor/quiz">
              <Button 
                variant="outline" 
                className="w-full h-16 tap-target border-border text-foreground hover:bg-accent generous-spacing dyslexia-text-base"
                data-testid="button-generate-quiz"
              >
                <FileText className="mr-2 h-5 w-5" />
                Generate Quiz
              </Button>
            </Link>
            <Link href="/instructor/reports">
              <Button 
                variant="outline" 
                className="w-full h-16 tap-target border-border text-foreground hover:bg-accent generous-spacing dyslexia-text-base"
                data-testid="button-view-reports"
              >
                <PieChart className="mr-2 h-5 w-5" />
                View Reports
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}