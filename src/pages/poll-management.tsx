import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ToggleLeft, ToggleRight, Users, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getGroupPolls,
  getPollVotes,
  deletePoll,
  activatePoll,
  deactivatePoll,
  getVoteCounts,
  parseMetadata,
} from "@/lib/pollHelpers";

interface PollWithVotes {
  $id: string;
  groupId: string;
  creatorId: string;
  creatorName: string;
  type: string;
  title: string;
  description?: string;
  image?: string;
  active: boolean;
  metadata?: string;
  votes: any[];
}

export default function PollManagement() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { toast } = useToast();
  
  // Get current user
  const currentUser = JSON.parse(localStorage.getItem("user") || '{"$id":"","name":"Guest"}');
  
  const [polls, setPolls] = useState<PollWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingPollId, setDeletingPollId] = useState<string | null>(null);
  const [togglingPollId, setTogglingPollId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Fetch polls and their votes
  useEffect(() => {
    const fetchPollsWithVotes = async () => {
      if (!groupId) return;
      
      try {
        setLoading(true);
        const fetchedPolls = await getGroupPolls(groupId);
        
        // Fetch votes for each poll
        const pollsWithVotes = await Promise.all(
          fetchedPolls.map(async (poll) => {
            const votes = await getPollVotes(poll.$id);
            return {
              ...poll,
              votes,
            };
          })
        );
        
        setPolls(pollsWithVotes as PollWithVotes[]);
      } catch (error) {
        console.error("Error fetching polls:", error);
        toast({
          variant: "destructive",
          title: "Failed to load polls",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPollsWithVotes();
  }, [groupId]);

  const handleDeletePoll = async (pollId: string) => {
    try {
      setDeletingPollId(pollId);
      await deletePoll(pollId, currentUser.$id);
      
      setPolls(polls.filter((p) => p.$id !== pollId));
      
      toast({
        title: "Poll deleted",
        description: "The poll has been deleted successfully",
      });
      setConfirmDeleteId(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to delete poll",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setDeletingPollId(null);
    }
  };

  const handleTogglePoll = async (pollId: string, currentActive: boolean) => {
    try {
      setTogglingPollId(pollId);
      
      if (currentActive) {
        await deactivatePoll(pollId, currentUser.$id);
      } else {
        await activatePoll(pollId, currentUser.$id);
      }
      
      // Update local state
      setPolls(polls.map((p) => {
        if (p.$id === pollId) {
          return { ...p, active: !currentActive };
        } else if (!currentActive) {
          // Deactivate other polls
          return { ...p, active: false };
        }
        return p;
      }));
      
      toast({
        title: currentActive ? "Poll deactivated" : "Poll activated",
        description: currentActive 
          ? "The poll is now inactive" 
          : "This poll is now active and visible to all members",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to toggle poll",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setTogglingPollId(null);
    }
  };

  const canManagePoll = (poll: PollWithVotes) => {
    return poll.creatorId === currentUser.$id;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (polls.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-2">No polls yet</h3>
        <p className="text-sm text-muted-foreground">
          Create your first poll to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {polls.map((poll) => {
          const counts = getVoteCounts(poll.votes);
          const totalVotes = counts.join + counts.maybe + counts.no;
          const metadata = poll.metadata ? parseMetadata(poll.metadata) : {};
          const isCreator = canManagePoll(poll);

          return (
            <motion.div
              key={poll.$id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3 }}
            >
              <Card className={poll.active ? "border-primary" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{poll.title}</CardTitle>
                        {poll.active && (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {poll.type}
                        </Badge>
                      </div>
                      <CardDescription>
                        Created by {poll.creatorName}
                      </CardDescription>
                    </div>
                    
                    {isCreator && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTogglePoll(poll.$id, poll.active)}
                          disabled={togglingPollId === poll.$id}
                        >
                          {togglingPollId === poll.$id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : poll.active ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDeleteId(poll.$id)}
                          disabled={deletingPollId === poll.$id}
                        >
                          {deletingPollId === poll.$id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {poll.image && (
                    <img
                      src={poll.image}
                      alt={poll.title}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  )}
                  
                  {poll.description && (
                    <p className="text-sm text-muted-foreground">{poll.description}</p>
                  )}
                  
                  {/* Metadata */}
                  {Object.keys(metadata).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {metadata.rating && (
                        <Badge variant="secondary">⭐ {metadata.rating}</Badge>
                      )}
                      {metadata.releaseDate && (
                        <Badge variant="outline">
                          {new Date(metadata.releaseDate).getFullYear()}
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {/* Vote counts */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total votes</span>
                      <span className="font-semibold">{totalVotes}</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 bg-green-50 dark:bg-green-950 rounded">
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {counts.join}
                        </div>
                        <div className="text-xs text-muted-foreground">Join</div>
                      </div>
                      
                      <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                        <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                          {counts.maybe}
                        </div>
                        <div className="text-xs text-muted-foreground">Maybe</div>
                      </div>
                      
                      <div className="text-center p-2 bg-red-50 dark:bg-red-950 rounded">
                        <div className="text-lg font-bold text-red-600 dark:text-red-400">
                          {counts.no}
                        </div>
                        <div className="text-xs text-muted-foreground">Not Joining</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the poll and all its votes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && handleDeletePoll(confirmDeleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}