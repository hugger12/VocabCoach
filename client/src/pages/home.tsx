import { useState } from "react";
import { StudyInterface } from "@/components/StudyInterface";
import { ParentDashboard } from "@/components/ParentDashboard";
import { Settings } from "lucide-react";
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
    <div className="relative min-h-screen bg-background">
      {/* Simple Settings Button */}
      <button
        onClick={handleParentAccess}
        className="absolute top-6 right-6 p-3 text-muted-foreground hover:text-foreground transition-colors z-10"
        data-testid="parent-access"
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* Centered Logo and Title */}
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-16">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="h-20 w-auto mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-foreground">WordWizard</h1>
        </div>

        {/* Study Interface */}
        <StudyInterface onOpenParentDashboard={handleParentAccess} />
      </div>
    </div>
  );
}
