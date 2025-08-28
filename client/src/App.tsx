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
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading ? (
        // Show loading state while checking authentication
        <Route path="*">
          <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brown-600 mx-auto mb-4"></div>
              <p className="text-brown-600">Loading...</p>
            </div>
          </div>
        </Route>
      ) : isAuthenticated ? (
        // Authenticated instructor routes
        <>
          <Route path="/" component={InstructorDashboard} />
          <Route path="/instructor/*" component={InstructorDashboard} />
          <Route component={NotFound} />
        </>
      ) : (
        // Unauthenticated routes
        <>
          <Route path="/" component={Landing} />
          <Route path="/student-login" component={StudentLogin} />
          <Route path="/student/*" component={Home} />
          <Route component={NotFound} />
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
