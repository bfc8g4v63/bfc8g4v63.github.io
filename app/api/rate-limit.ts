type RateLimit = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

// This guard is intentionally lightweight for the Worker runtime. CDN/WAF
// throttling should remain the outer protection once the site is deployed.
export function rateLimit(request: Request, scope: string, limit: number, windowMs: number): RateLimit {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
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
