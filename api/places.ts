import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

interface GooglePlacesResponse {
  status: string;
  results: any[];
  error_message?: string;
}

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  photos?: Array<{ photo_reference: string }>;
  rating?: number;
  types?: string[];
}

function mapGooglePlaceToPlaceResult(p: any): PlaceResult {
  return {
    place_id: p.place_id,
    name: p.name,
    formatted_address: p.formatted_address || p.vicinity || "",
    photos: p.photos?.map((ph: any) => ({ photo_reference: ph.photo_reference })),
    rating: p.rating,
    types: p.types,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: "API key not configured" });

    const query = (req.query.query as string) || (req.body?.query as string);
    if (!query) return res.status(400).json({ error: "Query parameter is required" });

    const url = `${GOOGLE_PLACES_BASE_URL}/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`;
    const gResp = await fetch(url);
    const data = (await gResp.json()) as GooglePlacesResponse;

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return res.status(502).json({ error: data.error_message || data.status });
    }

    const results = (data.results || []).map(mapGooglePlaceToPlaceResult);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
