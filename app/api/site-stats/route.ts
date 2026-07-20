import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { siteStats } from "../../../db/schema";
import { json, preflight } from "../cors";

const homepageKey = "homepage";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const db = getDb();
    await db.insert(siteStats).values({ key: homepageKey, views: 0 }).onConflictDoNothing();
    await db.update(siteStats).set({
      views: sql`${siteStats.views} + 1`,
      updatedAt: new Date().toISOString(),
    }).where(eq(siteStats.key, homepageKey));
    const [stats] = await db.select({ views: siteStats.views }).from(siteStats)
      .where(eq(siteStats.key, homepageKey)).limit(1);
    return json(request, { views: stats?.views || 0 });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法記錄瀏覽人次" }, 500);
  }
}
