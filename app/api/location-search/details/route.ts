import { json, preflight } from "../../cors";
import { rateLimit } from "../../rate-limit";
import { env } from "cloudflare:workers";

const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1";
const GOOGLE_PLACE_DETAILS_DAILY_LIMIT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function OPTIONS(request: Request) {
  return preflight(request);
}

function googlePlacesApiKey() {
  const key = (env as unknown as { GOOGLE_PLACES_API_KEY?: string }).GOOGLE_PLACES_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function placePath(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("places/") ? value : `places/${value}`;
  return /^places\/[A-Za-z0-9_-]+$/.test(normalized) ? normalized : null;
}

function sessionToken(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "location-search-details", 6, 60 * 1000);
    if (!limit.allowed) return json(request, { error: `地點搜尋過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    const body = await request.json() as Record<string, unknown>;
    const placeId = placePath(body.placeId);
    const key = googlePlacesApiKey();
    if (!placeId || !key) return json(request, { error: "目前無法取得完整地址" }, 400);
    const dailyLimit = await rateLimit(request, "location-google-place-details-daily", GOOGLE_PLACE_DETAILS_DAILY_LIMIT, DAY_MS);
    if (!dailyLimit.allowed) {
      return json(request, { error: "今日地址補齊使用量已達保護上限，請明天再試或自行填寫地址" }, 429);
    }
    const params = new URLSearchParams();
    const token = sessionToken(body.sessionToken);
    if (token) params.set("sessionToken", token);
    const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}/${placeId}?${params}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "displayName,formattedAddress",
      },
    });
    if (!response.ok) throw new Error("Google Places details failed");
    const place = await response.json() as { displayName?: { text?: unknown }; formattedAddress?: unknown };
    const name = typeof place.displayName?.text === "string" ? place.displayName.text.trim() : "";
    const address = typeof place.formattedAddress === "string" ? place.formattedAddress.trim() : "";
    if (!name || !address) throw new Error("Google Places details incomplete");
    return json(request, { name: name.slice(0, 160), address: address.slice(0, 200) });
  } catch {
    return json(request, { error: "目前無法取得完整地址，已保留原本建議" }, 502);
  }
}
