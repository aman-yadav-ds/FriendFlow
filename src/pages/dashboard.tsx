import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { account, databases } from "@/lib/appwrite";
import { Permission, Query, Role } from "appwrite"; // for convenience
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Plus, Search, LogOut, User as UserIcon, MessageCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID!;
const COLLECTION_ID = "groups";

interface Group {
  $id: string;
  name: string;
  members: string[];
  creatorId: string;
  lastMessage?: string;
  activeMembers?: string[];
  unseenMessages?: number;
}


export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Fetch all groups that the user has read access to
  const fetchGroups = async () => {
    if (!user) {
      console.warn("User not logged in, cannot fetch groups");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.or([
          Query.equal("creatorId", user.$id),
          Query.contains("members", [user.$id]),
        ]),
      ]);
      setGroups(response.documents as unknown as Group[]);

    } catch (err) {
      console.error("Error fetching groups:", err);
      toast({
        variant: "destructive",
        title: "Failed to fetch groups",
        description: "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    if (!user) return; // ⚠️ don't fetch if user isn't logged in
    fetchGroups();
  }, [user]);


  const handleLogout = async () => {
    await logout();
    setLocation("/auth/login");
  };

  // Create a new group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      // Create group document with proper permissions
      await databases.createDocument(
        DATABASE_ID,
        COLLECTION_ID,
        "unique()", // document ID
        {
          name: newGroupName,
          members: [user!.$id],
          creatorId: user!.$id,
          lastMessage: JSON.stringify({ text: "", timestamp: Date.now() }),
          inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        },
        [
          Permission.write(Role.user(user!.$id)), // allow anyone to find the group
          Permission.read(Role.user(user!.$id)),  // allow this user to read
          Permission.update(Role.user(user!.$id)) // allow this user to update/delete
        ]
      );


      toast({ title: "Group created!", description: `${newGroupName} is ready.` });
      setNewGroupName("");
      setCreateDialogOpen(false);
      fetchGroups();
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Failed to create group",
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      // Attempt to delete the document
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, groupId);

      toast({
        title: "Group deleted!",
        description: "Your group has been successfully deleted.",
      });

      // Refresh the group list
      fetchGroups();
    } catch (err: any) {
      // Appwrite will throw an error if the current user lacks permission
      toast({
        variant: "destructive",
        title: "Failed to delete group",
        description:
          err.message ||
          "You do not have permission to delete this group. Only the creator can delete it.",
      });
      console.error("Delete group error:", err);
    }
  };

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold font-display">Event Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")}>
              <UserIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 font-display">
            Welcome back, {user?.name}!
          </h2>
          <p className="text-muted-foreground">
            Manage your groups and plan amazing events with friends
          </p>
        </div>

        {/* Search and Create */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Group</DialogTitle>
                <DialogDescription>
                  Start a new group to plan events with your friends
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateGroup}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="groupName">Group Name</Label>
                    <Input
                      id="groupName"
                      placeholder="Weekend Warriors, Movie Night, etc."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Creating..." : "Create Group"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Groups Grid */}
        {isLoading ? (
          <div>Loading...</div>
        ) : filteredGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group, index) => {
              const members = group.members || "[]";
              const lastMessageObj = group.lastMessage ? JSON.parse(group.lastMessage) : null;

              return (
                <motion.div
                  key={group.$id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card
                    onClick={() => setLocation(`/groups/${group.$id}`)}
                    className="hover:shadow-lg transition-all duration-200 cursor-pointer rounded-2xl border bg-card/80 backdrop-blur-sm relative"
                  >
                    {/* Unseen Message Badge */}
                    {group.unseenMessages && group.unseenMessages > 0 && (
                      <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded-full shadow-sm">
                        {group.unseenMessages} new
                      </div>
                    )}

                    <CardHeader className="flex justify-between items-start pb-2">
                      <div>
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          {group.name}
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                          Created by {group.creatorId === user?.$id ? "you" : group.creatorId}
                        </CardDescription>
                      </div>

                      {user?.$id === group.creatorId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group.$id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                      {/* Member Avatars */}
                      <div className="flex -space-x-2 overflow-hidden">
                        {group.members?.slice(0, 5).map((memberId) => {
                          const isActive = group.activeMembers?.includes(memberId);
                          return (
                            <div key={memberId} className="relative">
                              <Avatar className="h-8 w-8 border-2 border-background">
                                <AvatarFallback>{memberId.slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              {isActive && (
                                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background"></span>
                              )}
                            </div>
                          );
                        })}
                        {group.members?.length > 5 && (
                          <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium">
                            +{group.members.length - 5}
                          </div>
                        )}
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 text-center text-sm text-muted-foreground">
                        <div>
                          <p>Total</p>
                          <p className="text-foreground font-medium">{group.members?.length || 0}</p>
                        </div>
                        <div>
                          <p>Active</p>
                          <p className="text-green-600 font-medium">{group.activeMembers?.length || 0}</p>
                        </div>
                        <div>
                          <p>Unseen</p>
                          <p className="text-blue-600 font-medium">{group.unseenMessages || 0}</p>
                        </div>
                      </div>

                      {/* Last Message */}
                      {group.lastMessage && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-2">
                          <MessageCircle className="h-3 w-3" />
                          <span className="truncate">
                            {JSON.parse(group.lastMessage)?.text || ""}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first group to start planning events
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Group
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
