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
    mutationFn: async (wordData: WordFormData) => {
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
        title: "Word Added",
        description: "The word has been added to this week's list.",
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

  const handleAddWord = () => {
    if (!wordForm.text || !wordForm.partOfSpeech || !wordForm.kidDefinition) {
      toast({
        title: "Missing Information",
        description: "Please fill in word, part of speech, and definition.",
        variant: "destructive",
      });
      return;
    }

    addWordMutation.mutate(wordForm);
  };

  const handleDeleteWord = (wordId: string) => {
    if (confirm("Are you sure you want to delete this word?")) {
      deleteWordMutation.mutate(wordId);
    }
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
                  <CardTitle className="text-dyslexia-lg flex items-center">
                    <Plus className="w-6 h-6 text-primary mr-2" />
                    Add This Week's Words
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="word-text" className="text-dyslexia-base font-medium">
                      Word
                    </Label>
                    <Input
                      id="word-text"
                      value={wordForm.text}
                      onChange={(e) => setWordForm({ ...wordForm, text: e.target.value })}
                      placeholder="Enter word"
                      className="input-dyslexia mt-2"
                      data-testid="input-word"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="part-of-speech" className="text-dyslexia-base font-medium">
                      Part of Speech
                    </Label>
                    <Select
                      value={wordForm.partOfSpeech}
                      onValueChange={(value) => setWordForm({ ...wordForm, partOfSpeech: value })}
                    >
                      <SelectTrigger className="input-dyslexia mt-2" data-testid="select-pos">
                        <SelectValue placeholder="Select part of speech" />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTS_OF_SPEECH.map((pos) => (
                          <SelectItem key={pos.value} value={pos.value}>
                            {pos.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="kid-definition" className="text-dyslexia-base font-medium">
                      Kid-Friendly Definition
                    </Label>
                    <Textarea
                      id="kid-definition"
                      value={wordForm.kidDefinition}
                      onChange={(e) => setWordForm({ ...wordForm, kidDefinition: e.target.value })}
                      placeholder="Enter simple definition for child"
                      className="input-dyslexia mt-2 min-h-20 resize-none"
                      data-testid="textarea-definition"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="teacher-definition" className="text-dyslexia-base font-medium">
                      Teacher Definition (Optional)
                    </Label>
                    <Textarea
                      id="teacher-definition"
                      value={wordForm.teacherDefinition}
                      onChange={(e) => setWordForm({ ...wordForm, teacherDefinition: e.target.value })}
                      placeholder="Enter original teacher definition"
                      className="input-dyslexia mt-2 min-h-20 resize-none"
                      data-testid="textarea-teacher-definition"
                    />
                  </div>
                  
                  <DyslexiaButton
                    onClick={handleAddWord}
                    disabled={addWordMutation.isPending}
                    className="w-full"
                    data-testid="button-add-word"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Word
                  </DyslexiaButton>
                  
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
