import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Film, MapPin, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { ID, Permission, Role } from "appwrite";

interface MovieResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
}

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  photos?: Array<{ photo_reference: string }>;
  rating?: number;
  types?: string[];
}

// API configuration
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

export default function PollCreation() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get current user from localStorage or your auth context
  const currentUser = JSON.parse(localStorage.getItem("user") || '{"$id":"","name":"Guest"}');
  
  const [pollType, setPollType] = useState<"movie" | "place">("movie");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const searchMovies = async () => {
    if (!searchQuery.trim()) return;
    
    if (!TMDB_API_KEY) {
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "TMDB API key is not configured",
      });
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}&language=en-US&page=1&include_adult=false`
      );
      
      if (!response.ok) {
        throw new Error("Failed to search movies");
      }
      
      const data = await response.json();
      setMovieResults(data.results || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: "Could not search movies. Please try again.",
      });
      console.error("Movie search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const searchPlaces = async () => {
    if (!searchQuery.trim()) return;
    
    if (!GOOGLE_PLACES_API_KEY) {
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "Google Places API key is not configured",
      });
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${GOOGLE_PLACES_BASE_URL}/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${GOOGLE_PLACES_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to search places");
      }
      
      const data = await response.json();
      
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(data.error_message || "Places search failed");
      }
      
      setPlaceResults(data.results || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: "Could not search places. Please try again.",
      });
      console.error("Places search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (pollType === "movie") {
      searchMovies();
    } else {
      searchPlaces();
    }
  };

  const createMoviePoll = async (movie: MovieResult) => {
    setIsCreating(true);
    try {
      // First, check if there's already an active poll in this group
      const existingPolls = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.POLLS,
        [
          // Query for active polls in this group
        ]
      );

      // Deactivate any existing active polls
      for (const poll of existingPolls.documents) {
        if ((poll as any).active && (poll as any).groupId === groupId) {
          await databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.POLLS,
            (poll as any).$id,
            { active: false }
          );
        }
      }

      // Create the new poll with permissions
      const pollData = {
        groupId: groupId!,
        creatorId: currentUser.$id,
        creatorName: currentUser.name,
        type: "movie",
        externalId: movie.id.toString(),
        title: movie.title,
        description: movie.overview || "",
        image: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : "",
        choices: ["join", "maybe", "no"], // Standard voting choices
        active: true,
        metadata: JSON.stringify({
          releaseDate: movie.release_date,
          rating: movie.vote_average,
        }),
      };

      const newPoll = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.POLLS,
        ID.unique(),
        pollData,
        [
          Permission.read(Role.any()), // Anyone can read
          Permission.update(Role.user(currentUser.$id)), // Only creator can update
          Permission.delete(Role.user(currentUser.$id)), // Only creator can delete
        ]
      );

      // Create a message in the group chat announcing the poll
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.MESSAGES,
        ID.unique(),
        {
          groupId: groupId!,
          senderId: currentUser.$id,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar || "",
          text: `📊 New poll created: ${movie.title}`,
          reactions: [],
          pollId: newPoll.$id,
        }
      );

      toast({
        title: "Poll created!",
        description: `Created poll for ${movie.title}`,
      });
      
      setLocation(`/groups/${groupId}`);
    } catch (error) {
      console.error("Error creating poll:", error);
      toast({
        variant: "destructive",
        title: "Failed to create poll",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const createPlacePoll = async (place: PlaceResult) => {
    setIsCreating(true);
    try {
      // First, check if there's already an active poll in this group
      const existingPolls = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.POLLS,
        []
      );

      // Deactivate any existing active polls
      for (const poll of existingPolls.documents) {
        if ((poll as any).active && (poll as any).groupId === groupId) {
          await databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.POLLS,
            (poll as any).$id,
            { active: false }
          );
        }
      }

      const photoUrl = place.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_PLACES_API_KEY}`
        : "";

      // Create the new poll with permissions
      const pollData = {
        groupId: groupId!,
        creatorId: currentUser.$id,
        creatorName: currentUser.name,
        type: "place",
        externalId: place.place_id,
        title: place.name,
        description: place.formatted_address || "",
        image: photoUrl,
        choices: ["join", "maybe", "no"], // Standard voting choices
        active: true,
        metadata: {
          rating: place.rating || 0,
          types: place.types || [],
        },
      };

      const newPoll = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.POLLS,
        ID.unique(),
        pollData,
        [
          Permission.read(Role.any()), // Anyone can read
          Permission.update(Role.user(currentUser.$id)), // Only creator can update
          Permission.delete(Role.user(currentUser.$id)), // Only creator can delete
        ]
      );

      // Create a message in the group chat announcing the poll
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.MESSAGES,
        ID.unique(),
        {
          groupId: groupId!,
          senderId: currentUser.$id,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar || "",
          text: `📊 New poll created: ${place.name}`,
          createdAt: new Date().toISOString(),
          reactions: [],
          pollId: newPoll.$id,
        }
      );

      toast({
        title: "Poll created!",
        description: `Created poll for ${place.name}`,
      });
      
      setLocation(`/groups/${groupId}`);
    } catch (error) {
      console.error("Error creating poll:", error);
      toast({
        variant: "destructive",
        title: "Failed to create poll",
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b p-4">
        <div className="container mx-auto max-w-4xl flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/groups/${groupId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Create Poll</h1>
            <p className="text-sm text-muted-foreground">
              Search for a movie or place to vote on
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl p-4 py-8">
        <Tabs value={pollType} onValueChange={(v) => setPollType(v as "movie" | "place")}>
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="movie" data-testid="tab-movie">
              <Film className="mr-2 h-4 w-4" />
              Movie
            </TabsTrigger>
            <TabsTrigger value="place" data-testid="tab-place">
              <MapPin className="mr-2 h-4 w-4" />
              Place
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    pollType === "movie"
                      ? "Search for movies..."
                      : "Search for places..."
                  }
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Button type="submit" disabled={isSearching} data-testid="button-search">
                {isSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </form>

          <TabsContent value="movie">
            {movieResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {movieResults.map((movie, index) => (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="flex gap-4 p-4">
                        {movie.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                            alt={movie.title}
                            className="w-24 h-36 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 space-y-2">
                          <div>
                            <h3 className="font-semibold line-clamp-2">{movie.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {movie.release_date?.split("-")[0]}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {movie.overview}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              ⭐ {movie.vote_average?.toFixed(1)}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => createMoviePoll(movie)}
                            disabled={isCreating}
                            className="w-full"
                            data-testid={`button-create-poll-${movie.id}`}
                          >
                            {isCreating ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              "Create Poll"
                            )}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Film className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isSearching ? "Searching..." : "Search for a movie to create a poll"}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="place">
            {placeResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {placeResults.map((place, index) => (
                  <motion.div
                    key={place.place_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{place.name}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {place.formatted_address}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {place.rating && (
                          <Badge variant="secondary">⭐ {place.rating}</Badge>
                        )}
                        {place.types && place.types.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {place.types.slice(0, 3).map((type) => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button
                          size="sm"
                          onClick={() => createPlacePoll(place)}
                          disabled={isCreating}
                          className="w-full"
                          data-testid={`button-create-poll-${place.place_id}`}
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create Poll"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isSearching ? "Searching..." : "Search for a place to create a poll"}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}