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
      {/* Header with Logo */}
      <header className="bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={huggerLogo} 
                alt="Hugger Digital" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-xl font-semibold text-foreground">Vocabulary Coach</h1>
                <p className="text-sm text-muted-foreground">Dyslexia-Friendly Learning</p>
              </div>
            </div>
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
