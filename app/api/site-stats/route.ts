import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { siteStats } from "../../../db/schema";
import { json, preflight } from "../cors";

const homepageKey = "homepage";
const visitWindowMs = 24 * 60 * 60 * 1000;

type VisitorBindings = {
  DB?: D1Database;
  VISITOR_IP_HMAC_KEY?: string;
};

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "";
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function visitorFingerprint(address: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`site-visit:${address}`)));
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const db = getDb();
    await db.insert(siteStats).values({ key: homepageKey, views: 0 }).onConflictDoNothing();
    const bindings = env as unknown as VisitorBindings;
    const address = clientAddress(request);
    const secret = bindings.VISITOR_IP_HMAC_KEY?.trim();
    if (bindings.DB && address && secret) {
      const now = Date.now();
      const fingerprint = await visitorFingerprint(address, secret);
      await bindings.DB.batch([
        bindings.DB.prepare("DELETE FROM site_visit_windows WHERE expires_at <= ?").bind(now),
        bindings.DB.prepare("INSERT OR IGNORE INTO site_visit_windows (fingerprint, expires_at) VALUES (?, ?)")
          .bind(fingerprint, now + visitWindowMs),
      ]);
    }
    const [stats] = await db.select({ views: siteStats.views }).from(siteStats)
      .where(eq(siteStats.key, homepageKey)).limit(1);
    return json(request, { views: stats?.views || 0 });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法記錄瀏覽人次" }, 500);
  }
}
