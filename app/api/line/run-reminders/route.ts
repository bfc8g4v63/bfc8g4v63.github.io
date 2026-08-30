import { and, eq, sql } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import {
  events, lineBindings, lineReminderDeliveries, lineReminderSettings, rsvps,
} from "../../../../db/schema";
import { eventMessage, lineConfig, pushText } from "../lib";

const taipeiEvening = (eventDate: string, daysBefore: number) =>
  Date.parse(`${eventDate}T18:00:00+08:00`) - daysBefore * 24 * 60 * 60 * 1000;

const rules = [
  { key: "seven_days", label: "活動前 7 天提醒", setting: "sevenDays" as const, window: 90,
    sendAt: (eventTime: number, eventDate: string) => taipeiEvening(eventDate, 7) },
  // Scheduled GitHub Actions runs can occasionally arrive late. The delivery
  // table below still guarantees this reminder is sent at most once.
  { key: "one_day", label: "活動前 1 天提醒", setting: "oneDay" as const, window: 12 * 60,
    sendAt: (eventTime: number, eventDate: string) => taipeiEvening(eventDate, 1) },
  { key: "two_hours", label: "活動前 2 小時提醒", setting: "twoHours" as const, window: 120,
    sendAt: (eventTime: number) => eventTime - 120 * 60 * 1000 },
];

function matchesSecret(supplied: string, expected: string) {
  if (!expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function POST(request: Request) {
  const { reminderSecret, schedulerSecret } = lineConfig();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!matchesSecret(supplied, reminderSecret) && !matchesSecret(supplied, schedulerSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const db = getDb();
    const expiry = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const expired = await db.select({ id: events.id }).from(events).where(
      sql`(status = 'cancelled' AND substr(cancelled_at, 1, 10) <= ${expiry}) OR (status = 'active' AND event_date < ${expiry})`,
    );
    for (const event of expired) {
      await db.delete(lineReminderDeliveries).where(eq(lineReminderDeliveries.eventId, event.id));
      await db.delete(lineReminderSettings).where(eq(lineReminderSettings.eventId, event.id));
      await db.delete(lineBindings).where(eq(lineBindings.eventId, event.id));
      await db.delete(rsvps).where(eq(rsvps.eventId, event.id));
      await db.delete(events).where(eq(events.id, event.id));
    }
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, location: events.location, shareToken: events.shareToken, updatedAt: events.updatedAt,
      groupId: lineBindings.groupId,
      sevenDays: lineReminderSettings.sevenDays,
      oneDay: lineReminderSettings.oneDay,
      twoHours: lineReminderSettings.twoHours,
    }).from(events)
      .innerJoin(lineBindings, eq(events.id, lineBindings.eventId))
      .innerJoin(lineReminderSettings, eq(events.id, lineReminderSettings.eventId))
      .where(eq(events.status, "active"));

    const sent: Array<{ eventId: string; reminder: string }> = [];
    const now = Date.now();
    for (const event of rows) {
      const eventTime = Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
      if (!Number.isFinite(eventTime)) continue;
      const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, event.id), eq(rsvps.response, "attending"),
      ));
      const attendingPeople = attending.reduce((sum, item) => sum + item.partySize, 0);
      const fingerprint = `${event.eventDate}T${event.startTime}|${event.updatedAt}`;

      for (const rule of rules) {
        if (!event[rule.setting]) continue;
        const minutesSince = (now - rule.sendAt(eventTime, event.eventDate)) / 60_000;
        if (minutesSince < 0 || minutesSince > rule.window) continue;
        const [delivered] = await db.select({ id: lineReminderDeliveries.id })
          .from(lineReminderDeliveries).where(and(
            eq(lineReminderDeliveries.eventId, event.id),
            eq(lineReminderDeliveries.reminderKey, rule.key),
            eq(lineReminderDeliveries.eventFingerprint, fingerprint),
          )).limit(1);
        if (delivered) continue;
        await pushText(event.groupId, eventMessage({ ...event, attendingPeople }, rule.label));
        await db.insert(lineReminderDeliveries).values({
          id: crypto.randomUUID(), eventId: event.id,
          reminderKey: rule.key, eventFingerprint: fingerprint,
        });
        sent.push({ eventId: event.id, reminder: rule.key });
      }
    }
    return Response.json({ ok: true, checked: rows.length, sent, purged: expired.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提醒排程失敗" }, { status: 500 });
  }
}
