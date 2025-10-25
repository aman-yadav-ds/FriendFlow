import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Loader2, Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import { ID, Query } from "appwrite";
import { databases, DATABASE_ID, COLLECTIONS, storage, BUCKET_ID } from "@/lib/appwrite";


interface UserProfile {
  userId: string;
  fullName: string;
  email: string;
  bio?: string;
  avatarId?: string;
  genres?: string[];
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileDocId, setProfileDocId] = useState<string | null>(null);

  const [genres, setGenres] = useState<string[]>([]);
  const [genreInput, setGenreInput] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Load user profile from Appwrite on mount
  useEffect(() => {
    if (user?.$id) {
      loadUserProfile();
    }
  }, [user?.$id]);

  const loadUserProfile = async () => {
    try {
      setIsLoading(true);
      
      // Query profile by email
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.equal('userId', user?.$id!)]
      );

      if (response.documents.length > 0) {
        const doc = response.documents[0];
        const profileData: UserProfile = {
          userId: doc.userId,
          fullName: doc.fullName,
          email: doc.email,
          bio: doc.bio,
          avatarId: doc.avatarId,
          genres: doc.genres
        };
        
        setProfile(profileData);
        setProfileDocId(doc.$id);
        setFullName(profileData.fullName || user?.name || "");
        setBio(profileData.bio || "");
        setGenres(profileData.genres || []);
        
        // Load avatar if exists
        if (profileData.avatarId) {
          const avatarPreview = storage.getFileView(
            BUCKET_ID,
            profileData.avatarId,
          );
          setAvatarUrl(avatarPreview.toString());
          console.log("Avatar URL:", avatarPreview.toString());
        }
      } else {
        // Create new profile if doesn't exist
        const newProfile = await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          ID.unique(),
          {
            fullName: user?.name || "",
            bio: "",
            genres: []
          }
        );
        setProfileDocId(newProfile.$id);
        setFullName(user?.name || "");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      toast({
        variant: "destructive",
        title: "Failed to load profile",
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Avatar must be less than 5MB",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Delete old avatar if exists
      if (profile?.avatarId) {
        try {
          await storage.deleteFile(BUCKET_ID, profile.avatarId);
        } catch (err) {
          console.log("No old avatar to delete or delete failed");
        }
      }

      // Upload new avatar
      const uploadedFile = await storage.createFile(
        BUCKET_ID,
        ID.unique(),
        file
      );

      // Update profile with new avatar ID
      if (profileDocId) {
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          profileDocId,
          { avatarId: uploadedFile.$id }
        );

        // Get preview URL
        const avatarPreview = storage.getFileView(
          BUCKET_ID,
          uploadedFile.$id,
        );
        
        setAvatarUrl(avatarPreview.toString());
        setProfile({ ...profile!, avatarId: uploadedFile.$id });
        
        toast({
          title: "Avatar updated!",
          description: "Your profile picture has been changed",
        });
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload avatar",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileDocId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Profile not loaded yet",
      });
      return;
    }

    setIsSaving(true);
    try {
      const updatedProfile = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        profileDocId,
        {
          fullName,
          bio: bio || "",
          genres: genres || ['']
        }
      );

      setProfile({
        ...profile!,
        fullName,
        bio
      });

      toast({
        title: "Profile updated!",
        description: "Your changes have been saved",
      });
    } catch (error) {
      console.error("Save error:", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Could not save changes",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddGenre = () => {
    const trimmedGenre = genreInput.trim();
    if (trimmedGenre && !genres.includes(trimmedGenre)) {
      setGenres([...genres, trimmedGenre]);
      setGenreInput("");
    }
  };

  const handleRemoveGenre = (genreToRemove: string) => {
    setGenres(genres.filter(g => g !== genreToRemove));
  };

  const handleGenreKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddGenre();
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b p-4">
        <div className="container mx-auto max-w-2xl flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold font-display">Profile</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account settings
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl p-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your profile details and avatar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4 pb-6 border-b">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="text-2xl">
                      {getInitials(fullName || user?.name || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <Label htmlFor="avatar" className="cursor-pointer">
                      <div className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUploading}
                          asChild
                        >
                          <span>
                            {isUploading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                Change Avatar
                              </>
                            )}
                          </span>
                        </Button>
                      </div>
                    </Label>
                    <input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      data-testid="input-avatar"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      JPG, PNG or GIF (max. 5MB)
                    </p>
                  </div>
                </div>

                {/* Profile Fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      data-testid="input-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      rows={4}
                      data-testid="input-bio"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="genres">Favorite Genres</Label>
                    <div className="flex gap-2">
                      <Input
                        id="genres"
                        type="text"
                        value={genreInput}
                        onChange={(e) => setGenreInput(e.target.value)}
                        onKeyDown={handleGenreKeyDown}
                        placeholder="Add a genre (e.g., Rock, Jazz, Pop)"
                        data-testid="input-genre"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddGenre}
                        disabled={!genreInput.trim()}
                        data-testid="button-add-genre"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {genres.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {genres.map((genre, index) => (
                          <div
                            key={index}
                            className="inline-flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                          >
                            <span>{genre}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveGenre(genre)}
                              className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                              data-testid={`button-remove-genre-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Press Enter or click + to add a genre
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1"
                    data-testid="button-save"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/dashboard")}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}