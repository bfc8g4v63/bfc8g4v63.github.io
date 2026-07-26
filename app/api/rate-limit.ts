type RateLimit = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

// This guard is intentionally lightweight for the Worker runtime. CDN/WAF
// throttling should remain the outer protection once the site is deployed.
export async function rateLimit(request: Request, scope: string, limit: number, windowMs: number): Promise<RateLimit> {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (database) {
    const resetAt = now + windowMs;
    const row = await database.prepare(`INSERT INTO api_rate_limits (key, count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN api_rate_limits.reset_at <= ? THEN 1 ELSE api_rate_limits.count + 1 END,
        reset_at = CASE WHEN api_rate_limits.reset_at <= ? THEN ? ELSE api_rate_limits.reset_at END
      RETURNING count, reset_at`).bind(key, resetAt, now, now, resetAt).first<{ count: number; reset_at: number }>();
    if (row) return row.count <= limit
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
  }
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { allowed: true };
}
import { env } from "cloudflare:workers";
