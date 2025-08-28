import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, UserCheck } from "lucide-react";
import logoImage from "@assets/Hugger-Digital_logo_1755580645400.png";

export function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center py-8">
          <img 
            src={logoImage} 
            alt="Hugger Digital" 
            className="h-16 mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-brown-800 mb-2">WordWizard</h1>
          <p className="text-lg text-brown-600">Dyslexia-friendly vocabulary learning</p>
        </div>

        {/* Mode Selection */}
        <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          {/* Instructor Mode */}
          <Card className="hover:shadow-lg transition-shadow border-brown-200">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-brown-100 rounded-full w-fit">
                <Users className="h-8 w-8 text-brown-600" />
              </div>
              <CardTitle className="text-xl text-brown-800">Instructor</CardTitle>
              <CardDescription className="text-brown-600">
                Create student accounts, manage words, track progress
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full bg-brown-600 hover:bg-brown-700 text-white"
                data-testid="button-instructor-login"
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Sign In as Instructor
              </Button>
            </CardContent>
          </Card>

          {/* Student Mode */}
          <Card className="hover:shadow-lg transition-shadow border-brown-200">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-brown-100 rounded-full w-fit">
                <BookOpen className="h-8 w-8 text-brown-600" />
              </div>
              <CardTitle className="text-xl text-brown-800">Student</CardTitle>
              <CardDescription className="text-brown-600">
                Practice vocabulary words and take quizzes
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={() => window.location.href = '/student-login'}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-student-login"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Enter as Student
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-brown-500">
          <p className="text-sm">
            Built for 2e learners with dyslexia-friendly design principles
          </p>
        </div>
      </div>
    </div>
  );
}