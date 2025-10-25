import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { account, databases, COLLECTIONS, DATABASE_ID } from "@/lib/appwrite";
import { ID } from "appwrite";
import { useAuth } from "@/lib/auth";


export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Step 1: Create account
      const newAccount = await account.create(ID.unique(), email, password, name);

      await account.createEmailPasswordSession(email, password);
      
      const currentUser = await account.get();
      setUser(currentUser);
      // Step 2: Create user profile in database
      try {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          ID.unique(),
          {
            userId: newAccount.$id,
            email: email,
            fullName: name,
          }
        );
      } catch (profileError) {
        console.error("Failed to create profile:", profileError);
        // Continue even if profile creation fails
        // Profile will be created on first visit to profile page
      }

      toast({
        title: "Account created!",
        description: "Welcome to FriendFlow!",
      });

      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Could not create account. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-3xl font-bold text-center font-display">Create Account</CardTitle>
            <CardDescription className="text-center">
              Join FriendFlow and start planning events with friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters
                </p>
              </div>
              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/auth/login")}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}