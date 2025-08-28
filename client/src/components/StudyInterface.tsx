import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { stopAllAudio } from "@/lib/audioManager";
import type { WordWithProgress, StudySession } from "@shared/schema";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

export interface StudyInterfaceProps {
  onClose: () => void;
}

// Simple header component
const StudyHeader = ({ onClose }: { onClose: () => void }) => (
  <header className="flex items-center justify-between p-6">
    <img 
      src={huggerLogo} 
      alt="Hugger Digital" 
      className="w-[100px] h-[100px] object-contain"
    />
    <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
    <button
      onClick={onClose}
      className="p-2 text-foreground hover:text-muted-foreground transition-colors"
      data-testid="close-session"
    >
      <X className="w-6 h-6" />
    </button>
  </header>
);

export function StudyInterface({ onClose }: StudyInterfaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionWords, setSessionWords] = useState<WordWithProgress[]>([]);
  const [totalSessionWords, setTotalSessionWords] = useState(0);

  // Fetch study session
  const { data: session, isLoading, error } = useQuery<StudySession>({
    queryKey: ["/api/study/session"],
    enabled: !sessionComplete,
  });

  // Store session words when first loaded
  useEffect(() => {
    if (session?.words && sessionWords.length === 0) {
      setSessionWords([...session.words]);
      setTotalSessionWords(session.totalWords);
    }
  }, [session?.words, sessionWords.length, session?.totalWords]);

  // Stop audio when word changes or component unmounts
  useEffect(() => {
    return () => {
      stopAllAudio(); // Cleanup on unmount
    };
  }, []);

  // Stop audio when currentIndex changes (word changes)
  useEffect(() => {
    stopAllAudio();
  }, [currentIndex]);

  const currentWord = sessionWords[currentIndex];
  const totalWords = totalSessionWords || sessionWords.length || 0;

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your words...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading study session</p>
          <button
            onClick={onClose}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-6 py-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <StudyHeader onClose={onClose} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-foreground mb-8">Great job!</h2>
            <p className="text-xl text-muted-foreground mb-8">
              You've reviewed all {totalWords} words.
            </p>
            <button
              onClick={onClose}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-8 py-4 text-lg font-medium transition-all"
              data-testid="finish-session"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main word display - shows everything on one screen like original
  return (
    <div className="h-screen bg-background flex flex-col">
      <StudyHeader onClose={onClose} />
      
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center flex-1 flex flex-col justify-center max-w-2xl">
          
          {/* Word Display */}
          <h2 className="text-6xl font-bold text-foreground mb-8">
            {currentWord?.text}
          </h2>
          
          {/* Definition */}
          <p className="text-2xl text-foreground mb-12 leading-relaxed">
            {currentWord?.kidDefinition}
          </p>
          
          {/* Audio Player for Definition */}
          <AudioPlayer
            text={`The word ${currentWord?.text} means ${currentWord?.kidDefinition}`}
            type="sentence"
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-20 h-20 flex items-center justify-center shadow-lg transition-all mx-auto mb-8 border-0 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            wordId={currentWord?.id}
            data-testid="play-definition"
          />

          {/* Sentences Section */}
          {currentWord?.sentences && currentWord.sentences.length > 0 && (
            <div className="mb-12 w-full">
              <h3 className="text-xl font-bold text-foreground mb-6 text-center">
                Listen to sentences with "{currentWord.text}":
              </h3>
              <div className="space-y-4">
                {currentWord.sentences.map((sentence, index) => (
                  <div key={sentence.id} className="bg-card border border-border rounded-xl p-6">
                    <p className="text-lg text-foreground mb-4 leading-relaxed">
                      {sentence.text}
                    </p>
                    <AudioPlayer
                      text={sentence.text}
                      type="sentence"
                      className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all mx-auto border-0 outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
                      sentenceId={sentence.id}
                      data-testid={`play-sentence-${index}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-center gap-8 mb-8">
            <button
              onClick={() => {
                if (currentIndex > 0) {
                  stopAllAudio(); // Stop any playing audio
                  setCurrentIndex(currentIndex - 1);
                }
              }}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 bg-muted hover:bg-muted/90 disabled:opacity-50 text-muted-foreground rounded-xl px-6 py-3 font-medium transition-all disabled:cursor-not-allowed"
              data-testid="previous-word"
            >
              ← Previous
            </button>
            
            <button
              onClick={() => {
                stopAllAudio(); // Stop any playing audio
                if (currentIndex + 1 < sessionWords.length) {
                  setCurrentIndex(currentIndex + 1);
                } else {
                  setSessionComplete(true);
                }
              }}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl px-6 py-3 font-medium transition-all"
              data-testid="next-word"
            >
              {currentIndex + 1 < sessionWords.length ? 'Next →' : 'Finish'}
            </button>
          </div>

          {/* Progress indicator */}
          <div className="text-center text-muted-foreground">
            <p className="text-lg">Word {currentIndex + 1} of {totalWords}</p>
          </div>
        </div>
      </main>
    </div>
  );
}