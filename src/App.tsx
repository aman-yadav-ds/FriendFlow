import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Dashboard from "@/pages/dashboard";
import GroupChat from "@/pages/group-chat";
import PollCreation from "@/pages/poll-creation";
import PollManagement from "@/pages/poll-management";
import Profile from "@/pages/profile";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth/login" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/auth/login">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/auth/register">
        <PublicRoute component={Register} />
      </Route>

      {/* Protected Routes */}
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      
      {/* Group Chat Route */}
      <Route path="/groups/:id">
        <ProtectedRoute component={GroupChat} />
      </Route>
      
      {/* Poll Creation Route - for creating new polls */}
      <Route path="/groups/:id/poll">
        <ProtectedRoute component={PollCreation} />
      </Route>
      
      {/* Poll Management Route - for viewing/managing all polls */}
      <Route path="/groups/:id/polls">
        <ProtectedRoute component={PollManagement} />
      </Route>
      
      {/* User Profile Route */}
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>

      {/* Root Redirect */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      {/* 404 Not Found */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="event-planner-theme">
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;