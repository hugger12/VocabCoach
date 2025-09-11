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
  const [classCode, setClassCode] = useState("");
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

    if (!classCode.trim()) {
      toast({
        title: "Class Code Required",
        description: "Please enter your class code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // SECURITY: Send both class code (instructorId) and PIN for scoped authentication
      const response = await fetch("/api/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include session cookies
        body: JSON.stringify({ 
          pin, 
          instructorId: classCode.trim() 
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.student) {
        // SECURITY: Don't store sensitive data in localStorage - use server session
        // Remove PIN storage for security
        sessionStorage.setItem("studentLoggedIn", "true");
        
        // Redirect to student interface
        window.location.href = "/student";
      } else {
        throw new Error(data.message || "Login failed");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid class code or PIN. Please try again.",
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

  const handleClassCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClassCode(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && pin.length === 4 && classCode.trim()) {
      handleLogin();
    }
  };

  return (
    <div className="h-screen bg-background overflow-auto">
      <div className="container mx-auto max-w-md p-6 h-full flex flex-col">
        {/* Header */}
        <div className="text-center py-12">
          <img 
            src={logoImage} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain mx-auto mb-8"
          />
          <h1 className="text-3xl font-bold text-foreground mb-2 dyslexia-text-2xl">Student Login</h1>
          <p className="text-lg text-muted-foreground dyslexia-text-lg">Enter your class code and PIN</p>
        </div>

        {/* PIN Entry */}
        <Card className="bg-card border-border">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-foreground dyslexia-text-xl">Welcome Back!</CardTitle>
            <CardDescription className="text-muted-foreground dyslexia-text-base">
              Ask your teacher for your PIN if you forgot it
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Class Code</label>
                <Input
                  type="text"
                  value={classCode}
                  onChange={handleClassCodeChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter your class code"
                  className="text-center text-lg h-12 border-border bg-background"
                  data-testid="input-class-code"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">PIN</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={handlePinChange}
                  onKeyPress={handleKeyPress}
                  placeholder="0000"
                  className="text-center text-2xl font-mono tracking-widest h-16 border-border bg-background"
                  maxLength={4}
                  data-testid="input-student-pin"
                />
              </div>
            </div>

            <Button
              onClick={handleLogin}
              disabled={pin.length !== 4 || !classCode.trim() || isLoading}
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 h-12 tap-target dyslexia-text-base"
              data-testid="button-student-submit"
            >
              <LogIn className="mr-2 h-5 w-5" />
              {isLoading ? "Signing in..." : "Start Learning"}
            </Button>

            <Link href="/">
              <Button 
                variant="ghost" 
                className="w-full text-muted-foreground hover:text-foreground tap-target dyslexia-text-base"
                data-testid="button-back-home"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Help Text */}
        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground dyslexia-text-base mb-4">
            Need help? Ask your teacher for your class code and PIN.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">For testing:</p>
              <p className="font-mono text-sm text-foreground">Class: demo-instructor</p>
              <p className="font-mono text-sm text-foreground">PIN: 1234</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}