import { useState } from "react";
import { StudyInterface } from "@/components/StudyInterface";
import { ParentDashboard } from "@/components/ParentDashboard";
import { useTheme } from "@/components/ThemeProvider";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";
import { Moon, Sun, Contrast } from "lucide-react";

export default function Home() {
  const [showParentDashboard, setShowParentDashboard] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [pin, setPIN] = useState("");
  const { theme, toggleTheme } = useTheme();

  const PARENT_PIN = "1234"; // In a real app, this would be configurable

  const handleParentAccess = () => {
    setShowPINModal(true);
  };

  const handlePINSubmit = () => {
    if (pin === PARENT_PIN) {
      setShowPINModal(false);
      setShowParentDashboard(true);
      setPIN("");
    } else {
      alert("Incorrect PIN. Please try again.");
      setPIN("");
    }
  };

  const handleCloseDashboard = () => {
    setShowParentDashboard(false);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "dark":
        return <Sun className="w-5 h-5" />;
      case "high-contrast":
        return <Moon className="w-5 h-5" />;
      default:
        return <Contrast className="w-5 h-5" />;
    }
  };

  if (showParentDashboard) {
    return <ParentDashboard onClose={handleCloseDashboard} />;
  }

  return (
    <div className="relative min-h-screen">
      {/* Theme Toggle */}
      <div className="fixed top-4 right-4 z-50 no-print">
        <DyslexiaButton
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="w-12 h-12 rounded-full shadow-lg"
          aria-label={`Switch to ${theme === "light" ? "dark" : theme === "dark" ? "high contrast" : "light"} theme`}
          data-testid="theme-toggle"
        >
          {getThemeIcon()}
        </DyslexiaButton>
      </div>

      {/* Main Study Interface */}
      <StudyInterface onOpenParentDashboard={handleParentAccess} />

      {/* PIN Modal */}
      {showPINModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-dyslexia-xl font-semibold text-foreground text-center mb-6">
              Parent Access
            </h2>
            <p className="text-dyslexia-base text-muted-foreground text-center mb-6">
              Enter your PIN to access the dashboard
            </p>
            
            <div className="flex justify-center space-x-2 mb-6">
              {[0, 1, 2, 3].map((index) => (
                <input
                  key={index}
                  type="password"
                  maxLength={1}
                  value={pin[index] || ""}
                  onChange={(e) => {
                    const newPIN = pin.split("");
                    newPIN[index] = e.target.value;
                    setPIN(newPIN.join(""));
                    
                    // Auto-focus next input
                    if (e.target.value && index < 3) {
                      const target = e.target as HTMLInputElement;
                      const nextInput = target.parentElement?.children[index + 1] as HTMLInputElement;
                      nextInput?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    // Handle backspace
                    if (e.key === "Backspace" && !pin[index] && index > 0) {
                      const target = e.target as HTMLInputElement;
                      const prevInput = target.parentElement?.children[index - 1] as HTMLInputElement;
                      prevInput?.focus();
                    }
                  }}
                  className="w-12 h-12 text-center text-2xl font-bold border-2 border-border rounded-lg bg-background text-foreground focus:border-primary focus:outline-none"
                  data-testid={`pin-input-${index}`}
                />
              ))}
            </div>
            
            <div className="flex space-x-4">
              <DyslexiaButton
                variant="outline"
                onClick={() => {
                  setShowPINModal(false);
                  setPIN("");
                }}
                className="flex-1"
                data-testid="cancel-pin"
              >
                Cancel
              </DyslexiaButton>
              <DyslexiaButton
                onClick={handlePINSubmit}
                disabled={pin.length !== 4}
                className="flex-1"
                data-testid="verify-pin"
              >
                Enter
              </DyslexiaButton>
            </div>
          </div>
        </div>
      )}

      {/* Line Tracker for Visual Tracking Support */}
      <div 
        id="line-tracker" 
        className="line-tracker hidden"
        aria-hidden="true"
      />
    </div>
  );
}
