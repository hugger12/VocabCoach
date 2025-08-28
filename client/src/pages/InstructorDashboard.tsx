import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Settings, LogOut } from "lucide-react";
import logoImage from "@assets/Hugger-Digital_logo_1755580645400.png";
import { Link } from "wouter";

export function InstructorDashboard() {
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 p-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between py-6 border-b border-brown-200">
          <div className="flex items-center gap-4">
            <img 
              src={logoImage} 
              alt="Hugger Digital" 
              className="h-12"
            />
            <div>
              <h1 className="text-2xl font-bold text-brown-800">WordWizard</h1>
              <p className="text-brown-600">Instructor Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-brown-600">Welcome back,</p>
              <p className="font-semibold text-brown-800">
                {(user as any)?.firstName} {(user as any)?.lastName}
              </p>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-brown-300 text-brown-700 hover:bg-brown-50"
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Dashboard Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          {/* Student Management */}
          <Card className="hover:shadow-lg transition-shadow border-brown-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg text-brown-800">Students</CardTitle>
                  <CardDescription className="text-brown-600">
                    Manage student accounts and PINs
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/instructor/students">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Manage Students
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Word Management */}
          <Card className="hover:shadow-lg transition-shadow border-brown-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <BookOpen className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-lg text-brown-800">Vocabulary</CardTitle>
                  <CardDescription className="text-brown-600">
                    Add and manage weekly word lists
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/instructor/words">
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  Manage Words
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Progress & Reports */}
          <Card className="hover:shadow-lg transition-shadow border-brown-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Settings className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg text-brown-800">Progress</CardTitle>
                  <CardDescription className="text-brown-600">
                    Track student learning progress
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/instructor/progress">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                  View Progress
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-brown-800 mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/instructor/words/add">
              <Button 
                variant="outline" 
                className="w-full h-16 border-brown-300 text-brown-700 hover:bg-brown-50"
              >
                Add New Words
              </Button>
            </Link>
            <Link href="/instructor/students/add">
              <Button 
                variant="outline" 
                className="w-full h-16 border-brown-300 text-brown-700 hover:bg-brown-50"
              >
                Add New Student
              </Button>
            </Link>
            <Link href="/instructor/quiz">
              <Button 
                variant="outline" 
                className="w-full h-16 border-brown-300 text-brown-700 hover:bg-brown-50"
              >
                Generate Quiz
              </Button>
            </Link>
            <Link href="/instructor/reports">
              <Button 
                variant="outline" 
                className="w-full h-16 border-brown-300 text-brown-700 hover:bg-brown-50"
              >
                View Reports
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}