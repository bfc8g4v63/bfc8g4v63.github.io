import { and, eq, inArray, lt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { ensureSchema } from "../../../../db/init";
import {
  events, lineBindCodes, lineBindings, lineReminderDeliveries, lineReminderSettings, rsvps,
} from "../../../../db/schema";

function taipeiDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function deleteEvents(ids: string[]) {
  if (!ids.length) return;
  const db = getDb();
  await db.delete(lineBindCodes).where(inArray(lineBindCodes.eventId, ids));
  await db.delete(lineReminderDeliveries).where(inArray(lineReminderDeliveries.eventId, ids));
  await db.delete(lineReminderSettings).where(inArray(lineReminderSettings.eventId, ids));
  await db.delete(lineBindings).where(inArray(lineBindings.eventId, ids));
  await db.delete(rsvps).where(inArray(rsvps.eventId, ids));
  await db.delete(events).where(inArray(events.id, ids));
}

export async function POST(request: Request) {
  const config = env as unknown as { MAINTENANCE_SECRET?: string; REMINDER_SECRET?: string };
  const secret = config.MAINTENANCE_SECRET?.trim() || config.REMINDER_SECRET?.trim() || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || supplied !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSchema();
    const db = getDb();
    const now = new Date().toISOString();
    const [cancelled, ended] = await Promise.all([
      db.select({ id: events.id }).from(events).where(and(
        eq(events.status, "cancelled"),
        lt(events.cancelledAt, new Date(Date.now() - 30 * 86_400_000).toISOString()),
      )),
      db.select({ id: events.id }).from(events).where(and(
        eq(events.status, "active"),
        lt(events.eventDate, taipeiDateDaysAgo(90)),
      )),
    ]);
    const ids = [...new Set([...cancelled, ...ended].map((event) => event.id))];
    await deleteEvents(ids);
    await db.delete(lineBindCodes).where(lt(lineBindCodes.expiresAt, now));
    return Response.json({ ok: true, deletedEvents: ids.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "資料清理失敗" }, { status: 500 });
  }
}
