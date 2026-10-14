import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";
import { locationSearchQueries } from "../../../lib/location-search";
import { nationalSportsCentersFor } from "../../../lib/national-sports-centers";
import { env } from "cloudflare:workers";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
// A fixed local search preference, not a browser-location reading or stored user data.
const ZHONGLI_LOCATION_BIAS = { circle: { center: { latitude: 24.9537, longitude: 121.2258 }, radius: 25_000 } };
const ZHONGLI_VIEWBOX = "121.14,25.08,121.31,24.85";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_NOMINATIM_INTERVAL_MS = 1_100;
// Per-IP daily caps are stored in D1 when available. They only apply to a
// request that will use the paid Google provider; cached and official results
// remain available without consuming this allowance.
const GOOGLE_AUTOCOMPLETE_DAILY_LIMIT = 240;
const DAY_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; results: PlaceSuggestion[] }>();
let nextNominatimRequestAt = 0;
let nominatimRequestQueue = Promise.resolve();

export type PlaceSuggestion = {
  name: string;
  address: string;
  provider: "google" | "osm" | "local";
  placeId?: string;
};

const TAIWAN_LANDMARKS: Array<PlaceSuggestion & { matches: (query: string) => boolean }> = [
  {
    name: "中壢國民運動中心",
    address: "桃園市中壢區三光路350號",
    // Match each progressively typed prefix and a generic venue-name fragment.
    // Google Places handles the general case when GOOGLE_PLACES_API_KEY is configured.
    matches: (query) => "中壢國民運動中心".startsWith(query)
      || "中壢國民運動中心".includes(query)
      || (query.includes("中壢") && query.includes("運動") && query.includes("中心")),
  },
  {
    name: "遠東 SOGO 中壢店",
    address: "桃園市中壢區元化路357號",
    matches: (query) => query.includes("中壢") && query.includes("sogo"),
  },
  {
    name: "台北 101",
    address: "臺北市信義區信義路五段7號",
    matches: (query) => query === "101" || query.includes("台北101") || query.includes("臺北101") || query.includes("taipei101"),
  },
];

export function OPTIONS(request: Request) {
  return preflight(request);
}

function cleanQuery(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 100) : "";
}

function queryKey(value: string) {
  return value
    .toLocaleLowerCase("zh-TW")
    .replaceAll("臺", "台")
    .replaceAll("巿", "市")
    .replace(/[\s－—-]/g, "");
}

function localSuggestions(query: string): PlaceSuggestion[] {
  const normalized = queryKey(query);
  return TAIWAN_LANDMARKS
    .filter((landmark) => landmark.matches(normalized))
    .map((landmark) => ({ name: landmark.name, address: landmark.address, provider: "local" as const }));
}

function combineSuggestions(preferred: PlaceSuggestion[], suggestions: PlaceSuggestion[]) {
  const seen = new Set<string>();
  return [...preferred, ...suggestions].filter((place) => {
    const key = `${queryKey(place.name)}|${queryKey(place.address)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function googlePlacesApiKey() {
  const key = (env as unknown as { GOOGLE_PLACES_API_KEY?: string }).GOOGLE_PLACES_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function sessionToken(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

async function googleSuggestions(query: string, key: string, token?: string): Promise<PlaceSuggestion[]> {
  const response = await fetch(GOOGLE_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.place,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["tw"],
      languageCode: "zh-TW",
      regionCode: "TW",
      locationBias: ZHONGLI_LOCATION_BIAS,
      includeQueryPredictions: false,
      ...(token ? { sessionToken: token } : {}),
    }),
  });
  if (!response.ok) throw new Error("Google Places autocomplete failed");
  const payload = await response.json() as { suggestions?: unknown[] };
  return prioritizeZhongli((payload.suggestions || []).map(googlePlaceSuggestion).filter((item): item is PlaceSuggestion => Boolean(item)));
}

function googlePlaceSuggestion(item: unknown): PlaceSuggestion | null {
  if (!item || typeof item !== "object") return null;
  const prediction = (item as { placePrediction?: unknown }).placePrediction;
  if (!prediction || typeof prediction !== "object") return null;
  const row = prediction as { place?: unknown; text?: { text?: unknown }; structuredFormat?: { mainText?: { text?: unknown }; secondaryText?: { text?: unknown } } };
  const placeId = typeof row.place === "string" && /^places\/[A-Za-z0-9_-]+$/.test(row.place) ? row.place : "";
  const fallback = typeof row.text?.text === "string" ? row.text.text.trim() : "";
  const name = typeof row.structuredFormat?.mainText?.text === "string" ? row.structuredFormat.mainText.text.trim() : fallback;
  const address = typeof row.structuredFormat?.secondaryText?.text === "string" ? row.structuredFormat.secondaryText.text.trim() : fallback;
  return placeId && name ? { name: name.slice(0, 160), address: address.slice(0, 200), provider: "google", placeId } : null;
}

function prioritizeZhongli(results: PlaceSuggestion[]) {
  const score = (place: PlaceSuggestion) => {
    const text = `${place.name} ${place.address}`.toLocaleLowerCase("zh-TW");
    if (text.includes("中壢") || text.includes("zhongli")) return 2;
    return text.includes("桃園") || text.includes("taoyuan") ? 1 : 0;
  };
  return [...results].sort((left, right) => score(right) - score(left));
}

function waitForNominatimSlot() {
  const slot = nominatimRequestQueue.then(async () => {
    const waitMs = Math.max(0, nextNominatimRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextNominatimRequestAt = Date.now() + MIN_NOMINATIM_INTERVAL_MS;
  });
  nominatimRequestQueue = slot.catch(() => undefined);
  return slot;
}

async function nominatimSuggestions(query: string) {
  await waitForNominatimSlot();
  const lookup = /^\d{1,4}$/.test(query) ? `中壢 ${query}, 桃園, 台灣` : `${query}, 台灣`;
  const params = new URLSearchParams({
    q: lookup, format: "jsonv2", addressdetails: "1", namedetails: "1", countrycodes: "tw", viewbox: ZHONGLI_VIEWBOX, bounded: "0", limit: "10", "accept-language": "zh-TW",
  });
  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "zh-TW,zh;q=0.9",
      "User-Agent": "GoodDaysFamilyEvents/1.2 (https://bfc8g4v63.github.io/)",
    },
  });
  if (!response.ok) throw new Error("Nominatim search failed");
  const payload = await response.json();
  return Array.isArray(payload) ? prioritizeZhongli(payload.map(placeSuggestion).filter((item): item is PlaceSuggestion => Boolean(item))) : [];
}

function placeSuggestion(item: unknown): PlaceSuggestion | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const displayName = typeof row.display_name === "string" ? row.display_name.replace(/\s+/g, " ").trim() : "";
  if (!displayName) return null;
  const namedetails = row.namedetails && typeof row.namedetails === "object" ? row.namedetails as Record<string, unknown> : {};
  const name = typeof namedetails["name:zh"] === "string" ? namedetails["name:zh"]
    : typeof namedetails.name === "string" ? namedetails.name
      : typeof row.name === "string" ? row.name
        : displayName.split(",")[0];
  return { name: name.trim().slice(0, 160), address: displayName.slice(0, 200), provider: "osm" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const query = cleanQuery(body.query);
    const token = sessionToken(body.sessionToken);
    if (query.length < 2) return json(request, { error: "請輸入至少兩個字再搜尋地點" }, 400);
    const cacheKey = queryKey(query);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return json(request, { results: cached.results, cached: true });

    const officialCenters = nationalSportsCentersFor(query).map((center) => ({ ...center, provider: "local" as const }));
    if (officialCenters.length) {
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results: officialCenters });
      return json(request, { results: officialCenters, preferred: true, source: "official-sports-data" });
    }

    const limit = await rateLimit(request, "location-search", 20, 60 * 1000);
    if (!limit.allowed) return json(request, { error: `地點搜尋過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);

    // Two-character searches still use the free/local fallbacks. Requiring three
    // characters before a paid provider lookup prevents broad, low-intent calls.
    const localResults = localSuggestions(query);

    const googleKey = googlePlacesApiKey();
    if (googleKey && query.length >= 3) {
      const dailyLimit = await rateLimit(request, "location-google-autocomplete-daily", GOOGLE_AUTOCOMPLETE_DAILY_LIMIT, DAY_MS);
      if (!dailyLimit.allowed) {
        return json(request, { error: "今日地點建議使用量已達保護上限，請明天再試或自行填寫地址" }, 429);
      }
      try {
        const results = await googleSuggestions(query, googleKey, token);
        if (results.length) return json(request, { results: combineSuggestions(localResults, results), provider: "google" });
      } catch {
        // Keep venue creation usable while Google is unavailable or misconfigured.
      }
    }

    let results: PlaceSuggestion[] = [];
    for (const lookup of locationSearchQueries(query)) {
      results = await nominatimSuggestions(lookup);
      if (results.length) break;
    }
    results = combineSuggestions(localResults, results);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    return json(request, { results });
  } catch {
    return json(request, { error: "目前無法搜尋地點，請自行填寫地址" }, 502);
  }
}
