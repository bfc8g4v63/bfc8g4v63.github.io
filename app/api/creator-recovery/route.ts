import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events } from "../../../db/schema";
import { clean, hashCode } from "../admin/auth";
import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function activityUrl(shareToken: string) {
  return `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(shareToken)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action === "unlock" ? "unlock" : "search";
    const limit = rateLimit(request, `creator-recovery-${action}`, action === "search" ? 8 : 5, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `操作過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);

    const creatorName = clean(body.creatorName, 60);
    if (creatorName.length < 2) return json(request, { error: "請輸入完整的建立者姓名" }, 400);

    await ensureSchema();
    const db = getDb();
    // Activities created before recovery was introduced do not have creator_name.
    // Their existing contact name remains the recovery name so no activity is lost.
    const creatorMatch = or(
      eq(events.creatorName, creatorName),
      and(eq(events.creatorName, ""), eq(events.contactName, creatorName)),
    );
    if (action === "search") {
      // Search intentionally reveals no count, ID, title, date, or link.
      const [match] = await db.select({ creatorName: events.creatorName }).from(events)
        .where(creatorMatch).limit(1);
      return json(request, { matches: match ? [{ creatorName: match.creatorName || creatorName }] : [] });
    }

    const editCode = clean(body.editCode, 80);
    // Older activities were created with four-digit management codes.
    // New activities still require six characters when they are created.
    if (editCode.length < 4) return json(request, { error: "請輸入至少 4 個字元的管理碼" }, 400);
    const codeHash = await hashCode(editCode);
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, status: events.status, shareToken: events.shareToken,
    }).from(events).where(and(
      creatorMatch,
      eq(events.editCodeHash, codeHash),
    )).orderBy(asc(events.eventDate), asc(events.startTime)).limit(50);
    if (!rows.length) return json(request, { error: "姓名或管理碼不正確" }, 403);
    return json(request, {
      activities: rows.map((event) => ({
        ...event,
        shareUrl: activityUrl(event.shareToken),
      })),
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法找回活動" }, 500);
  }
}
