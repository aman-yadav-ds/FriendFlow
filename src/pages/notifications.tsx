import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Bell, Check, MapPin, Calendar, Clock, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { databases, client, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { Query } from "appwrite";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Notification {
  $id: string;
  userId: string;
  text: string;
  metadata?: string;
  read: boolean;
  type: string;
  $createdAt: string;
}

interface NotificationMetadata {
  groupId?: string;
  groupName?: string;
  pollId?: string;
  place?: string;
  address?: string;
  date?: string;
  time?: string;
  attendees?: number;
}

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  
  const currentUser = JSON.parse(localStorage.getItem("user") || '{"$id":""}');

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentUser.$id) return;

      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.NOTIFICATIONS,
          [
            Query.equal("userId", currentUser.$id),
            Query.orderDesc("$createdAt"),
            Query.limit(50)
          ]
        );
        setNotifications(response.documents as unknown as Notification[]);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    };

    fetchNotifications();
  }, [currentUser.$id]);

  // Real-time subscriptions
  useEffect(() => {
    if (!currentUser.$id) return;

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.NOTIFICATIONS}.documents`,
      (response) => {
        const payload = response.payload as any;
        
        if (payload.userId === currentUser.$id) {
          if (response.events.includes("databases.*.collections.*.documents.*.create")) {
            setNotifications((prev) => [payload as Notification, ...prev]);
            
            // Show toast for new notification
            toast({
              title: "New Plan Confirmation! 🎉",
              description: "You have a new plan notification",
            });
          } else if (response.events.includes("databases.*.collections.*.documents.*.update")) {
            setNotifications((prev) =>
              prev.map((notif) => (notif.$id === payload.$id ? payload as Notification : notif))
            );
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser.$id, toast]);

  const markAsRead = async (notificationId: string) => {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        notificationId,
        { read: true }
      );
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      
      await Promise.all(
        unreadNotifications.map(notif =>
          databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.NOTIFICATIONS,
            notif.$id,
            { read: true }
          )
        )
      );

      toast({
        title: "All notifications marked as read",
      });
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      toast({
        variant: "destructive",
        title: "Failed to mark notifications as read",
      });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Your plan confirmations and updates
          </SheetDescription>
        </SheetHeader>

        <div className="flex justify-end mt-4 mb-2">
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead}
              className="text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all as read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Bell className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <h3 className="font-semibold mb-2">No notifications yet</h3>
              <p className="text-sm text-muted-foreground">
                You'll receive confirmations when plans are locked
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {notifications.map((notification) => {
                  const metadata: NotificationMetadata = notification.metadata 
                    ? JSON.parse(notification.metadata) 
                    : {};

                  return (
                    <motion.div
                      key={notification.$id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <Card 
                        className={cn(
                          "overflow-hidden transition-all hover:shadow-md cursor-pointer",
                          !notification.read && "border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                        )}
                        onClick={() => !notification.read && markAsRead(notification.$id)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-lg">🎉</span>
                              </div>
                              <div className="flex-1">
                                <CardTitle className="text-sm font-semibold">
                                  {metadata.place || "Plan Confirmed"}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(notification.$createdAt)}
                                </p>
                              </div>
                            </div>
                            {!notification.read && (
                              <Badge variant="default" className="text-xs">New</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {metadata.address && (
                            <div className="flex items-start gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{metadata.address}</span>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2">
                            {metadata.date && (
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{metadata.date}</span>
                              </div>
                            )}
                            {metadata.time && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{metadata.time}</span>
                              </div>
                            )}
                          </div>

                          {metadata.groupName && (
                            <div className="flex items-center gap-2 text-sm pt-2 border-t">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {metadata.groupName}
                              </span>
                              {metadata.attendees && (
                                <Badge variant="secondary" className="ml-auto">
                                  {metadata.attendees} attending
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}