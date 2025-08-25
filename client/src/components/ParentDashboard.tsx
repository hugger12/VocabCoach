import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";
import type { WordWithProgress } from "@shared/schema";

interface InstructorDashboardProps {
  onClose: () => void;
}

export function ParentDashboard({ onClose }: InstructorDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [singleWord, setSingleWord] = useState("");
  const [bulkWords, setBulkWords] = useState("");
  const [showBulkEntry, setShowBulkEntry] = useState(false);

  // Fetch words
  const { data: words = [], isLoading: wordsLoading } = useQuery<WordWithProgress[]>({
    queryKey: ["/api/words"],
    staleTime: 0,
    gcTime: 0,
  });

  // Add word mutation
  const addWordMutation = useMutation({
    mutationFn: async (wordData: { text: string; weekId: string }) => {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wordData),
      });
      if (!response.ok) throw new Error("Failed to add word");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      setSingleWord("");
      toast({
        title: "Word Added Successfully",
        description: "AI has processed the word with definitions and example sentences.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add word. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete word mutation
  const deleteWordMutation = useMutation({
    mutationFn: async (wordId: string) => {
      const response = await fetch(`/api/words/${wordId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete word");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      toast({
        title: "Word Deleted",
        description: "The word has been removed from this week's list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete word. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk add words mutation
  const bulkAddWordsMutation = useMutation({
    mutationFn: async (wordTexts: string[]) => {
      const results = [];
      for (const wordText of wordTexts) {
        const response = await fetch("/api/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: wordText.trim(),
            weekId: `week-${Math.ceil(Date.now() / (7 * 24 * 60 * 60 * 1000))}`,
          }),
        });
        if (!response.ok) throw new Error(`Failed to add word: ${wordText}`);
        const result = await response.json();
        results.push(result);
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      setBulkWords("");
      setShowBulkEntry(false);
      toast({
        title: "Words Added Successfully",
        description: `${results.length} words have been processed with AI-generated definitions and sentences.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Adding Words",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddWord = () => {
    if (!singleWord.trim()) {
      toast({
        title: "Missing Word",
        description: "Please enter a word to add.",
        variant: "destructive",
      });
      return;
    }

    addWordMutation.mutate({
      text: singleWord.trim(),
      weekId: `week-${Math.ceil(Date.now() / (7 * 24 * 60 * 60 * 1000))}`,
    });
  };

  const handleDeleteWord = (wordId: string) => {
    if (confirm("Are you sure you want to delete this word?")) {
      deleteWordMutation.mutate(wordId);
    }
  };

  const handleBulkAddWords = () => {
    if (!bulkWords.trim()) {
      toast({
        title: "No Words Entered",
        description: "Please enter words separated by commas or new lines.",
        variant: "destructive",
      });
      return;
    }

    const wordList = bulkWords
      .split(/[,\n]/)
      .map(word => word.trim())
      .filter(word => word.length > 0);

    if (wordList.length === 0) {
      toast({
        title: "No Valid Words",
        description: "Please enter at least one valid word.",
        variant: "destructive",
      });
      return;
    }

    if (wordList.length > 12) {
      toast({
        title: "Too Many Words",
        description: "Please enter no more than 12 words at a time.",
        variant: "destructive",
      });
      return;
    }

    bulkAddWordsMutation.mutate(wordList);
  };

  const currentWeekWords = words.filter(word => word.weekId === words[0]?.weekId);
  const wordsCount = currentWeekWords.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-6">
        <img 
          src={huggerLogo} 
          alt="Hugger Digital" 
          className="w-[100px] h-[100px] object-contain"
        />
        <h1 className="text-3xl font-bold text-foreground">Instructor Dashboard</h1>
        <button
          onClick={onClose}
          className="p-2 text-foreground hover:text-muted-foreground transition-colors"
          data-testid="close-dashboard"
        >
          <X className="w-6 h-6" />
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Add Words Section */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-foreground flex items-center">
                <Plus className="w-6 h-6 mr-2" />
                Add This Week's Words
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowBulkEntry(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    !showBulkEntry 
                      ? "bg-foreground text-background" 
                      : "bg-transparent border-2 border-foreground/20 text-foreground hover:border-foreground/40"
                  }`}
                  data-testid="single-word-mode"
                >
                  Single Word
                </button>
                <button
                  onClick={() => setShowBulkEntry(true)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    showBulkEntry 
                      ? "bg-foreground text-background" 
                      : "bg-transparent border-2 border-foreground/20 text-foreground hover:border-foreground/40"
                  }`}
                  data-testid="bulk-word-mode"
                >
                  Bulk Entry
                </button>
              </div>
            </div>

            {showBulkEntry ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg text-foreground mb-3">
                    Enter words separated by commas or new lines. AI will determine part of speech and generate definitions.
                  </p>
                  <Textarea
                    value={bulkWords}
                    onChange={(e) => setBulkWords(e.target.value)}
                    placeholder="magnificent, adventure, curious, explore, brilliant, discover, incredible, journey, wonderful, mystery, treasure, amazing"
                    className="w-full p-4 rounded-lg bg-white/20 border-0 text-foreground placeholder:text-foreground/60 resize-none h-32"
                    data-testid="textarea-bulk-words"
                  />
                </div>
                <button
                  onClick={handleBulkAddWords}
                  disabled={bulkAddWordsMutation.isPending}
                  className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium py-4 rounded-lg transition-all disabled:opacity-50"
                  data-testid="button-bulk-add"
                >
                  <Plus className="w-5 h-5 mr-2 inline" />
                  {bulkAddWordsMutation.isPending ? "Processing Words..." : "Add Words with AI"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-lg text-foreground mb-3">
                    Just enter the word - AI will determine part of speech and generate definitions.
                  </p>
                  <Input
                    value={singleWord}
                    onChange={(e) => setSingleWord(e.target.value)}
                    placeholder="Enter word (e.g. magnificent)"
                    className="w-full p-4 rounded-lg bg-white/20 border-0 text-foreground placeholder:text-foreground/60"
                    data-testid="input-word"
                  />
                </div>
                <button
                  onClick={handleAddWord}
                  disabled={addWordMutation.isPending}
                  className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium py-4 rounded-lg transition-all disabled:opacity-50"
                  data-testid="button-add-word"
                >
                  <Plus className="w-5 h-5 mr-2 inline" />
                  {addWordMutation.isPending ? "Processing Word..." : "Add Word with AI"}
                </button>
              </div>
            )}
          </div>

          {/* Words List Section */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                This Week's Words ({wordsCount}/12)
              </h2>
              <button
                onClick={() => window.open("/api/export/progress", "_blank")}
                className="px-4 py-2 rounded-lg border-2 border-foreground/20 text-foreground hover:border-foreground/40 font-medium transition-all"
                data-testid="button-export"
              >
                Export
              </button>
            </div>

            {wordsLoading ? (
              <div className="text-center py-8">
                <p className="text-lg text-foreground/60">Loading words...</p>
              </div>
            ) : currentWeekWords.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-lg text-foreground/60">
                  No words added yet. Add your first word!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentWeekWords.map((word) => (
                  <div
                    key={word.id}
                    className="flex items-center justify-between p-4 bg-white/10 rounded-lg"
                    data-testid={`word-item-${word.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground text-lg">
                          {word.text}
                        </span>
                        <span className="text-sm text-foreground/60">
                          ({word.partOfSpeech})
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80">
                        {word.kidDefinition}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteWord(word.id)}
                      className="p-2 text-foreground/60 hover:text-red-500 transition-colors"
                      data-testid={`delete-word-${word.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}