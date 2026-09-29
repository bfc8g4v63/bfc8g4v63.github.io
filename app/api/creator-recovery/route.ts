import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, lineManagerBatchBindCodes, lineManagerBindCodes } from "../../../db/schema";
import { clean, verifyCredential } from "../admin/auth";
import { json, preflight } from "../cors";
import { lineConfig } from "../line/lib";
import { rateLimit } from "../rate-limit";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function activityUrl(shareToken: string) {
  return `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(shareToken)}`;
}

function eventStartsAt(event: { eventDate: string; startTime: string }) {
  return Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
}

async function createUniqueManagerBatchCode() {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const [single, batch] = await Promise.all([
      db.select({ code: lineManagerBindCodes.code }).from(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, code)).limit(1),
      db.select({ code: lineManagerBatchBindCodes.code }).from(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, code)).limit(1),
    ]);
    if (!single && !batch) return code;
  }
  throw new Error("暫時無法產生管理提醒綁定碼，請再試一次");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action === "unlock" || body.action === "create_manager_batch_binding_code"
      ? body.action
      : "search";
    const limit = await rateLimit(request, `creator-recovery-${action}`, action === "search" ? 8 : 5, 15 * 60 * 1000);
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
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, status: events.status, shareToken: events.shareToken,
      editCodeHash: events.editCodeHash,
    }).from(events).where(creatorMatch).orderBy(desc(events.createdAt)).limit(50);
    const matches = [];
    for (const event of rows) {
      if (await verifyCredential(editCode, event.editCodeHash)) matches.push(event);
    }
    if (!matches.length) return json(request, { error: "姓名或管理碼不正確" }, 403);
    if (action === "create_manager_batch_binding_code") {
      if (!lineConfig().token || !lineConfig().channelSecret) {
        return json(request, { error: "請先完成 LINE 小幫手設定" }, 503);
      }
      const selectedIds = Array.isArray(body.eventIds)
        ? [...new Set(body.eventIds.filter((value): value is string => typeof value === "string").map((value) => clean(value, 80)).filter(Boolean))].slice(0, 12)
        : [];
      if (!selectedIds.length) return json(request, { error: "請至少選擇一場尚未開始的活動" }, 400);
      const selected = matches.filter((event) => selectedIds.includes(event.id)
        && event.status === "active" && eventStartsAt(event) > Date.now());
      if (selected.length !== selectedIds.length) {
        return json(request, { error: "僅能綁定仍在進行且尚未開始的活動，請重新勾選" }, 400);
      }
      const code = await createUniqueManagerBatchCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.insert(lineManagerBatchBindCodes).values({
        code,
        eventIds: JSON.stringify(selected.map((event) => event.id)),
        expiresAt,
      });
      return json(request, {
        ok: true,
        code,
        expiresAt,
        count: selected.length,
        activities: selected.map((event) => ({ id: event.id, title: event.title })),
      });
    }
    return json(request, {
      activities: matches.map(({ editCodeHash: _editCodeHash, ...event }) => ({
        ...event,
        shareUrl: activityUrl(event.shareToken),
      })),
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法找回活動" }, 500);
  }
}
