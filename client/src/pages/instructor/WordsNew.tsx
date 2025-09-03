import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, ArrowLeft, FileText, CheckCircle, Calendar, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

interface VocabularyList {
  id: string;
  name: string;
  isCurrent: boolean;
  createdAt: string;
  wordCount: number;
}

interface Word {
  id: string;
  text: string;
  kidDefinition: string;
  teacherDefinition: string;
  partOfSpeech: string;
  syllables: string[];
  morphemes: string[];
  createdAt: string;
}

export function WordsNew() {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [listName, setListName] = useState("");
  const [vocabularyText, setVocabularyText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch vocabulary lists
  const { data: vocabularyLists, isLoading } = useQuery<VocabularyList[]>({
    queryKey: ["/api/vocabulary-lists"],
  });

  // Parse vocabulary text into words with definitions
  const parseVocabularyText = (text: string) => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const words = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Look for word patterns - isolated words without periods or colons
      if (line.match(/^[a-zA-Z]+$/) && !line.includes('.') && !line.includes(':')) {
        const word = line;
        let definitions = [];
        let partOfSpeech = '';
        
        // Look ahead for definitions on subsequent lines
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^[a-zA-Z]+$/)) {
          const defLine = lines[j].trim();
          if (defLine) {
            // Extract part of speech in parentheses at start of line
            const posMatch = defLine.match(/^\(([^)]+)\)/);
            if (posMatch) {
              if (!partOfSpeech) {
                partOfSpeech = posMatch[1].replace(/\d+\.\s*/, ''); // Remove numbering
              }
              // Extract definition after part of speech
              const def = defLine.replace(/^\([^)]+\)\s*/, '').trim();
              if (def) {
                definitions.push(def);
              }
            } else if (defLine.match(/^\d+\.\s*\([^)]+\)/)) {
              // Handle numbered definitions like "1. (v.) to agree..."
              const numPosMatch = defLine.match(/^\d+\.\s*\(([^)]+)\)\s*(.+)/);
              if (numPosMatch) {
                if (!partOfSpeech) {
                  partOfSpeech = numPosMatch[1];
                }
                definitions.push(numPosMatch[2].trim());
              }
            } else {
              definitions.push(defLine);
            }
          }
          j++;
        }
        
        if (definitions.length > 0) {
          words.push({
            text: word,
            partOfSpeech: partOfSpeech || 'noun',
            definitions: definitions
          });
        }
      }
    }
    
    return words;
  };

  // Import vocabulary list mutation
  const importVocabularyList = useMutation({
    mutationFn: async (data: { listName: string; vocabularyText: string }) => {
      const parsedWords = parseVocabularyText(data.vocabularyText);
      
      if (parsedWords.length === 0) {
        throw new Error("No words could be parsed from the text. Please check the format.");
      }

      const response = await fetch("/api/vocabulary-lists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listName: data.listName,
          words: parsedWords
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to import vocabulary list");
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/words"] });
      setShowImportDialog(false);
      setListName("");
      setVocabularyText("");
      setIsImporting(false);
      toast({
        title: "Success!",
        description: `Imported ${result.wordsCreated} words into "${result.listName}"`,
      });
    },
    onError: (error: any) => {
      setIsImporting(false);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import vocabulary list",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (!listName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for this vocabulary list",
        variant: "destructive",
      });
      return;
    }

    if (!vocabularyText.trim()) {
      toast({
        title: "Error", 
        description: "Please paste your vocabulary list",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    importVocabularyList.mutate({
      listName: listName,
      vocabularyText: vocabularyText
    });
  };

  // Set current list mutation
  const setCurrentList = useMutation({
    mutationFn: async (listId: string) => {
      const response = await fetch(`/api/vocabulary-lists/${listId}/set-current`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to set current list");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary-lists"] });
      toast({
        title: "Success",
        description: "Current vocabulary list updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update current list",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading vocabulary lists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background overflow-auto">
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
            data-testid="button-back"
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
              <h2 className="text-2xl font-bold text-foreground dyslexia-text-xl">Vocabulary Lists</h2>
              <p className="text-muted-foreground dyslexia-text-base">
                Import and manage your weekly vocabulary lists
              </p>
            </div>
          </div>

          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button 
                className="tap-target bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="button-import"
              >
                <Plus className="mr-2 h-4 w-4" />
                Import New List
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Import Vocabulary List
                </DialogTitle>
                <p className="text-muted-foreground text-sm">
                  Paste your vocabulary list exactly as provided by the teacher
                </p>
              </DialogHeader>
              
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground dyslexia-text-base mb-2 block">
                    List Name *
                  </label>
                  <Input
                    placeholder="e.g., Week 1 Vocabulary, September Words, etc."
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    className="dyslexia-text-base"
                    data-testid="input-list-name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground dyslexia-text-base mb-2 block">
                    Vocabulary List *
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Copy and paste the entire vocabulary list from your teacher. Include word names and all definitions.
                  </p>
                  <Textarea
                    placeholder={`Example format:
urgent
(adj.) needing or demanding immediate action or attention

indicate
(v.) to point to or point out; to be a sign of; to state or express briefly

attractive
(adj.) pleasing to the eye, mind, or senses; having the power to draw attention`}
                    value={vocabularyText}
                    onChange={(e) => setVocabularyText(e.target.value)}
                    rows={15}
                    className="dyslexia-text-base font-mono text-sm"
                    data-testid="textarea-vocabulary"
                  />
                </div>

                {vocabularyText && (
                  <div className="bg-accent/50 p-4 rounded-lg">
                    <h4 className="font-medium text-foreground mb-2">Preview</h4>
                    <p className="text-sm text-muted-foreground">
                      {parseVocabularyText(vocabularyText).length} words detected
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {parseVocabularyText(vocabularyText).slice(0, 6).map((word, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {word.text} ({word.partOfSpeech})
                        </Badge>
                      ))}
                      {parseVocabularyText(vocabularyText).length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{parseVocabularyText(vocabularyText).length - 6} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowImportDialog(false)}
                    disabled={isImporting}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleImport}
                    disabled={isImporting || !listName.trim() || !vocabularyText.trim()}
                    className="bg-primary text-primary-foreground"
                    data-testid="button-import-submit"
                  >
                    {isImporting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Importing...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Import List
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Vocabulary Lists */}
        <div className="space-y-4">
          {vocabularyLists?.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <div className="p-4 bg-accent rounded-xl w-fit mx-auto mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Vocabulary Lists</h3>
                <p className="text-muted-foreground mb-4 dyslexia-text-base">
                  Import your first vocabulary list to get started
                </p>
                <Button 
                  onClick={() => setShowImportDialog(true)}
                  className="bg-primary text-primary-foreground"
                  data-testid="button-import-first"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Import Your First List
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vocabularyLists?.map((list) => (
                <Card key={list.id} className={`bg-card border-border transition-all hover:shadow-md ${list.isCurrent ? 'ring-2 ring-primary' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground dyslexia-text-base mb-1">
                          {list.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {list.wordCount} words
                        </p>
                      </div>
                      {list.isCurrent && (
                        <Badge className="bg-primary text-primary-foreground">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Current
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                      <Calendar className="w-3 h-3" />
                      {new Date(list.createdAt).toLocaleDateString()}
                    </div>

                    {!list.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentList.mutate(list.id)}
                        className="w-full border-border text-foreground hover:bg-accent"
                        data-testid={`button-set-current-${list.id}`}
                      >
                        Make Current
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}