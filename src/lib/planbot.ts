// src/lib/planbot.ts
import { ID, Query } from "appwrite";
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { createPoll, getPollVotes, getActivePoll, deactivatePoll } from "@/lib/pollHelpers";
import { extractCafePreferencesFromChat, rerankPlacesWithLLM, summarizeItinerary } from "@/lib/llm";

export interface PlanbotContext {
  groupId: string;
  currentUser: { $id: string; name: string; avatar?: string };
  group?: { $id: string; name: string; members?: string[] } | null;
}

export type PlanbotResult = { handled: boolean };

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

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
      reactions: [],
    }
  );
}

function parseArgs(input: string): { cmd: string; args: string[] } {
  const trimmed = input.trim().replace(/^\/?|^!/, "");
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const cmd = (parts.shift() || "").toLowerCase();
  return { cmd, args: parts };
}

async function suggestCafes(groupId: string, queryWords: string[]): Promise<void> {
  if (!GOOGLE_PLACES_API_KEY) {
    await sendSystemMessage(groupId, "Configuration error: Google Places API key not set.");
    return;
  }
  const query = ["cafe", ...queryWords].join(" ");
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      await sendSystemMessage(groupId, `No cafes found for '${query}'. Try adding a location, e.g., /plan cafe Connaught Place`);
      return;
    }

    // LLM preference extraction from recent chat
    let reranked = data.results;
    try {
      const recentMsgsRes = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.MESSAGES,
        [Query.equal("groupId", groupId), Query.orderDesc("$createdAt"), Query.limit(50)]
      );
      const recentMsgs = (recentMsgsRes.documents as any[]).map(m => ({ senderId: m.senderId, text: m.text })).reverse();
      const prefs = await extractCafePreferencesFromChat(recentMsgs);
      reranked = await rerankPlacesWithLLM(data.results, prefs);
    } catch (_) {
      // fall back silently
    }

    const top = reranked.slice(0, 3);
    const lines = top.map((p: any, i: number) => `${i + 1}. ${p.name}${p.rating ? ` (⭐ ${p.rating})` : ""}${p.formatted_address ? ` — ${p.formatted_address}` : ""}`);
    await sendSystemMessage(groupId, `Top cafe suggestions for '${query}':\n${lines.join("\n")}\nUse '/lock' after RSVPs to finalize.`);

    // Auto-create RSVP poll for the top suggestion
    const first = top[0];
    await createPoll({
      groupId,
      creatorId: "planbot",
      creatorName: "PlanBot",
      type: "place",
      externalId: first.place_id,
      title: first.name,
      description: first.formatted_address || "",
      image: "",
      metadata: {
        rating: first.rating || 0,
        types: first.types || [],
        source: "google_places",
      },
    });
    await sendSystemMessage(groupId, `Created RSVP poll for: ${first.name}. Vote Join/Maybe/No in the sidebar.`);
  } catch (e) {
    await sendSystemMessage(groupId, `Failed to fetch cafe suggestions. ${e instanceof Error ? e.message : ""}`);
  }
}

function parseDateTime(args: string[]): { date?: string; time?: string } {
  // Very permissive parser: look for YYYY-MM-DD and HH:MM or HH:MM(am|pm)
  let date: string | undefined;
  let time: string | undefined;
  for (const a of args) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a;
    if (/^\d{1,2}:\d{2}([ap]m)?$/i.test(a)) time = a.toLowerCase();
  }
  return { date, time };
}

async function attachWhen(groupId: string, args: string[]): Promise<void> {
  const active = await getActivePoll(groupId);
  if (!active) {
    await sendSystemMessage(groupId, "No active poll. Run '/plan cafe <area>' first to create one.");
    return;
  }
  const { date, time } = parseDateTime(args);
  if (!date && !time) {
    await sendSystemMessage(groupId, "Usage: /when YYYY-MM-DD HH:MM (e.g., /when 2025-10-30 19:30)");
    return;
  }
  const nextMeta = {
    ...(typeof active.metadata === "string" ? JSON.parse(active.metadata || "{}") : (active.metadata || {})),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
  };
  await databases.updateDocument(
    DATABASE_ID,
    COLLECTIONS.POLLS,
    active.$id,
    { metadata: JSON.stringify(nextMeta) }
  );
  await sendSystemMessage(groupId, `Updated plan time${date ? ` • Date: ${date}` : ""}${time ? ` • Time: ${time}` : ""}.`);
}

async function rsvpSummary(groupId: string): Promise<void> {
  const active = await getActivePoll(groupId);
  if (!active) {
    await sendSystemMessage(groupId, "No active poll to summarize.");
    return;
  }
  const votes = await getPollVotes(active.$id);
  const counts = { join: 0, maybe: 0, no: 0 } as Record<string, number>;
  votes.forEach((v: any) => { counts[v.choice] = (counts[v.choice] || 0) + 1; });
  await sendSystemMessage(groupId, `RSVP — Join: ${counts.join || 0}, Maybe: ${counts.maybe || 0}, Not joining: ${counts.no || 0}.`);
}

async function lockDecision(groupId: string, groupName?: string): Promise<void> {
  const active = await getActivePoll(groupId);
  if (!active) {
    await sendSystemMessage(groupId, "No active plan to lock.");
    return;
  }
  const meta = typeof active.metadata === "string" ? JSON.parse(active.metadata || "{}") : (active.metadata || {});
  const votes = await getPollVotes(active.$id);
  const joiners = votes.filter((v: any) => v.choice === "join").map((v: any) => v.userId);
  await deactivatePoll(active.$id, active.creatorId || "planbot").catch(() => {});

  // Try LLM summary; fallback to template
  try {
    const pretty = await summarizeItinerary(
      { title: active.title, description: active.description, metadata: meta },
      votes as any,
      groupName
    );
    await sendSystemMessage(groupId, pretty);
  } catch (_) {
    const summary = [
      `Final Itinerary: ${active.title}`,
      meta?.date ? `Date: ${meta.date}` : undefined,
      meta?.time ? `Time: ${meta.time}` : undefined,
      active.description ? `Where: ${active.description}` : undefined,
      `RSVP: ${joiners.length} joining`,
    ].filter(Boolean).join("\n");
    await sendSystemMessage(groupId, summary);
  }
}

async function help(groupId: string): Promise<void> {
  await sendSystemMessage(
    groupId,
    [
      "PlanBot commands:",
      "• /plan cafe <area> — suggest cafes and create an RSVP poll",
      "• /when YYYY-MM-DD HH:MM — attach date/time to the active plan",
      "• /rsvp — show current RSVP summary",
      "• /lock — lock the current plan and post the final itinerary",
      "• /help — show this help",
    ].join("\n")
  );
}

export async function handlePlanbotCommand(input: string, ctx: PlanbotContext): Promise<PlanbotResult> {
  const trimmed = input.trim();
  if (!(trimmed.startsWith("/") || trimmed.startsWith("!"))) return { handled: false };
  const { cmd, args } = parseArgs(trimmed);

  switch (cmd) {
    case "help":
      await help(ctx.groupId);
      return { handled: true };
    case "plan": {
      const topic = (args[0] || "").toLowerCase();
      const rest = args.slice(1);
      if (topic === "cafe" || topic === "cafes" || topic === "coffee") {
        await suggestCafes(ctx.groupId, rest);
        return { handled: true };
      }
      await sendSystemMessage(ctx.groupId, "Unsupported plan topic. Try '/plan cafe Connaught Place'.");
      return { handled: true };
    }
    case "when":
      await attachWhen(ctx.groupId, args);
      return { handled: true };
    case "rsvp":
      await rsvpSummary(ctx.groupId);
      return { handled: true };
    case "lock":
      await lockDecision(ctx.groupId, ctx.group?.name);
      return { handled: true };
    default:
      await sendSystemMessage(ctx.groupId, "Unknown command. Use /help for options.");
      return { handled: true };
  }
}
