import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowLeft,
  Send,
  Smile,
  Users,
  Copy,
  BarChart3,
  LogOut,
  ThumbsUp,
  Minus,
  ThumbsDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { MessageWithUser, GroupWithMembers, PollWithVotes } from "@shared/schema";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function GroupChat() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<PollWithVotes | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  const { data: group } = useQuery<GroupWithMembers>({
    queryKey: ["/api/groups", groupId],
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<MessageWithUser[]>({
    queryKey: ["/api/groups", groupId, "messages"],
  });

  const { data: polls } = useQuery<PollWithVotes[]>({
    queryKey: ["/api/groups", groupId, "polls"],
  });

  const activePoll = polls?.find((p) => p.active);

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws.current = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.current.onopen = () => {
      // Authenticate with userId first
      if (user?.id) {
        ws.current?.send(JSON.stringify({ type: "auth", userId: user.id }));
        // Then join the group
        setTimeout(() => {
          ws.current?.send(JSON.stringify({ type: "join", groupId }));
        }, 100);
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message" || data.type === "reaction" || data.type === "vote") {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "polls"] });
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [groupId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    try {
      await apiRequest("POST", `/api/groups/${groupId}/messages`, {
        text: message,
      });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await apiRequest("POST", `/api/messages/${messageId}/reactions`, { emoji });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to add reaction",
      });
    }
  };

  const handleVote = async (pollId: string, choice: string) => {
    try {
      await apiRequest("POST", `/api/polls/${pollId}/vote`, { choice });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "polls"] });
      toast({
        title: "Vote recorded!",
        description: `You voted: ${choice}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to vote",
      });
    }
  };

  const handleCopyInvite = () => {
    if (!group?.inviteCode) return;
    const inviteLink = `${window.location.origin}/invite/${group.inviteCode}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invite link copied!",
      description: "Share this link with your friends",
    });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getVoteCounts = (poll: PollWithVotes) => {
    const counts = { join: 0, maybe: 0, no: 0 };
    poll.votes?.forEach((vote) => {
      if (vote.choice in counts) {
        counts[vote.choice as keyof typeof counts]++;
      }
    });
    return counts;
  };

  const userVote = (poll: PollWithVotes) => {
    return poll.votes?.find((v) => v.userId === user?.id);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">{group?.name || "Loading..."}</h1>
            <p className="text-xs text-muted-foreground">
              {group?.members?.length || 0} members
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyInvite}
            data-testid="button-invite"
          >
            <Copy className="h-4 w-4 mr-2" />
            Invite
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/groups/${groupId}/poll`)}
            data-testid="button-create-poll"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Poll
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {messagesLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "" : "flex-row-reverse")}>
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-20 w-64 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : messages && messages.length > 0 ? (
              <div className="space-y-4">
                <AnimatePresence>
                  {messages.map((msg, index) => {
                    const isOwn = msg.userId === user?.id;
                    const showAvatar = index === 0 || messages[index - 1].userId !== msg.userId;
                    
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn("flex gap-3", isOwn && "flex-row-reverse")}
                      >
                        {showAvatar && !isOwn && (
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={msg.user.avatar || undefined} />
                            <AvatarFallback>{getInitials(msg.user.name)}</AvatarFallback>
                          </Avatar>
                        )}
                        {!showAvatar && !isOwn && <div className="w-10" />}
                        
                        <div className={cn("flex flex-col", isOwn && "items-end")}>
                          {showAvatar && !isOwn && (
                            <p className="text-xs text-muted-foreground mb-1 px-4">
                              {msg.user.name}
                            </p>
                          )}
                          <div
                            className={cn(
                              "max-w-lg rounded-2xl px-4 py-3",
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-card rounded-tl-sm"
                            )}
                          >
                            <p className="text-sm">{msg.text}</p>
                            {msg.poll && (
                              <Card className="mt-2 p-3">
                                <p className="text-sm font-medium mb-1">{msg.poll.title}</p>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setSelectedPoll(msg.poll as PollWithVotes)}
                                >
                                  View Poll
                                </Button>
                              </Card>
                            )}
                          </div>
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex gap-1 mt-1 px-2">
                              {Object.entries(
                                msg.reactions.reduce((acc, r) => {
                                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                  return acc;
                                }, {} as Record<string, number>)
                              ).map(([emoji, count]) => (
                                <Badge
                                  key={emoji}
                                  variant="secondary"
                                  className="text-xs px-2 py-0 h-6 cursor-pointer hover-elevate"
                                  onClick={() => handleReaction(msg.id, emoji)}
                                >
                                  {emoji} {count}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1 mt-1">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2">
                                  <Smile className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border-0" align={isOwn ? "end" : "start"}>
                                <Picker
                                  data={data}
                                  onEmojiSelect={(emoji: any) => handleReaction(msg.id, emoji.native)}
                                  theme={document.documentElement.classList.contains("dark") ? "dark" : "light"}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No messages yet</h3>
                <p className="text-sm text-muted-foreground">
                  Be the first to say hello!
                </p>
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t p-4 bg-background/95 backdrop-blur flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-testid="button-emoji-picker"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-0" align="start">
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: any) => {
                      setMessage((prev) => prev + emoji.native);
                      setShowEmojiPicker(false);
                    }}
                    theme={document.documentElement.classList.contains("dark") ? "dark" : "light"}
                  />
                </PopoverContent>
              </Popover>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                data-testid="input-message"
              />
              <Button
                type="submit"
                disabled={isSending || !message.trim()}
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Right Sidebar - Active Poll */}
        {activePoll && (
          <div className="w-80 border-l p-4 hidden lg:block overflow-y-auto">
            <h3 className="font-semibold mb-4">Active Poll</h3>
            <Card className="overflow-hidden">
              {activePoll.image && (
                <div className="relative aspect-video">
                  <img
                    src={activePoll.image}
                    alt={activePoll.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold mb-1">{activePoll.title}</h4>
                  {activePoll.description && (
                    <p className="text-sm text-muted-foreground">{activePoll.description}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  {[
                    { choice: "join", label: "Join", icon: ThumbsUp, variant: "default" as const },
                    { choice: "maybe", label: "Maybe", icon: Minus, variant: "secondary" as const },
                    { choice: "no", label: "Not Joining", icon: ThumbsDown, variant: "outline" as const },
                  ].map(({ choice, label, icon: Icon, variant }) => {
                    const counts = getVoteCounts(activePoll);
                    const voted = userVote(activePoll);
                    const isSelected = voted?.choice === choice;
                    
                    return (
                      <Button
                        key={choice}
                        variant={isSelected ? "default" : variant}
                        className="w-full justify-between"
                        onClick={() => handleVote(activePoll.id, choice)}
                        data-testid={`button-vote-${choice}`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </span>
                        <Badge variant="secondary">
                          {counts[choice as keyof typeof counts]}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setSelectedPoll(activePoll)}
                >
                  View Details
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Poll Details Modal */}
      <Dialog open={!!selectedPoll} onOpenChange={() => setSelectedPoll(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedPoll?.title}</DialogTitle>
            <DialogDescription>
              {selectedPoll?.type === "movie" ? "Movie" : "Place"} Poll
            </DialogDescription>
          </DialogHeader>
          {selectedPoll && (
            <div className="space-y-4">
              {selectedPoll.image && (
                <img
                  src={selectedPoll.image}
                  alt={selectedPoll.title}
                  className="w-full rounded-lg"
                />
              )}
              {selectedPoll.description && (
                <p className="text-sm">{selectedPoll.description}</p>
              )}
              {selectedPoll.metadata && typeof selectedPoll.metadata === 'object' && (
                <div className="text-sm space-y-1">
                  {Object.entries(selectedPoll.metadata as Record<string, any>).map(([key, value]) => (
                    <p key={key}>
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}: </span>
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
