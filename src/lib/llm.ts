// src/lib/llm.ts
// Minimal LLM client helpers. Requires env vars:
// - VITE_LLM_PROVIDER: "openai" | "openrouter" (default: openai)
// - VITE_LLM_API_KEY: string
// - VITE_LLM_MODEL: string (default: a small, cheap chat model)

const PROVIDER = (import.meta.env.VITE_LLM_PROVIDER as string | undefined) || "openai";
const API_KEY = import.meta.env.VITE_LLM_API_KEY as string | undefined;
const MODEL = (import.meta.env.VITE_LLM_MODEL as string | undefined) || (PROVIDER === "openrouter" ? "openrouter/anthropic/claude-3.5-sonnet" : "gpt-4o-mini");

function getBaseUrl() {
  if (PROVIDER === "openrouter") return "https://openrouter.ai/api/v1";
  return "https://api.openai.com/v1";
}

export async function generateText(opts: {
  system?: string;
  prompt: string;
  response_format?: { type: "json_object" | "text" };
}): Promise<string> {
  if (!API_KEY) throw new Error("LLM API key not configured (VITE_LLM_API_KEY)");

  const body: any = {
    model: MODEL,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: opts.prompt },
    ],
  };
  if (opts.response_format) {
    // OpenAI style JSON mode
    body.response_format = opts.response_format;
  }

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(PROVIDER === "openrouter" ? { "HTTP-Referer": window.location.origin, "X-Title": "FriendFlow" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM error: ${res.status} ${t}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content as string;
}

export async function extractCafePreferencesFromChat(messages: Array<{ senderId: string; text: string }>): Promise<{
  cuisines?: string[];
  ambience?: string[];
  budget?: string;
  dietary?: string[];
  keywords?: string[];
}> {
  const prompt = `Given the following recent group chat messages, extract group cafe preferences as tight JSON with keys: cuisines (string[]), ambience (string[]), budget (one of: low, medium, high or unknown), dietary (string[]), keywords (string[]). If unclear, keep arrays empty and budget="unknown".
Messages:\n${messages.map(m => `- ${m.text}`).join("\n")}`;
  const out = await generateText({
    system: "You are a precise information extraction assistant. Return strict JSON only.",
    prompt,
    response_format: { type: "json_object" },
  });
  try {
    return JSON.parse(out);
  } catch {
    return { cuisines: [], ambience: [], budget: "unknown", dietary: [], keywords: [] };
  }
}

export async function rerankPlacesWithLLM(places: any[], prefs: any): Promise<any[]> {
  const prompt = `Preferences: ${JSON.stringify(prefs)}\n\nPlaces (JSON array): ${JSON.stringify(places.map(p => ({ name: p.name, rating: p.rating, types: p.types, address: p.formatted_address })))}\n\nReturn a pure JSON array of indices (0-based) representing the reranked top 5, best match first.`;
  const out = await generateText({
    system: "You rerank places by matching preferences; favor matching cuisines/ambience, good rating, reasonable distance if available.",
    prompt,
    response_format: { type: "json_object" },
  });
  try {
    const parsed = JSON.parse(out);
    const idxs: number[] = Array.isArray(parsed) ? parsed : parsed.indices || [];
    const safe = idxs.filter(i => Number.isInteger(i) && i >= 0 && i < places.length);
    if (safe.length === 0) return places;
    const picked = safe.slice(0, 5).map(i => places[i]);
    return picked;
  } catch {
    return places;
  }
}

export async function summarizeItinerary(plan: {
  title: string;
  description?: string;
  metadata?: any;
}, votes: Array<{ userId: string; choice: string }>, groupName?: string): Promise<string> {
  const prompt = `Create a concise, friendly plan summary for group ${groupName || "the group"}. Include title, where, date/time if present, and RSVP counts (Join/Maybe/No). Keep under 7 lines.
Plan: ${JSON.stringify(plan)}
Votes: ${JSON.stringify(votes.reduce((acc, v) => { acc[v.choice] = (acc[v.choice]||0)+1; return acc; }, {} as Record<string, number>))}`;
  return await generateText({
    system: "You are an assistant that writes crisp event itineraries for group chats.",
    prompt,
  });
}
