import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ArrowLeft, Users, BookOpen, Target, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

interface ProgressData {
  totalStudents: number;
  totalWords: number;
  totalAttempts: number;
  averageScore: number;
  studentProgress: Array<{
    studentId: string;
    studentName: string;
    wordsStudied: number;
    accuracy: number;
    lastActivity: string;
  }>;
  weeklyProgress: Array<{
    week: string;
    attempts: number;
    accuracy: number;
  }>;
}

export function Progress() {
  // Fetch progress data
  const { data: progress, isLoading } = useQuery<ProgressData>({
    queryKey: ["/api/progress"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading progress data...</p>
        </div>
      </div>
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
            <p className="text-muted-foreground dyslexia-text-base">Progress & Analytics</p>
          </div>
        </div>
        
        <Link href="/">
          <Button 
            variant="outline" 
            className="tap-target border-border text-foreground hover:bg-accent"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </header>

      <div className="container mx-auto max-w-6xl p-6">
        {/* Header Section */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-accent rounded-xl">
            <BarChart3 className="h-8 w-8 text-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground dyslexia-text-xl">Progress Overview</h2>
            <p className="text-muted-foreground dyslexia-text-base">
              Track your students' learning progress
            </p>
          </div>
        </div>

        {progress ? (
          <>
            {/* Overview Stats */}
            <div className="grid md:grid-cols-4 gap-6 mb-8">
              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{progress.totalStudents}</p>
                      <p className="text-sm text-muted-foreground">Total Students</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <BookOpen className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{progress.totalWords}</p>
                      <p className="text-sm text-muted-foreground">Vocabulary Words</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <Target className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{progress.totalAttempts}</p>
                      <p className="text-sm text-muted-foreground">Total Attempts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-100 rounded-lg">
                      <TrendingUp className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{Math.round(progress.averageScore)}%</p>
                      <p className="text-sm text-muted-foreground">Average Score</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Student Progress */}
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground dyslexia-text-lg">Student Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  {progress.studentProgress && progress.studentProgress.length > 0 ? (
                    <div className="space-y-4">
                      {progress.studentProgress.map((student, index) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-background rounded-lg">
                          <div>
                            <h4 className="font-semibold text-foreground">{student.studentName}</h4>
                            <p className="text-sm text-muted-foreground">
                              {student.wordsStudied} words studied
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">{Math.round(student.accuracy)}%</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(student.lastActivity).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No student progress data available yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground dyslexia-text-lg">Weekly Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  {progress.weeklyProgress && progress.weeklyProgress.length > 0 ? (
                    <div className="space-y-4">
                      {progress.weeklyProgress.map((week, index) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-background rounded-lg">
                          <div>
                            <h4 className="font-semibold text-foreground">Week {week.week}</h4>
                            <p className="text-sm text-muted-foreground">
                              {week.attempts} attempts
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">{Math.round(week.accuracy)}%</p>
                            <p className="text-xs text-muted-foreground">accuracy</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No weekly progress data available yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Progress Data</h3>
            <p className="text-muted-foreground mb-6">
              Progress data will appear once students start practicing vocabulary.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/instructor/students">
                <Button variant="outline">Add Students</Button>
              </Link>
              <Link href="/instructor/words">
                <Button>Add Words</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}