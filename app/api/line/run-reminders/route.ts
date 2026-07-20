import { and, eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import {
  events, lineBindings, lineReminderDeliveries, lineReminderSettings, rsvps,
} from "../../../../db/schema";
import { eventMessage, lineConfig, pushText } from "../lib";

const rules = [
  { key: "seven_days", label: "活動前 7 天提醒", threshold: 10_080, window: 360, setting: "sevenDays" as const },
  { key: "one_day", label: "活動前 1 天提醒", threshold: 1_440, window: 180, setting: "oneDay" as const },
  { key: "two_hours", label: "活動前 2 小時提醒", threshold: 120, window: 120, setting: "twoHours" as const },
];

export async function POST(request: Request) {
  const { reminderSecret } = lineConfig();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!reminderSecret || supplied !== reminderSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const db = getDb();
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, location: events.location, updatedAt: events.updatedAt,
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
      const minutesUntil = (eventTime - now) / 60_000;
      const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, event.id), eq(rsvps.response, "attending"),
      ));
      const attendingPeople = attending.reduce((sum, item) => sum + item.partySize, 0);
      const fingerprint = `${event.eventDate}T${event.startTime}|${event.updatedAt}`;

      for (const rule of rules) {
        if (!event[rule.setting]) continue;
        if (minutesUntil > rule.threshold || minutesUntil <= rule.threshold - rule.window) continue;
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
    return Response.json({ ok: true, checked: rows.length, sent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提醒排程失敗" }, { status: 500 });
  }
}
