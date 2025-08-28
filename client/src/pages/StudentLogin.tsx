import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/Hugger-Digital_logo_1755580645400.png";
import { Link } from "wouter";

export function StudentLogin() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async () => {
    if (pin.length !== 4) {
      toast({
        title: "Invalid PIN",
        description: "Please enter a 4-digit PIN",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // For now, we'll use a default instructor ID
      // In a real implementation, you might have a school code or instructor selection
      const response = await fetch("/api/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, instructorId: "default" }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.student) {
        // Store student info in localStorage for the session
        localStorage.setItem("currentStudent", JSON.stringify(data.student));
        
        // Redirect to student interface
        window.location.href = "/student";
      } else {
        throw new Error(data.message || "Login failed");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid PIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(value);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && pin.length === 4) {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="container mx-auto max-w-md">
        {/* Header */}
        <div className="text-center py-8">
          <img 
            src={logoImage} 
            alt="Hugger Digital" 
            className="h-16 mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-green-800 mb-2">Student Login</h1>
          <p className="text-lg text-green-600">Enter your 4-digit PIN</p>
        </div>

        {/* PIN Entry */}
        <Card className="border-green-200">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-green-800">Welcome Back!</CardTitle>
            <CardDescription className="text-green-600">
              Ask your teacher for your PIN if you forgot it
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={handlePinChange}
                onKeyPress={handleKeyPress}
                placeholder="0000"
                className="text-center text-2xl font-mono tracking-widest h-16 border-green-300"
                maxLength={4}
                data-testid="input-student-pin"
              />
            </div>

            <Button
              onClick={handleLogin}
              disabled={pin.length !== 4 || isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12"
              data-testid="button-student-submit"
            >
              <LogIn className="mr-2 h-5 w-5" />
              {isLoading ? "Signing in..." : "Start Learning"}
            </Button>

            <Link href="/">
              <Button 
                variant="ghost" 
                className="w-full text-green-600 hover:text-green-800"
                data-testid="button-back-home"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Help Text */}
        <div className="text-center mt-8 text-green-600">
          <p className="text-sm">
            Need help? Ask your teacher or parent for your PIN.
          </p>
        </div>
      </div>
    </div>
  );
}