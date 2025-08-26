import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2, TrendingUp, Archive } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"words" | "progress">("words");
  const [wordText, setWordText] = useState("");
  const [teacherDefinition, setTeacherDefinition] = useState("");
  const [bulkWords, setBulkWords] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "ai" | "bulk">("manual");
  const [currentWeekId, setCurrentWeekId] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  });

  // Fetch words
  const { data: words = [], isLoading: wordsLoading } = useQuery<WordWithProgress[]>({
    queryKey: ["/api/words"],
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch progress
  const { data: progress } = useQuery<{
    overall: {
      total: number;
      mastered: number;
      learning: number;
      masteryPercentage: number;
      byBox: Record<string, number>;
    };
    words: Array<{
      word: WordWithProgress;
      successRate: number;
      totalAttempts: number;
    }>;
  }>({
    queryKey: ["/api/progress"],
  });

  // Add word with manual definition mutation
  const addManualWordMutation = useMutation({
    mutationFn: async (wordData: { text: string; definition: string; weekId: string }) => {
      const response = await fetch("/api/words/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wordData),
      });
      if (!response.ok) throw new Error("Failed to add word");
      return response.json();
    },
    onMutate: async (wordData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/words"] });
      
      // Snapshot the previous value
      const previousWords = queryClient.getQueryData(["/api/words"]);
      
      // Create temporary word for optimistic update
      const tempWord: WordWithProgress = {
        id: `temp-${Date.now()}`,
        text: wordData.text,
        partOfSpeech: "...", // Will be determined by AI
        kidDefinition: wordData.definition,
        teacherDefinition: wordData.definition,
        weekId: wordData.weekId,
        syllables: null,
        morphemes: null,
        ipa: null,
        createdAt: new Date(),
        schedule: null,
        sentences: [],
      };
      
      // Optimistically add the word
      queryClient.setQueryData(["/api/words"], (old: WordWithProgress[] | undefined) => {
        return old ? [...old, tempWord] : [tempWord];
      });
      
      return { previousWords };
    },
    onSuccess: (newWord, wordData) => {
      // Replace the temporary word with the real one from the server
      queryClient.setQueryData(["/api/words"], (old: WordWithProgress[] | undefined) => {
        return old ? old.map(word => 
          word.id === `temp-${newWord.createdAt}` ? newWord : word
        ) : [newWord];
      });
      setWordText("");
      setTeacherDefinition("");
      toast({
        title: "Word Added Successfully",
        description: "Word has been added with the teacher's definition.",
      });
    },
    onError: (err, wordData, context) => {
      // Roll back on error
      if (context?.previousWords) {
        queryClient.setQueryData(["/api/words"], context.previousWords);
      }
      toast({
        title: "Error",
        description: "Failed to add word. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
    },
  });

  // Add word with AI mutation
  const addAIWordMutation = useMutation({
    mutationFn: async (wordData: { text: string; weekId: string }) => {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wordData),
      });
      if (!response.ok) throw new Error("Failed to add word");
      return response.json();
    },
    onMutate: async (wordData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/words"] });
      
      // Snapshot the previous value
      const previousWords = queryClient.getQueryData(["/api/words"]);
      
      // Create temporary word for optimistic update
      const tempWord: WordWithProgress = {
        id: `temp-${Date.now()}`,
        text: wordData.text,
        partOfSpeech: "Loading...", 
        kidDefinition: "AI is processing...",
        teacherDefinition: null,
        weekId: wordData.weekId,
        syllables: null,
        morphemes: null,
        ipa: null,
        createdAt: new Date(),
        schedule: null,
        sentences: [],
      };
      
      // Optimistically add the word
      queryClient.setQueryData(["/api/words"], (old: WordWithProgress[] | undefined) => {
        return old ? [...old, tempWord] : [tempWord];
      });
      
      return { previousWords };
    },
    onSuccess: (newWord, wordData) => {
      // Replace the temporary word with the real one from the server
      queryClient.setQueryData(["/api/words"], (old: WordWithProgress[] | undefined) => {
        return old ? old.map(word => 
          word.id.startsWith('temp-') && word.text === wordData.text ? newWord : word
        ) : [newWord];
      });
      setWordText("");
      toast({
        title: "Word Added Successfully",
        description: "AI has processed the word with definitions and example sentences.",
      });
    },
    onError: (err, wordData, context) => {
      // Roll back on error
      if (context?.previousWords) {
        queryClient.setQueryData(["/api/words"], context.previousWords);
      }
      toast({
        title: "Error",
        description: "Failed to add word. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
    },
  });

  // Delete word mutation with optimistic updates
  const deleteWordMutation = useMutation({
    mutationFn: async (wordId: string) => {
      const response = await fetch(`/api/words/${wordId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete word");
      return response.json();
    },
    onMutate: async (wordId: string) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/words"] });
      
      // Snapshot the previous value
      const previousWords = queryClient.getQueryData(["/api/words"]);
      
      // Optimistically remove the word from the cache
      queryClient.setQueryData(["/api/words"], (old: WordWithProgress[] | undefined) => {
        return old ? old.filter(word => word.id !== wordId) : [];
      });
      
      // Return a context object with the snapshotted value
      return { previousWords };
    },
    onError: (err, wordId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousWords) {
        queryClient.setQueryData(["/api/words"], context.previousWords);
      }
      toast({
        title: "Error",
        description: "Failed to delete word. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Word Deleted",
        description: "The word has been removed from this week's list.",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      setBulkWords("");
      setEntryMode("manual");
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

  const handleAddManualWord = () => {
    if (!wordText.trim()) {
      toast({
        title: "Missing Word",
        description: "Please enter a word to add.",
        variant: "destructive",
      });
      return;
    }

    if (!teacherDefinition.trim()) {
      toast({
        title: "Missing Definition",
        description: "Please enter the teacher's definition.",
        variant: "destructive",
      });
      return;
    }

    addManualWordMutation.mutate({
      text: wordText.trim(),
      definition: teacherDefinition.trim(),
      weekId: currentWeekId,
    });
  };

  const handleAddAIWord = () => {
    if (!wordText.trim()) {
      toast({
        title: "Missing Word",
        description: "Please enter a word to add.",
        variant: "destructive",
      });
      return;
    }

    addAIWordMutation.mutate({
      text: wordText.trim(),
      weekId: currentWeekId,
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

    // Add weekId to each word for bulk processing
    const wordListWithWeeks = wordList.map(word => ({ text: word, weekId: currentWeekId }));
    bulkAddWordsMutation.mutate(wordList);
  };

  // Group words by week
  const wordsByWeek = words.reduce((acc, word) => {
    const weekId = word.weekId || 'unknown';
    if (!acc[weekId]) acc[weekId] = [];
    acc[weekId].push(word);
    return acc;
  }, {} as Record<string, WordWithProgress[]>);

  const currentWeekWords = wordsByWeek[currentWeekId] || [];
  const wordsCount = currentWeekWords.length;
  const archivedWeeks = Object.keys(wordsByWeek).filter(week => week !== currentWeekId && week !== 'unknown');

  const createNewWeek = () => {
    const now = new Date();
    now.setDate(now.getDate() + 7); // Next week
    const year = now.getFullYear();
    const weekNumber = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const newWeekId = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    setCurrentWeekId(newWeekId);
    toast({
      title: "New Week Created",
      description: `Started ${newWeekId}. Previous week has been archived.`,
    });
  };

  const masteredWords = progress?.words?.filter(item => {
    // A word is mastered if it has attempts and high success rate
    return item.totalAttempts > 0 && item.successRate >= 0.8;
  }) || [];

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

      {/* Tab Navigation */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex space-x-1 bg-white/10 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab("words")}
            className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === "words" 
                ? "bg-foreground text-background" 
                : "text-foreground hover:bg-white/10"
            }`}
            data-testid="tab-words"
          >
            <Plus className="w-5 h-5 mr-2" />
            Words
          </button>
          <button
            onClick={() => setActiveTab("progress")}
            className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-medium transition-all ${
              activeTab === "progress" 
                ? "bg-foreground text-background" 
                : "text-foreground hover:bg-white/10"
            }`}
            data-testid="tab-progress"
          >
            <TrendingUp className="w-5 h-5 mr-2" />
            Progress
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {activeTab === "words" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Add Words Section */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-foreground">
                  Add Words to {currentWeekId}
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={createNewWeek}
                    className="px-3 py-2 rounded-lg border-2 border-foreground/20 text-foreground hover:border-foreground/40 font-medium transition-all text-sm"
                    data-testid="new-week"
                  >
                    New Week
                  </button>
                </div>
              </div>

              {/* Entry Mode Selection */}
              <div className="flex space-x-2 mb-6">
                <button
                  onClick={() => setEntryMode("manual")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    entryMode === "manual" 
                      ? "bg-foreground text-background" 
                      : "bg-transparent border-2 border-foreground/20 text-foreground hover:border-foreground/40"
                  }`}
                  data-testid="manual-mode"
                >
                  Teacher Definition
                </button>
                <button
                  onClick={() => setEntryMode("ai")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    entryMode === "ai" 
                      ? "bg-foreground text-background" 
                      : "bg-transparent border-2 border-foreground/20 text-foreground hover:border-foreground/40"
                  }`}
                  data-testid="ai-mode"
                >
                  AI Definition
                </button>
                <button
                  onClick={() => setEntryMode("bulk")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    entryMode === "bulk" 
                      ? "bg-foreground text-background" 
                      : "bg-transparent border-2 border-foreground/20 text-foreground hover:border-foreground/40"
                  }`}
                  data-testid="bulk-mode"
                >
                  Bulk AI
                </button>
              </div>

              {entryMode === "manual" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-lg text-foreground mb-3">
                      Enter word and the teacher's definition exactly as provided.
                    </p>
                    <Input
                      value={wordText}
                      onChange={(e) => setWordText(e.target.value)}
                      placeholder="Enter word (e.g. magnificent)"
                      className="w-full p-4 rounded-lg bg-white/20 border-0 text-foreground placeholder:text-foreground/60 mb-3"
                      data-testid="input-word"
                    />
                    <Textarea
                      value={teacherDefinition}
                      onChange={(e) => setTeacherDefinition(e.target.value)}
                      placeholder="Paste or type the teacher's definition here..."
                      className="w-full p-4 rounded-lg bg-white/20 border-0 text-foreground placeholder:text-foreground/60 resize-none h-24"
                      data-testid="input-definition"
                    />
                  </div>
                  <button
                    onClick={handleAddManualWord}
                    disabled={addManualWordMutation.isPending}
                    className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium py-4 rounded-lg transition-all disabled:opacity-50"
                    data-testid="button-add-manual"
                  >
                    <Plus className="w-5 h-5 mr-2 inline" />
                    {addManualWordMutation.isPending ? "Adding Word..." : "Add Word with Teacher Definition"}
                  </button>
                </div>
              )}

              {entryMode === "ai" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-lg text-foreground mb-3">
                      Enter word and AI will generate definitions and sentences.
                    </p>
                    <Input
                      value={wordText}
                      onChange={(e) => setWordText(e.target.value)}
                      placeholder="Enter word (e.g. magnificent)"
                      className="w-full p-4 rounded-lg bg-white/20 border-0 text-foreground placeholder:text-foreground/60"
                      data-testid="input-word-ai"
                    />
                  </div>
                  <button
                    onClick={handleAddAIWord}
                    disabled={addAIWordMutation.isPending}
                    className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium py-4 rounded-lg transition-all disabled:opacity-50"
                    data-testid="button-add-ai"
                  >
                    <Plus className="w-5 h-5 mr-2 inline" />
                    {addAIWordMutation.isPending ? "Processing Word..." : "Add Word with AI"}
                  </button>
                </div>
              )}

              {entryMode === "bulk" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-lg text-foreground mb-3">
                      Enter multiple words separated by commas. AI will process all.
                    </p>
                    <Textarea
                      value={bulkWords}
                      onChange={(e) => setBulkWords(e.target.value)}
                      placeholder="magnificent, adventure, curious, explore, brilliant, discover"
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
              )}
            </div>

            {/* Words List Section */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-foreground">
                  Current Week ({wordsCount}/12)
                </h2>
                {archivedWeeks.length > 0 && (
                  <div className="flex items-center text-sm text-foreground/60">
                    <Archive className="w-4 h-4 mr-1" />
                    {archivedWeeks.length} archived week{archivedWeeks.length !== 1 ? 's' : ''}
                  </div>
                )}
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
        ) : (
          /* Progress Tab */
          <div className="space-y-8">
            
            {/* Overall Progress */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
              <h2 className="text-2xl font-bold text-foreground mb-6">Overall Progress</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">
                    {progress?.overall.total || 0}
                  </p>
                  <p className="text-sm text-foreground/60">
                    Total words
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-500">
                    {masteredWords.length}
                  </p>
                  <p className="text-sm text-foreground/60">
                    Mastered words
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-500">
                    {Math.round(masteredWords.length / (progress?.overall.total || 1) * 100)}%
                  </p>
                  <p className="text-sm text-foreground/60">
                    Mastery rate
                  </p>
                </div>
              </div>
            </div>

            {/* Mastered Words List */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
              <h2 className="text-2xl font-bold text-foreground mb-6">Mastered Words</h2>
              {masteredWords.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-lg text-foreground/60">
                    No words mastered yet. Words are mastered when the student gets the quiz correct consistently.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {masteredWords.map(({ word, successRate, totalAttempts }) => (
                    <div
                      key={word.id}
                      className="p-4 bg-white/10 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">
                          {word.text}
                        </span>
                        <span className="text-sm text-green-500 font-medium">
                          {Math.round(successRate * 100)}%
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 mb-1">
                        {word.kidDefinition}
                      </p>
                      <p className="text-xs text-foreground/60">
                        {totalAttempts} quiz attempts
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All Words Progress */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-8">
              <h2 className="text-2xl font-bold text-foreground mb-6">All Words Progress</h2>
              {progress?.words?.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-lg text-foreground/60">
                    No practice data yet. Progress will appear after the student starts studying.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {progress?.words?.map(({ word, successRate, totalAttempts }) => (
                    <div
                      key={word.id}
                      className="flex items-center justify-between p-4 bg-white/10 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">
                            {word.text}
                          </span>
                          <span className="text-sm text-foreground/60">
                            ({word.weekId})
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80">
                          {word.kidDefinition}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${
                          successRate >= 0.8 ? 'text-green-500' : 
                          successRate >= 0.6 ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                          {Math.round(successRate * 100)}%
                        </div>
                        <div className="text-xs text-foreground/60">
                          {totalAttempts} attempts
                        </div>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8">
                      <p className="text-lg text-foreground/60">
                        No practice data yet.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}