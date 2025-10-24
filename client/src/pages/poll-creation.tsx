import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Film, MapPin, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export default function PollCreation() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pollType, setPollType] = useState<"movie" | "place">("movie");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const searchMovies = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/external/tmdb/search?query=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setMovieResults(data.results || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: "Could not search movies",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const searchPlaces = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/external/places/search?query=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setPlaceResults(data.results || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: "Could not search places",
      });
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
      await apiRequest("POST", `/api/groups/${groupId}/polls`, {
        type: "movie",
        externalId: movie.id.toString(),
        title: movie.title,
        description: movie.overview,
        image: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null,
        metadata: {
          releaseDate: movie.release_date,
          rating: movie.vote_average,
        },
      });
      toast({
        title: "Poll created!",
        description: `Created poll for ${movie.title}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "polls"] });
      setLocation(`/groups/${groupId}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create poll",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const createPlacePoll = async (place: PlaceResult) => {
    setIsCreating(true);
    try {
      const photoUrl = place.photos?.[0]
        ? `/api/external/places/photo?reference=${place.photos[0].photo_reference}`
        : null;

      await apiRequest("POST", `/api/groups/${groupId}/polls`, {
        type: "place",
        externalId: place.place_id,
        title: place.name,
        description: place.formatted_address,
        image: photoUrl,
        metadata: {
          rating: place.rating,
          types: place.types,
        },
      });
      toast({
        title: "Poll created!",
        description: `Created poll for ${place.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "polls"] });
      setLocation(`/groups/${groupId}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create poll",
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
            <h1 className="text-xl font-bold font-display">Create Poll</h1>
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
                    <Card className="overflow-hidden hover-elevate">
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
                            Create Poll
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
                    <Card className="hover-elevate">
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
                          Create Poll
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
