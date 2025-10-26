// src/lib/planbot.ts
import { ID, Query } from "appwrite";
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { createPoll, getPollVotes, getActivePoll, deactivatePoll } from "@/lib/pollHelpers";

export interface PlanbotContext {
  groupId: string;
  currentUser: { $id: string; name: string; avatar?: string };
  group?: { $id: string; name: string; members?: string[] } | null;
}

export type PlanbotResult = { handled: boolean };

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  types?: string[];
  lat?: number;
  lon?: number;
}

interface MovieResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
  genre_ids?: number[];
}

// Store selected items per group (in-memory for this session)
const selectedItems: Map<string, PlaceResult | MovieResult> = new Map();
const searchResults: Map<string, (PlaceResult | MovieResult)[]> = new Map();

// TMDB API configuration
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

async function sendSystemMessage(groupId: string, text: string) {
  await databases.createDocument(
    DATABASE_ID,
    COLLECTIONS.MESSAGES,
    ID.unique(),
    {
      groupId,
      senderId: "planbot",
      senderName: "PlanBot",
      senderAvatar: "",
      text,
      isSystemMessage: true,
    }
  );
}

async function sendPersonalNotification(userId: string, text: string, metadata?: any) {
  try {
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.NOTIFICATIONS,
      ID.unique(),
      {
        userId,
        text,
        metadata: metadata ? JSON.stringify(metadata) : null,
        read: false,
        type: "plan_confirmation",
      }
    );
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}

function parseArgs(input: string): { cmd: string; args: string[] } {
  const trimmed = input.trim().replace(/^\/?|^!/, "");
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const cmd = (parts.shift() || "").toLowerCase();
  return { cmd, args: parts };
}

async function searchPlaces(location: string, category: string = "cafe"): Promise<PlaceResult[]> {
  try {
    // Using Nominatim for geocoding the search query
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'FriendFlow/1.0'
        }
      }
    );
    
    if (!nominatimResponse.ok) {
      throw new Error("Failed to geocode search query");
    }
    
    const geoData = await nominatimResponse.json();
    
    if (!geoData || geoData.length === 0) {
      return [];
    }

    const { lat, lon } = geoData[0];
    
    // Map category to Overpass amenity types
    const amenityMap: Record<string, string> = {
      cafe: "cafe",
      coffee: "cafe",
      restaurant: "restaurant",
      bar: "bar|pub",
      food: "restaurant|cafe|fast_food",
    };
    
    const amenity = amenityMap[category.toLowerCase()] || "cafe";
    
    // Search for places using Overpass API within 5km radius
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["amenity"~"${amenity}"](around:5000,${lat},${lon});
      );
      out body 20;
    `;

    const overpassResponse = await fetch(
      'https://overpass-api.de/api/interpreter',
      {
        method: 'POST',
        body: overpassQuery,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!overpassResponse.ok) {
      throw new Error("Failed to fetch places");
    }

    const data = await overpassResponse.json();
    
    // Transform Overpass results to match PlaceResult interface
    const places: PlaceResult[] = data.elements
      .filter((element: any) => element.tags && element.tags.name)
      .map((element: any) => {
        const tags = element.tags;
        
        // Build address from available tags
        const addressParts = [
          tags['addr:housenumber'],
          tags['addr:street'],
          tags['addr:city'],
          tags['addr:postcode'],
          tags['addr:country']
        ].filter(Boolean);
        
        const formatted_address = addressParts.length > 0 
          ? addressParts.join(', ')
          : `${element.lat.toFixed(6)}, ${element.lon.toFixed(6)}`;

        // Determine types based on tags
        const types: string[] = [];
        if (tags.amenity) types.push(tags.amenity);
        if (tags.cuisine) types.push(tags.cuisine);

        return {
          place_id: `osm_${element.type}_${element.id}`,
          name: tags.name || 'Unnamed Place',
          formatted_address: formatted_address,
          rating: tags.rating ? parseFloat(tags.rating) : undefined,
          types: types,
          lat: element.lat,
          lon: element.lon,
        };
      });

    return places;
  } catch (error) {
    console.error("Places search error:", error);
    return [];
  }
}

async function getUserGenres(userId: string): Promise<string[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.equal('userId', userId)]
    );

    if (response.documents.length > 0) {
      const userDoc = response.documents[0];
      return userDoc.genres || [];
    }
    return [];
  } catch (error) {
    console.error("Error fetching user genres:", error);
    return [];
  }
}

async function searchMoviesByGenres(genres: string[]): Promise<MovieResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error("TMDB API key is not configured");
  }

  try {
    // Get genre IDs from TMDB
    const genreResponse = await fetch(
      `${TMDB_BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`
    );
    
    if (!genreResponse.ok) {
      throw new Error("Failed to fetch genre list");
    }

    const genreData = await genreResponse.json();
    const genreMap = new Map(
      genreData.genres.map((g: any) => [g.name.toLowerCase(), g.id])
    );

    // Convert user genres to TMDB genre IDs
    const genreIds = genres
      .map(g => genreMap.get(g.toLowerCase()))
      .filter(Boolean);

    if (genreIds.length === 0) {
      // If no matching genres, get popular movies
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch movies");
      }

      const data = await response.json();
      return data.results.slice(0, 5);
    }

    // Discover movies by genres
    const genreQuery = genreIds.join(',');
    const response = await fetch(
      `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&include_adult=false&with_genres=${genreQuery}&page=1`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch movies");
    }

    const data = await response.json();
    return data.results.slice(0, 5);
  } catch (error) {
    console.error("Movie search error:", error);
    throw error;
  }
}

async function suggestOutings(groupId: string, args: string[]): Promise<void> {
  if (args.length < 2) {
    await sendSystemMessage(
      groupId, 
      "❌ Usage: /planOutings <area> <city> [category]\nExample: /planOutings whitefield bangalore cafe"
    );
    return;
  }

  const area = args[0];
  const city = args[1];
  const category = args[2] || "cafe";
  const location = `${area} ${city}`;

  await sendSystemMessage(groupId, `🔍 Searching for ${category}s in ${location}...`);

  try {
    const places = await searchPlaces(location, category);
    
    if (places.length === 0) {
      await sendSystemMessage(
        groupId, 
        `❌ No ${category}s found in ${location}. Try a different area or category.`
      );
      return;
    }

    const top = places.slice(0, 5);
    const lines = top.map((p: PlaceResult, i: number) => 
      `${i + 1}. **${p.name}**${p.rating ? ` ⭐ ${p.rating}` : ""}\n   📍 ${p.formatted_address}`
    );
    
    await sendSystemMessage(
      groupId, 
      `✅ Top ${category} suggestions in ${location}:\n\n${lines.join("\n\n")}\n\n💡 Use **/select <name>** to choose one, then **/when** to set date/time.`
    );

    // Store the search results for this group
    searchResults.set(groupId, top);
    
  } catch (e) {
    await sendSystemMessage(
      groupId, 
      `❌ Failed to fetch suggestions. ${e instanceof Error ? e.message : ""}`
    );
  }
}

async function suggestMovies(groupId: string, userId: string, userName: string): Promise<void> {
  await sendSystemMessage(groupId, `🎬 Finding movie recommendations based on your preferences...`);

  try {
    // Get user's favorite genres
    const userGenres = await getUserGenres(userId);
    
    if (userGenres.length === 0) {
      await sendSystemMessage(
        groupId,
        `❌ No favorite genres found in your profile. Please update your genres in Profile settings first!\n\n💡 Go to Profile → Add your favorite genres → Save`
      );
      return;
    }

    const movies = await searchMoviesByGenres(userGenres);
    
    if (movies.length === 0) {
      await sendSystemMessage(
        groupId,
        `❌ No movies found. Try updating your genre preferences.`
      );
      return;
    }

    const lines = movies.map((m: MovieResult, i: number) => 
      `${i + 1}. **${m.title}** (${m.release_date?.split("-")[0] || "N/A"})${m.vote_average ? ` ⭐ ${m.vote_average.toFixed(1)}` : ""}\n   ${m.overview ? m.overview.substring(0, 100) + "..." : ""}`
    );
    
    await sendSystemMessage(
      groupId,
      `✅ Top movie recommendations for ${userName} (based on: ${userGenres.join(", ")}):\n\n${lines.join("\n\n")}\n\n💡 Use **/select <movie title>** to choose one, then **/when** to set date/time.`
    );

    // Store the search results for this group
    searchResults.set(groupId, movies);
    
  } catch (e) {
    await sendSystemMessage(
      groupId,
      `❌ Failed to fetch movie suggestions. ${e instanceof Error ? e.message : ""}`
    );
  }
}

async function selectItem(groupId: string, args: string[]): Promise<void> {
  if (args.length === 0) {
    await sendSystemMessage(groupId, "❌ Usage: /select <name>\nExample: /select Third Wave Coffee");
    return;
  }

  const itemName = args.join(" ").toLowerCase();
  const results = searchResults.get(groupId);

  if (!results || results.length === 0) {
    await sendSystemMessage(groupId, "❌ No search results available. Run **/planOutings** or **/planMovies** first.");
    return;
  }

  // Check if it's a movie or place result
  const isMovie = 'title' in results[0];
  
  let selected: PlaceResult | MovieResult | undefined;
  
  if (isMovie) {
    selected = (results as MovieResult[]).find(m => 
      m.title.toLowerCase().includes(itemName)
    );
  } else {
    selected = (results as PlaceResult[]).find(p => 
      p.name.toLowerCase().includes(itemName)
    );
  }

  if (!selected) {
    const optionsList = results.map((item, i) => {
      const name = 'title' in item ? item.title : item.name;
      return `${i + 1}. ${name}`;
    }).join("\n");
    
    await sendSystemMessage(
      groupId,
      `❌ Item not found. Available options:\n${optionsList}`
    );
    return;
  }

  // Store selected item
  selectedItems.set(groupId, selected);
  
  if ('title' in selected) {
    // Movie selected
    await sendSystemMessage(
      groupId,
      `✅ Selected: **${selected.title}** (${selected.release_date?.split("-")[0] || "N/A"})\n⭐ Rating: ${selected.vote_average?.toFixed(1) || "N/A"}\n\n💡 Use **/when YYYY-MM-DD HH:MM** to set date and time.`
    );
  } else {
    // Place selected
    await sendSystemMessage(
      groupId,
      `✅ Selected: **${selected.name}**\n📍 ${selected.formatted_address}\n\n💡 Use **/when YYYY-MM-DD HH:MM** to set date and time.`
    );
  }
}

function parseDateTime(args: string[]): { date?: string; time?: string } {
  let date: string | undefined;
  let time: string | undefined;
  
  for (const a of args) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a;
    if (/^\d{1,2}:\d{2}([ap]m)?$/i.test(a)) time = a.toLowerCase();
  }
  
  return { date, time };
}

async function attachWhen(groupId: string, args: string[], currentUser: { $id: string; name: string; avatar?: string }): Promise<void> {
  const selected = selectedItems.get(groupId);
  
  if (!selected) {
    await sendSystemMessage(groupId, "❌ No item selected. Use **/select <name>** first.");
    return;
  }

  const { date, time } = parseDateTime(args);
  
  if (!date || !time) {
    await sendSystemMessage(
      groupId,
      "❌ Usage: /when YYYY-MM-DD HH:MM\nExample: /when 2025-10-30 19:30"
    );
    return;
  }

  try {
    // Deactivate any existing active polls
    const existingPolls = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      [Query.equal("groupId", groupId), Query.equal("active", true)]
    );

    for (const poll of existingPolls.documents) {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.POLLS,
        (poll as any).$id,
        { active: false }
      );
    }

    // Determine if it's a movie or place
    const isMovie = 'title' in selected;
    const pollType = isMovie ? "movie" : "place";
    
    let metadata: any;
    let title: string;
    let description: string;
    let externalId: string;
    let image: string;

    if (isMovie) {
      const movie = selected as MovieResult;
      title = movie.title;
      description = movie.overview || "";
      externalId = movie.id.toString();
      image = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : "";
      
      metadata = {
        date,
        time,
        releaseDate: movie.release_date,
        rating: movie.vote_average,
        source: "planbot",
      };
    } else {
      const place = selected as PlaceResult;
      title = place.name;
      description = place.formatted_address;
      externalId = place.place_id;
      image = "";
      
      metadata = {
        date,
        time,
        rating: place.rating || 0,
        types: place.types || [],
        source: "planbot",
        latitude: place.lat,
        longitude: place.lon,
      };
    }

    // Create new poll
    const newPoll = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      ID.unique(),
      {
        groupId,
        creatorId: currentUser.$id,
        creatorName: currentUser.name,
        type: pollType,
        externalId: externalId,
        title: title,
        description: description,
        image: image,
        choices: ["join", "maybe", "no"],
        active: true,
        metadata: JSON.stringify(metadata),
      }
    );

    // Create a message in the group chat announcing the poll
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.MESSAGES,
      ID.unique(),
      {
        groupId: groupId,
        senderId: currentUser.$id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar || "",
        text: `📊 New poll created: ${title}`,
        pollId: newPoll.$id,
      }
    );

    const emoji = isMovie ? "🎬" : "🪴";
    await sendSystemMessage(
      groupId,
      `📅 **Poll Created!**\n\n${emoji} **${title}**\n${description ? `📍 ${description}\n` : ""}📆 Date: ${date}\n⏰ Time: ${time}\n\n👥 Vote Join/Maybe/No in the sidebar!`
    );

    // Clear selected item and search results after creating poll
    selectedItems.delete(groupId);
    searchResults.delete(groupId);
    
  } catch (error) {
    await sendSystemMessage(
      groupId,
      `❌ Failed to create poll. ${error instanceof Error ? error.message : ""}`
    );
  }
}

async function rsvpSummary(groupId: string): Promise<void> {
  const active = await getActivePoll(groupId);
  
  if (!active) {
    await sendSystemMessage(groupId, "❌ No active poll to summarize.");
    return;
  }

  const votes = await getPollVotes(active.$id);
  const counts = { join: 0, maybe: 0, no: 0 } as Record<string, number>;
  const joiners: string[] = [];
  const maybes: string[] = [];
  
  votes.forEach((v: any) => { 
    counts[v.choice] = (counts[v.choice] || 0) + 1;
    if (v.choice === "join") joiners.push(v.userId);
    if (v.choice === "maybe") maybes.push(v.userId);
  });

  const meta = typeof active.metadata === "string" 
    ? JSON.parse(active.metadata || "{}") 
    : (active.metadata || {});

  const emoji = active.type === "movie" ? "🎬" : "🪴";
  
  await sendSystemMessage(
    groupId,
    `📊 **RSVP Summary**\n\n${emoji} **${active.title}**\n${active.description ? `📍 ${active.description}\n` : ""}${meta.date ? `📆 ${meta.date}` : ""}${meta.time ? ` ⏰ ${meta.time}` : ""}\n\n✅ Joining: ${counts.join || 0}\n🤔 Maybe: ${counts.maybe || 0}\n❌ Not joining: ${counts.no || 0}\n\n💡 Use **/lock** to finalize the plan.`
  );
}

async function lockDecision(groupId: string, groupName?: string): Promise<void> {
  const active = await getActivePoll(groupId);
  
  if (!active) {
    await sendSystemMessage(groupId, "❌ No active plan to lock.");
    return;
  }

  const meta = typeof active.metadata === "string" 
    ? JSON.parse(active.metadata || "{}") 
    : (active.metadata || {});
    
  const votes = await getPollVotes(active.$id);
  const joiners = votes.filter((v: any) => v.choice === "join");
  const maybes = votes.filter((v: any) => v.choice === "maybe");
  
  // Deactivate the poll
  await databases.updateDocument(
    DATABASE_ID,
    COLLECTIONS.POLLS,
    active.$id,
    { active: false }
  );

  const emoji = active.type === "movie" ? "🎬" : "🪴";
  
  // Create final summary message in group
  const summary = [
    `🎉 **Plan Locked!**`,
    ``,
    `${emoji} **${active.title}**`,
    active.description ? `📍 ${active.description}` : "",
    meta.date ? `📆 Date: ${meta.date}` : "",
    meta.time ? `⏰ Time: ${meta.time}` : "",
    ``,
    `👥 **Attending (${joiners.length})**`,
    joiners.length > 0 ? `✅ ${joiners.length} confirmed` : "No confirmations yet",
    maybes.length > 0 ? `🤔 ${maybes.length} maybe` : "",
    ``,
    `🎊 See you there!`
  ].filter(Boolean).join("\n");

  await sendSystemMessage(groupId, summary);

  // Send personal notifications to all joiners
  const notificationText = [
    `🎉 Plan Confirmed!`,
    ``,
    `${emoji} ${active.title}`,
    active.description ? `📍 ${active.description}` : "",
    meta.date ? `📆 ${meta.date}` : "",
    meta.time ? `⏰ ${meta.time}` : "",
    ``,
    `Group: ${groupName || "Your group"}`,
    `👥 ${joiners.length} attending`,
    ``,
    `Don't forget! 🎊`
  ].filter(Boolean).join("\n");

  const notificationMetadata = {
    groupId,
    groupName,
    pollId: active.$id,
    place: active.title,
    address: active.description,
    date: meta.date,
    time: meta.time,
    attendees: joiners.length,
    type: active.type,
  };

  // Send to all joiners
  for (const joiner of joiners) {
    await sendPersonalNotification(
      (joiner as any).userId,
      notificationText,
      notificationMetadata
    );
  }
}

async function help(groupId: string): Promise<void> {
  await sendSystemMessage(
    groupId,
    [
      "🤖 **PlanBot Commands**",
      "",
      "🗺️ **/planOutings <area> <city> [category]**",
      "   Example: /planOutings whitefield bangalore cafe",
      "   Search for places in a specific area",
      "",
      "🎬 **/planMovies**",
      "   Recommend movies based on your favorite genres",
      "   (Update genres in your Profile first!)",
      "",
      "✅ **/select <name>**",
      "   Example: /select Third Wave Coffee",
      "   Choose an item from search results",
      "",
      "📅 **/when YYYY-MM-DD HH:MM**",
      "   Example: /when 2025-10-30 19:30",
      "   Create poll with date and time",
      "",
      "📊 **/rsvp**",
      "   Show current RSVP summary",
      "",
      "🔒 **/lock**",
      "   Lock and finalize the plan",
      "   (Sends confirmation to all attendees)",
      "",
      "❓ **/help**",
      "   Show this help message",
    ].join("\n")
  );
}

export async function handlePlanbotCommand(
  input: string, 
  ctx: PlanbotContext
): Promise<PlanbotResult> {
  const trimmed = input.trim();
  
  if (!(trimmed.startsWith("/") || trimmed.startsWith("!"))) {
    return { handled: false };
  }

  const { cmd, args } = parseArgs(trimmed);

  switch (cmd) {
    case "help":
      await help(ctx.groupId);
      return { handled: true };
      
    case "planoutings":
      await suggestOutings(ctx.groupId, args);
      return { handled: true };
      
    case "planmovies":
      await suggestMovies(ctx.groupId, ctx.currentUser.$id, ctx.currentUser.name);
      return { handled: true };
      
    case "select":
      await selectItem(ctx.groupId, args);
      return { handled: true };
      
    case "when":
      await attachWhen(ctx.groupId, args, ctx.currentUser);
      return { handled: true };
      
    case "rsvp":
      await rsvpSummary(ctx.groupId);
      return { handled: true };
      
    case "lock":
      await lockDecision(ctx.groupId, ctx.group?.name);
      return { handled: true };
      
    default:
      await sendSystemMessage(
        ctx.groupId,
        "❌ Unknown command. Use **/help** for available commands."
      );
      return { handled: true };
  }
}