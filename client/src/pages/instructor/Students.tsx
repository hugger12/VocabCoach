import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus, Eye, EyeOff, ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import huggerLogo from "@assets/Hugger-Digital_logo_1755580645400.png";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  pin: string;
  grade?: number;
  isActive: boolean;
  createdAt: string;
}

export function Students() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newStudent, setNewStudent] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    grade: "",
    birthMonth: "",
    birthYear: "",
  });
  const [showPins, setShowPins] = useState<{[key: string]: boolean}>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch students
  const { data: students, isLoading } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  // Add student mutation
  const addStudent = useMutation({
    mutationFn: async (studentData: any) => {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentData),
      });
      if (!response.ok) throw new Error("Failed to create student");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      setShowAddDialog(false);
      setNewStudent({
        firstName: "",
        lastName: "",
        displayName: "",
        grade: "",
        birthMonth: "",
        birthYear: "",
      });
      toast({
        title: "Student Added",
        description: "Student account created successfully with a new PIN.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create student",
        variant: "destructive",
      });
    },
  });

  const handleAddStudent = () => {
    if (!newStudent.firstName) {
      toast({
        title: "Required Field",
        description: "First name is required",
        variant: "destructive",
      });
      return;
    }

    addStudent.mutate({
      ...newStudent,
      grade: newStudent.grade ? parseInt(newStudent.grade) : undefined,
      birthMonth: newStudent.birthMonth ? parseInt(newStudent.birthMonth) : undefined,
      birthYear: newStudent.birthYear ? parseInt(newStudent.birthYear) : undefined,
    });
  };

  const togglePinVisibility = (studentId: string) => {
    setShowPins(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading students...</p>
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
            <p className="text-muted-foreground dyslexia-text-base">Student Management</p>
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
              <Users className="h-8 w-8 text-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground dyslexia-text-xl">Students</h2>
              <p className="text-muted-foreground dyslexia-text-base">
                Manage student accounts and PINs
              </p>
            </div>
          </div>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="tap-target bg-primary text-primary-foreground hover:bg-primary/90">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add New Student</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">First Name *</label>
                  <Input
                    value={newStudent.firstName}
                    onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})}
                    placeholder="Enter first name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Last Name</label>
                  <Input
                    value={newStudent.lastName}
                    onChange={(e) => setNewStudent({...newStudent, lastName: e.target.value})}
                    placeholder="Enter last name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Display Name</label>
                  <Input
                    value={newStudent.displayName}
                    onChange={(e) => setNewStudent({...newStudent, displayName: e.target.value})}
                    placeholder="Name shown to student (optional)"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Grade</label>
                    <Input
                      type="number"
                      value={newStudent.grade}
                      onChange={(e) => setNewStudent({...newStudent, grade: e.target.value})}
                      placeholder="3"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Birth Year</label>
                    <Input
                      type="number"
                      value={newStudent.birthYear}
                      onChange={(e) => setNewStudent({...newStudent, birthYear: e.target.value})}
                      placeholder="2015"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <Button 
                    onClick={handleAddStudent}
                    disabled={addStudent.isPending}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {addStudent.isPending ? "Creating..." : "Create Student"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Students Grid */}
        {students && students.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {students.map((student) => (
              <Card key={student.id} className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground dyslexia-text-lg">
                    {student.displayName || `${student.firstName} ${student.lastName}`}
                  </CardTitle>
                  {student.grade && (
                    <p className="text-sm text-muted-foreground">Grade {student.grade}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">PIN:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg text-foreground">
                        {showPins[student.id] ? student.pin : "••••"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => togglePinVisibility(student.id)}
                        className="h-8 w-8 p-0"
                      >
                        {showPins[student.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      student.isActive 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                    }`}>
                      {student.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(student.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Students Yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your first student to get started with vocabulary learning.
            </p>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add First Student
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}