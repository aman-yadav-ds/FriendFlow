import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
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
  ThumbsUp,
  Minus,
  ThumbsDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
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
import { databases, client, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { ID, Query } from "appwrite";

// Interfaces
interface Group {
  $id: string;
  name: string;
  members: string[];
  activeMembers?: string[];
  inviteCode?: string;
}

interface Message {
  $id: string;
  groupId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  text: string;
  createdAt: string;
  reactions?: Array<{ userId: string; emoji: string }>;
  pollId?: string;
  isSystemMessage?: boolean; // <-- ADDED
}

interface Poll {
  $id: string;
  groupId: string;
  title: string;
  description?: string;
  image?: string;
  type?: string;
  choices: string[];
  active: boolean;
  metadata?: Record<string, any>;
}

interface Vote {
  $id: string;
  pollId: string;
  userId: string;
  choice: string;
}

interface Reaction {
  $id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

interface User {
  $id: string;
  name: string;
  avatar?: string;
}

export default function GroupChat() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get current user from your auth context or localStorage
  const currentUser: User = JSON.parse(localStorage.getItem("user") || '{"$id":"","name":"Guest"}');
  
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch group data
  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const response = await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.GROUPS,
          groupId!
        );
        setGroup(response as unknown as Group);
      } catch (error) {
        console.error("Failed to fetch group:", error);
        toast({
          variant: "destructive",
          title: "Failed to load group",
        });
      }
    };

    if (groupId) {
      fetchGroup();
    }
  }, [groupId, toast]); // Added toast to dependency array

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setMessagesLoading(true);
        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.MESSAGES,
          [
            Query.equal("groupId", groupId!),
            Query.orderAsc("$createdAt"),
            Query.limit(100)
          ]
        );
        setMessages(response.documents as unknown as Message[]);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setMessagesLoading(false);
      }
    };

    if (groupId) {
      fetchMessages();
    }
  }, [groupId]);

  // Fetch polls
  useEffect(() => {
    const fetchPolls = async () => {
      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.POLLS,
          [
            Query.equal("groupId", groupId!),
            Query.orderDesc("$createdAt")
          ]
        );
        setPolls(response.documents as unknown as Poll[]);
      } catch (error) {
        console.error("Failed to fetch polls:", error);
      }
    };

    if (groupId) {
      fetchPolls();
    }
  }, [groupId]);

  // Fetch votes
  useEffect(() => {
    const fetchVotes = async () => {
      try {
        const activePoll = polls.find(p => p.active);
        if (!activePoll) return;

        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.VOTES,
          [Query.equal("pollId", activePoll.$id)]
        );
        setVotes(response.documents as unknown as Vote[]);
      } catch (error) {
        console.error("Failed to fetch votes:", error);
      }
    };

    fetchVotes();
  }, [polls]);

  // Add this useEffect somewhere after your messages/polls fetch
  useEffect(() => {
    const fetchReactions = async () => {
      if (!groupId) return;

      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.REACTIONS,
          [Query.orderAsc("$createdAt")]
        );
        setReactions(response.documents as unknown as Reaction[]);
      } catch (error) {
        console.error("Failed to fetch reactions:", error);
      }
    };

    fetchReactions();
  }, [groupId]);


  // Real-time subscriptions
  useEffect(() => {
    if (!groupId) return;

      const unsubscribe = client.subscribe(
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.REACTIONS}.documents`,
        (response) => {
          const payload = response.payload as any;
          if (response.events.includes("databases.*.collections.*.documents.*.create")) {
            setReactions((prev) => [...prev, payload as Reaction]);
          }
        }
      );

    // Subscribe to messages
    const unsubscribeMessages = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.MESSAGES}.documents`,
      (response) => {
        const payload = response.payload as any;
        
        if (payload.groupId === groupId) {
          if (response.events.includes("databases.*.collections.*.documents.*.create")) {
            setMessages((prev) => [...prev, payload as Message]);
          } else if (response.events.includes("databases.*.collections.*.documents.*.update")) {
            setMessages((prev) =>
              prev.map((msg) => (msg.$id === payload.$id ? payload as Message : msg))
            );
          }
        }
      }
    );

    // Subscribe to polls
    const unsubscribePolls = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.POLLS}.documents`,
      (response) => {
        const payload = response.payload as any;
        
        if (payload.groupId === groupId) {
          if (response.events.includes("databases.*.collections.*.documents.*.create")) {
            setPolls((prev) => [payload as Poll, ...prev]);
          } else if (response.events.includes("databases.*.collections.*.documents.*.update")) {
            setPolls((prev) =>
              prev.map((poll) => (poll.$id === payload.$id ? payload as Poll : poll))
            );
          }
        }
      }
    );

    // Subscribe to votes
    const unsubscribeVotes = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.VOTES}.documents`,
      (response) => {
        const payload = response.payload as any;
        
        if (response.events.includes("databases.*.collections.*.documents.*.create")) {
          setVotes((prev) => [...prev, payload as Vote]);
        } else if (response.events.includes("databases.*.collections.*.documents.*.update")) {
          setVotes((prev) =>
            prev.map((vote) => (vote.$id === payload.$id ? payload as Vote : vote))
          );
        }
      }
    );

    return () => {
      unsubscribeMessages();
      unsubscribePolls();
      unsubscribeVotes();
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
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.MESSAGES,
        ID.unique(),
        {
          groupId: groupId!,
          senderId: currentUser.$id,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar || "",
          text: message,
          reactions: [],
          isSystemMessage: false, // <-- ADDED
        }
      );
      setMessage("");
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
      // Check if user already reacted with the same emoji
      const existingReaction = reactions.find(
        (r) => r.messageId === messageId && r.userId === currentUser.$id && r.emoji === emoji
      );

      if (existingReaction) {
        // Delete the reaction
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTIONS.REACTIONS,
          existingReaction.$id
        );
      } else {
        // Add a new reaction
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.REACTIONS,
          ID.unique(),
          {
            messageId,
            userId: currentUser.$id,
            emoji,
          }
        );
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to add reaction",
      });
    }
  };


  const handleVote = async (pollId: string, choice: string) => {
    try {
      // Check if user already voted
      const existingVote = votes.find(
        (v) => v.pollId === pollId && v.userId === currentUser.$id
      );

      if (existingVote) {
        // Update existing vote
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.VOTES,
          existingVote.$id,
          { choice }
        );
      } else {
        // Create new vote
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.VOTES,
          ID.unique(),
          {
            pollId,
            userId: currentUser.$id,
            choice,
          }
        );
      }

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
    const inviteLink = `${group.inviteCode}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invite code copied!",
      description: "Share this code with your friends",
    });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getVoteCounts = (poll: Poll) => {
    const counts = { join: 0, maybe: 0, no: 0 };
    votes
      .filter((v) => v.pollId === poll.$id)
      .forEach((vote) => {
        if (vote.choice in counts) {
          counts[vote.choice as keyof typeof counts]++;
        }
      });
    return counts;
  };

  const userVote = (poll: Poll) => {
    return votes.find((v) => v.pollId === poll.$id && v.userId === currentUser.$id);
  };

  const activePoll = polls.find((p) => p.active);

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
            Copy Invite Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/groups/${groupId}/poll`)}
            data-testid="button-create-poll"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            New Poll
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/groups/${groupId}/polls`)}
            data-testid="button-view-polls"
          >
            <Users className="h-4 w-4 mr-2" />
            Polls
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
                    const isOwn = msg.senderId === currentUser.$id;
                    const showAvatar = index === 0 || messages[index - 1].senderId !== msg.senderId;
                    const isSystem = msg.isSystemMessage === true; // <-- NEW

                    // --- NEW: Render System Messages ---
                    if (isSystem) {
                      return (
                        <motion.div
                          key={msg.$id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-center my-2"
                        >
                          <div className="text-xs text-muted-foreground bg-card px-3 py-1 rounded-full shadow-sm">
                            {msg.text}
                          </div>
                        </motion.div>
                      );
                    }
                    
                    // --- Regular Message Render ---
                    return (
                      <motion.div
                        key={msg.$id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn("flex gap-3", isOwn && "flex-row-reverse")}
                      >
                        {showAvatar && !isOwn && (
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={msg.senderAvatar || undefined} />
                            <AvatarFallback>{getInitials(msg.senderName || "User")}</AvatarFallback>
                          </Avatar>
                        )}
                        {!showAvatar && !isOwn && <div className="w-10" />}
                        
                        <div className={cn("flex flex-col", isOwn && "items-end")}>
                          {showAvatar && !isOwn && (
                            <p className="text-xs text-muted-foreground mb-1 px-4">
                              {msg.senderName}
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
                            {msg.pollId && (
                              <Card className="mt-2 p-3">
                                <p className="text-sm font-medium mb-1">Poll attached</p>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const poll = polls.find(p => p.$id === msg.pollId);
                                    if (poll) setSelectedPoll(poll);
                                  }}
                                >
                                  View Poll
                                </Button>
                              </Card>
                            )}
                          </div>
                          {/* --- Reactions Display --- */}
                          <div className="flex flex-col gap-1 mt-1 px-2">
                            {reactions.filter(r => r.messageId === msg.$id).length > 0 && (
                              <div className="flex gap-1">
                                {Object.entries(
                                  reactions
                                    .filter(r => r.messageId === msg.$id)
                                    .reduce((acc, r) => {
                                      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                      return acc;
                                    }, {} as Record<string, number>)
                                ).map(([emoji, count]) => (
                                  <Badge
                                    key={emoji}
                                    variant="secondary"
                                    className="text-xs px-2 py-0 h-6 cursor-pointer hover:bg-secondary/80"
                                    onClick={() => handleReaction(msg.$id, emoji)}
                                  >
                                    {emoji} {count}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {/* --- Emoji Picker --- */}
                            <div className="flex gap-1">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 px-2">
                                    <Smile className="h-3 w-3" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-auto p-0 border-0"
                                  align={isOwn ? "end" : "start"}
                                  side="top"
                                  sideOffset={8}
                                  forceMount
                                >
                                  <Picker
                                    data={data}
                                    onEmojiSelect={(emoji: any) =>{
                                      console.log("Selected emoji:", emoji.native, "for message", msg.$id);
                                      handleReaction(msg.$id, emoji.native)
                                    }}
                                    theme={
                                      document.documentElement.classList.contains("dark")
                                        ? "dark"
                                        : "light"
                                    }
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
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
                        onClick={() => handleVote(activePoll.$id, choice)}
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