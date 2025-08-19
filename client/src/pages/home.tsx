import { useState } from "react";
import { StudyInterface } from "@/components/StudyInterface";
import { ParentDashboard } from "@/components/ParentDashboard";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export default function Home() {
  const [showParentDashboard, setShowParentDashboard] = useState(false);

  const handleParentAccess = () => {
    setShowParentDashboard(true);
  };

  const handleCloseDashboard = () => {
    setShowParentDashboard(false);
  };

  if (showParentDashboard) {
    return <ParentDashboard onClose={handleCloseDashboard} />;
  }

  return (
    <div className="relative min-h-screen">
      {/* Hero Header with Prominent Logo */}
      <header className="bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <img 
              src={huggerLogo} 
              alt="Hugger Digital" 
              className="h-24 w-auto mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-foreground mb-2">Vocabulary Coach</h1>
            <p className="text-lg text-muted-foreground">Dyslexia-Friendly Learning by Hugger Digital</p>
          </div>
        </div>
      </header>

      {/* Main Study Interface */}
      <StudyInterface onOpenParentDashboard={handleParentAccess} />

      {/* Line Tracker for Visual Tracking Support */}
      <div 
        id="line-tracker" 
        className="line-tracker hidden"
        aria-hidden="true"
      />
    </div>
  );
}
