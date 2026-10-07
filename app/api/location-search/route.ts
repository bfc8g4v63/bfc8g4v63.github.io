import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; results: PlaceSuggestion[] }>();

type PlaceSuggestion = { name: string; address: string };

export function OPTIONS(request: Request) {
  return preflight(request);
}

function cleanQuery(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 100) : "";
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
  return { name: name.trim().slice(0, 160), address: displayName.slice(0, 200) };
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "location-search", 6, 60 * 1000);
    if (!limit.allowed) return json(request, { error: `地點搜尋過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    const body = await request.json() as Record<string, unknown>;
    const query = cleanQuery(body.query);
    if (query.length < 2) return json(request, { error: "請輸入至少兩個字再搜尋地點" }, 400);
    const cacheKey = query.toLocaleLowerCase("zh-TW");
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return json(request, { results: cached.results, cached: true });

    const lookup = /^\d{1,4}$/.test(query) ? `台北 ${query}, 台灣` : `${query}, 台灣`;
    const params = new URLSearchParams({
      q: lookup, format: "jsonv2", addressdetails: "1", namedetails: "1", countrycodes: "tw", limit: "5", "accept-language": "zh-TW",
    });
    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-TW,zh;q=0.9",
        "User-Agent": "GoodDaysFamilyEvents/1.2 (https://bfc8g4v63.github.io/)",
      },
    });
    if (!response.ok) return json(request, { error: "目前無法搜尋地點，請稍後再試或自行填寫地址" }, 502);
    const payload = await response.json();
    const results = Array.isArray(payload) ? payload.map(placeSuggestion).filter((item): item is PlaceSuggestion => Boolean(item)) : [];
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    return json(request, { results });
  } catch {
    return json(request, { error: "目前無法搜尋地點，請自行填寫地址" }, 502);
  }
}
