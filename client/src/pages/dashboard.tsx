import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Plus, Users, Search, LogOut, User as UserIcon, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GroupWithMembers } from "@shared/schema";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: groups, isLoading } = useQuery<GroupWithMembers[]>({
    queryKey: ["/api/groups"],
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/auth/login");
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      await apiRequest("POST", "/api/groups", { name: newGroupName });
      toast({
        title: "Group created!",
        description: `${newGroupName} is ready for planning.`,
      });
      setNewGroupName("");
      setCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create group",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const filteredGroups = groups?.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              data-testid="button-profile"
            >
              <UserIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="button-logout"
            >
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
              data-testid="input-search"
            />
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-group">
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
                      data-testid="input-group-name"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isCreating} data-testid="button-submit-group">
                    {isCreating ? "Creating..." : "Create Group"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Groups Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredGroups && filteredGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card
                  className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                  onClick={() => setLocation(`/groups/${group.id}`)}
                  data-testid={`card-group-${group.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1">{group.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {group.members?.length || 0} members
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex -space-x-2">
                      {group.members?.slice(0, 5).map((member) => (
                        <Avatar key={member.userId} className="h-8 w-8 border-2 border-background">
                          <AvatarImage src={member.user.avatar || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(member.user.name)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {(group.members?.length || 0) > 5 && (
                        <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium">
                          +{(group.members?.length || 0) - 5}
                        </div>
                      )}
                    </div>
                    {group.lastMessage && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        <span className="truncate">{group.lastMessage.text}</span>
                      </div>
                    )}
                    <Button variant="secondary" className="w-full" size="sm">
                      Open Group
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No groups found" : "No groups yet"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? "Try a different search term"
                : "Create your first group to start planning events"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Group
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
