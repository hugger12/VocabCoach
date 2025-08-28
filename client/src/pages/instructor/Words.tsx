import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Plus, ArrowLeft, Volume2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

interface Word {
  id: string;
  text: string;
  kidDefinition: string;
  teacherDefinition: string;
  partOfSpeech: string;
  weekId: string;
  syllables: string[];
  morphemes: string[];
  createdAt: string;
}

export function Words() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [newWord, setNewWord] = useState({
    text: "",
    definition: "",
    weekId: "",
  });
  const [bulkWords, setBulkWords] = useState("");
  const [bulkDefinition, setBulkDefinition] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch words
  const { data: words, isLoading } = useQuery<Word[]>({
    queryKey: ["/api/words"],
  });

  // Add word mutation
  const addWord = useMutation({
    mutationFn: async (wordData: any) => {
      const response = await fetch("/api/words/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wordData),
      });
      if (!response.ok) throw new Error("Failed to add word");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      setShowAddDialog(false);
      setNewWord({ text: "", definition: "", weekId: "" });
      setBulkWords("");
      setBulkDefinition("");
      toast({
        title: "Word Added",
        description: "Word has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add word",
        variant: "destructive",
      });
    },
  });

  // Add bulk words mutation
  const addBulkWords = useMutation({
    mutationFn: async (data: { words: string; definition: string; weekId: string }) => {
      const response = await fetch("/api/words/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to add words");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      setShowAddDialog(false);
      setBulkWords("");
      setBulkDefinition("");
      toast({
        title: "Words Added",
        description: "All words have been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add words",
        variant: "destructive",
      });
    },
  });

  const handleAddWord = () => {
    if (!newWord.text || !newWord.definition) {
      toast({
        title: "Required Fields",
        description: "Word and definition are required",
        variant: "destructive",
      });
      return;
    }

    if (bulkMode) {
      addBulkWords.mutate({
        words: bulkWords,
        definition: bulkDefinition,
        weekId: newWord.weekId || new Date().toISOString().slice(0, 10),
      });
    } else {
      addWord.mutate({
        ...newWord,
        weekId: newWord.weekId || new Date().toISOString().slice(0, 10),
      });
    }
  };

  const resetDialog = () => {
    setShowAddDialog(false);
    setBulkMode(false);
    setNewWord({ text: "", definition: "", weekId: "" });
    setBulkWords("");
    setBulkDefinition("");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading words...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <img 
            src={huggerLogo} 
            alt="Hugger Digital" 
            className="w-[100px] h-[100px] object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">WordWizard</h1>
            <p className="text-muted-foreground dyslexia-text-base">Vocabulary Management</p>
          </div>
        </div>
        
        <Link href="/">
          <Button 
            variant="outline" 
            className="tap-target border-border text-foreground hover:bg-accent"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </header>

      <div className="container mx-auto max-w-6xl p-6">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-accent rounded-xl">
              <BookOpen className="h-8 w-8 text-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground dyslexia-text-xl">Vocabulary Words</h2>
              <p className="text-muted-foreground dyslexia-text-base">
                Manage your weekly word lists
              </p>
            </div>
          </div>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="tap-target bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                Add Words
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add New Words</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!bulkMode ? "default" : "outline"}
                    onClick={() => setBulkMode(false)}
                    className="flex-1"
                  >
                    Single Word
                  </Button>
                  <Button
                    size="sm"
                    variant={bulkMode ? "default" : "outline"}
                    onClick={() => setBulkMode(true)}
                    className="flex-1"
                  >
                    Multiple Words
                  </Button>
                </div>

                {bulkMode ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground">Words (comma-separated) *</label>
                      <Textarea
                        value={bulkWords}
                        onChange={(e) => setBulkWords(e.target.value)}
                        placeholder="annual, adventure, ancient, analyze, approach"
                        className="mt-1 min-h-[100px]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Shared Definition *</label>
                      <Textarea
                        value={bulkDefinition}
                        onChange={(e) => setBulkDefinition(e.target.value)}
                        placeholder="Enter a definition that applies to all words, or a general topic"
                        className="mt-1"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground">Word *</label>
                      <Input
                        value={newWord.text}
                        onChange={(e) => setNewWord({...newWord, text: e.target.value})}
                        placeholder="Enter the word"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Definition *</label>
                      <Textarea
                        value={newWord.definition}
                        onChange={(e) => setNewWord({...newWord, definition: e.target.value})}
                        placeholder="Enter a kid-friendly definition"
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground">Week ID</label>
                  <Input
                    value={newWord.weekId}
                    onChange={(e) => setNewWord({...newWord, weekId: e.target.value})}
                    placeholder="Leave empty for current week"
                    className="mt-1"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button 
                    onClick={handleAddWord}
                    disabled={addWord.isPending || addBulkWords.isPending}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {(addWord.isPending || addBulkWords.isPending) ? "Adding..." : "Add Words"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={resetDialog}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Words Grid */}
        {words && words.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {words.map((word) => (
              <Card key={word.id} className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground dyslexia-text-lg flex items-center gap-2">
                    {word.text}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({word.partOfSpeech})
                    </span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Week: {word.weekId}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Definition:</h4>
                    <p className="text-sm text-muted-foreground">{word.kidDefinition}</p>
                  </div>
                  
                  {word.syllables && word.syllables.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-1">Syllables:</h4>
                      <p className="text-sm text-muted-foreground font-mono">
                        {word.syllables.join(" • ")}
                      </p>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(word.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Words Yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your first vocabulary words to get started.
            </p>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add First Words
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}