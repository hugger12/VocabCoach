import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Camera, Download, Book, Calendar, TrendingUp, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DyslexiaButton } from "@/components/ui/dyslexia-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { WordWithProgress } from "@shared/schema";

interface ParentDashboardProps {
  onClose: () => void;
}

interface WordFormData {
  text: string;
  partOfSpeech: string;
  kidDefinition: string;
  teacherDefinition?: string;
}

interface BulkWordEntry {
  text: string;
}

const PARTS_OF_SPEECH = [
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adjective", label: "Adjective" },
  { value: "adverb", label: "Adverb" },
];

const BOX_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "New", color: "status-new" },
  2: { label: "Learning", color: "status-learning" },
  3: { label: "Almost", color: "status-almost" },
  4: { label: "Mastered", color: "status-mastered" },
  5: { label: "Mastered", color: "status-mastered" },
};

export function ParentDashboard({ onClose }: ParentDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("words");
  const [wordForm, setWordForm] = useState<WordFormData>({
    text: "",
    partOfSpeech: "",
    kidDefinition: "",
    teacherDefinition: "",
  });
  
  const [bulkWords, setBulkWords] = useState<string>("");
  const [showBulkEntry, setShowBulkEntry] = useState(false);

  // Fetch words
  const { data: words = [], isLoading: wordsLoading } = useQuery<WordWithProgress[]>({
    queryKey: ["/api/words"],
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

  // Fetch settings
  const { data: settings = [] } = useQuery({
    queryKey: ["/api/settings"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      setWordForm({ text: "", partOfSpeech: "", kidDefinition: "", teacherDefinition: "" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
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

  // Export progress mutation
  const exportProgressMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/export/progress");
      if (!response.ok) throw new Error("Failed to export progress");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "vocabulary-progress.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return blob;
    },
    onSuccess: () => {
      toast({
        title: "Export Complete",
        description: "Progress report has been downloaded.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Could not export progress report.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
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
    if (!wordForm.text.trim()) {
      toast({
        title: "Missing Word",
        description: "Please enter a word to add.",
        variant: "destructive",
      });
      return;
    }

    // Send only the word text - let AI determine everything else
    addWordMutation.mutate({
      text: wordForm.text.trim(),
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

    // Parse words from text input (comma or line separated)
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
      <header className="bg-card border-b border-border p-6 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-dyslexia-xl font-semibold text-foreground">
            Parent Dashboard
          </h1>
          <DyslexiaButton
            variant="outline"
            onClick={onClose}
            data-testid="close-dashboard"
          >
            <X className="w-5 h-5" />
            Close
          </DyslexiaButton>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        
        {/* Dashboard Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full grid-cols-3 bg-muted rounded-xl p-1">
            <TabsTrigger value="words" className="dashboard-tab" data-testid="tab-words">
              <Book className="w-5 h-5 mr-2" />
              Words
            </TabsTrigger>
            <TabsTrigger value="schedule" className="dashboard-tab" data-testid="tab-schedule">
              <Calendar className="w-5 h-5 mr-2" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="progress" className="dashboard-tab" data-testid="tab-progress">
              <TrendingUp className="w-5 h-5 mr-2" />
              Progress
            </TabsTrigger>
          </TabsList>

          {/* Words Tab */}
          <TabsContent value="words" className="mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Add Words Form */}
              <Card className="card-dyslexia">
                <CardHeader>
                  <CardTitle className="text-dyslexia-lg flex items-center justify-between">
                    <div className="flex items-center">
                      <Plus className="w-6 h-6 text-primary mr-2" />
                      Add This Week's Words
                    </div>
                    <div className="flex space-x-2">
                      <DyslexiaButton
                        variant={showBulkEntry ? "outline" : "default"}
                        size="sm"
                        onClick={() => setShowBulkEntry(false)}
                        data-testid="single-word-mode"
                      >
                        Single Word
                      </DyslexiaButton>
                      <DyslexiaButton
                        variant={showBulkEntry ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowBulkEntry(true)}
                        data-testid="bulk-word-mode"
                      >
                        Bulk Entry
                      </DyslexiaButton>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showBulkEntry ? (
                    // Bulk Word Entry
                    <>
                      <div>
                        <Label htmlFor="bulk-words" className="text-dyslexia-base font-medium">
                          Enter 12 Words for This Week
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">
                          Enter words separated by commas or new lines. AI will generate definitions and sentences.
                        </p>
                        <Textarea
                          id="bulk-words"
                          value={bulkWords}
                          onChange={(e) => setBulkWords(e.target.value)}
                          placeholder="magnificent, adventure, curious, explore, brilliant, discover, incredible, journey, wonderful, mystery, treasure, amazing"
                          className="input-dyslexia mt-2 min-h-32 resize-none"
                          data-testid="textarea-bulk-words"
                        />
                      </div>
                      <DyslexiaButton
                        onClick={handleBulkAddWords}
                        disabled={bulkAddWordsMutation.isPending}
                        className="w-full"
                        data-testid="button-bulk-add"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        {bulkAddWordsMutation.isPending ? "Processing Words..." : "Add Words with AI"}
                      </DyslexiaButton>
                      {bulkAddWordsMutation.isPending && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">
                            AI is generating definitions and sentences for each word...
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Single Word Entry
                    <>
                      <div>
                        <Label htmlFor="word-text" className="text-dyslexia-base font-medium">
                          Word
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">
                          Just enter the word - AI will determine part of speech and generate definitions.
                        </p>
                        <Input
                          id="word-text"
                          value={wordForm.text}
                          onChange={(e) => setWordForm({ ...wordForm, text: e.target.value })}
                          placeholder="Enter word (e.g. magnificent)"
                          className="input-dyslexia mt-2"
                          data-testid="input-word"
                        />
                      </div>
                      
                      <DyslexiaButton
                        onClick={handleAddWord}
                        disabled={addWordMutation.isPending}
                        className="w-full"
                        data-testid="button-add-word"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        {addWordMutation.isPending ? "Processing Word..." : "Add Word with AI"}
                      </DyslexiaButton>
                      
                      {addWordMutation.isPending && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">
                            AI is analyzing the word and generating definitions...
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* OCR Helper */}
                  <div className="pt-6 border-t border-border">
                    <DyslexiaButton
                      variant="secondary"
                      className="w-full"
                      disabled={true}
                      data-testid="button-ocr"
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      Scan Word List Photo (Coming Soon)
                    </DyslexiaButton>
                  </div>
                </CardContent>
              </Card>

              {/* Current Words List */}
              <Card className="card-dyslexia">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-dyslexia-lg">
                    This Week's Words ({wordsCount}/12)
                  </CardTitle>
                  <DyslexiaButton
                    variant="outline"
                    size="sm"
                    onClick={() => exportProgressMutation.mutate()}
                    disabled={exportProgressMutation.isPending}
                    data-testid="button-export"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </DyslexiaButton>
                </CardHeader>
                <CardContent>
                  {wordsLoading ? (
                    <div className="text-center py-8">
                      <p className="text-dyslexia-base text-muted-foreground">Loading words...</p>
                    </div>
                  ) : currentWeekWords.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-dyslexia-base text-muted-foreground">
                        No words added yet. Add your first word above!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {currentWeekWords.map((word) => (
                        <div
                          key={word.id}
                          className="flex items-center justify-between p-4 bg-muted rounded-lg"
                          data-testid={`word-item-${word.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-foreground text-dyslexia-base">
                                {word.text}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                ({word.partOfSpeech})
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {word.kidDefinition}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={cn(
                              BOX_LABELS[word.schedule?.box || 1]?.color || "status-new"
                            )}>
                              {BOX_LABELS[word.schedule?.box || 1]?.label || "New"}
                            </span>
                            <DyslexiaButton
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteWord(word.id)}
                              className="text-muted-foreground hover:text-destructive"
                              data-testid={`delete-word-${word.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </DyslexiaButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="mt-8">
            <Card className="card-dyslexia">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-dyslexia-lg">
                  Study Schedule (Leitner System)
                </CardTitle>
                <div className="flex items-center space-x-4">
                  <Label className="text-dyslexia-base">Daily limit:</Label>
                  <Select defaultValue="8">
                    <SelectTrigger className="w-32" data-testid="select-daily-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 words</SelectItem>
                      <SelectItem value="8">8 words</SelectItem>
                      <SelectItem value="10">10 words</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {/* Schedule Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((box) => {
                    const boxWords = currentWeekWords.filter(word => word.schedule?.box === box);
                    const boxInfo = {
                      1: { title: "Box 1 (New)", interval: "1 hour", color: "border-blue-300" },
                      2: { title: "Box 2 (Learning)", interval: "1 day", color: "border-green-300" },
                      3: { title: "Box 3 (Almost)", interval: "3 days", color: "border-yellow-300" },
                      4: { title: "Box 4 (Mastered)", interval: "1 week", color: "border-purple-300" },
                    }[box];

                    return (
                      <div
                        key={box}
                        className={cn(
                          "p-4 border-2 border-dashed rounded-xl",
                          boxInfo?.color || "border-gray-300"
                        )}
                        data-testid={`schedule-box-${box}`}
                      >
                        <h3 className="font-semibold text-foreground mb-2 text-dyslexia-base">
                          {boxInfo?.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          Next review: {boxInfo?.interval}
                        </p>
                        <div className="space-y-2">
                          {boxWords.map((word) => (
                            <div
                              key={word.id}
                              className={cn(
                                "text-sm px-2 py-1 rounded",
                                BOX_LABELS[box]?.color || "status-new"
                              )}
                            >
                              {word.text}
                            </div>
                          ))}
                          {boxWords.length === 0 && (
                            <p className="text-xs text-muted-foreground italic">No words</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Progress Summary */}
              <Card className="card-dyslexia">
                <CardHeader>
                  <CardTitle className="text-dyslexia-lg">
                    Progress Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900 rounded-lg">
                    <div>
                      <h3 className="font-semibold text-green-800 dark:text-green-200 text-dyslexia-base">
                        Overall Progress
                      </h3>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Mastery percentage
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-green-800 dark:text-green-200">
                      {progress?.overall.masteryPercentage || 0}%
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
                    <div>
                      <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-dyslexia-base">
                        Words Mastered
                      </h3>
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        Total completed
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                      {progress?.overall.mastered || 0}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                    <div>
                      <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 text-dyslexia-base">
                        Learning
                      </h3>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        Words in progress
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                      {progress?.overall.learning || 0}
                    </div>
                  </div>
                  
                  <DyslexiaButton
                    onClick={() => exportProgressMutation.mutate()}
                    disabled={exportProgressMutation.isPending}
                    className="w-full"
                    data-testid="button-export-report"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Export Progress Report
                  </DyslexiaButton>
                </CardContent>
              </Card>

              {/* Detailed Word Progress */}
              <Card className="card-dyslexia">
                <CardHeader>
                  <CardTitle className="text-dyslexia-lg">
                    Individual Word Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {progress?.words.map((wordProgress) => (
                      <div
                        key={wordProgress.word.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                        data-testid={`word-progress-${wordProgress.word.id}`}
                      >
                        <div className="flex-1">
                          <span className="font-medium text-foreground text-dyslexia-base">
                            {wordProgress.word.text}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            Success: {Math.round(wordProgress.successRate)}% 
                            ({wordProgress.totalAttempts} attempts)
                          </div>
                        </div>
                        <span className={cn(
                          BOX_LABELS[wordProgress.word.schedule?.box || 1]?.color || "status-new"
                        )}>
                          Box {wordProgress.word.schedule?.box || 1}
                        </span>
                      </div>
                    )) || (
                      <div className="text-center py-8">
                        <p className="text-dyslexia-base text-muted-foreground">
                          No progress data yet. Start practicing to see results!
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
