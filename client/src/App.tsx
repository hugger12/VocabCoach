import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { Landing } from "@/pages/Landing";
import { StudentLogin } from "@/pages/StudentLogin";
import { InstructorDashboard } from "@/pages/InstructorDashboard";
import { Students } from "@/pages/instructor/Students";
import { Words } from "@/pages/instructor/Words";
import { Progress } from "@/pages/instructor/Progress";
import { StudentInterface } from "@/pages/StudentInterface";

import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading ? (
        // Show loading state while checking authentication
        <Route path="*">
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </Route>
      ) : isAuthenticated ? (
        // Authenticated instructor routes
        <>
          <Route path="/" component={InstructorDashboard} />
          <Route path="/instructor/students" component={Students} />
          <Route path="/instructor/words" component={Words} />
          <Route path="/instructor/progress" component={Progress} />
          <Route component={NotFound} />
        </>
      ) : (
        // Unauthenticated routes
        <>
          <Route path="/" component={Landing} />
          <Route path="/student-login" component={StudentLogin} />
          <Route path="/student" component={StudentInterface} />
          <Route path="/student/:rest*" component={StudentInterface} />
          <Route path="*" component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
