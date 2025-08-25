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
      {/* Study Interface (includes home screen when not started) */}
      <StudyInterface onOpenParentDashboard={handleParentAccess} />
    </div>
  );
}
