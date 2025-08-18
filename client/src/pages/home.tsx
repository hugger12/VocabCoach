import { useState } from "react";
import { StudyInterface } from "@/components/StudyInterface";
import { ParentDashboard } from "@/components/ParentDashboard";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";

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
