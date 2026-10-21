import { and, eq, sql } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import {
  activityLineGroups, events, lineBindings, lineReminderDeliveries, lineReminderSettings, rsvps, schedulerHealth, schedulerRuns,
} from "../../../../db/schema";
import { eventCard, lineConfig, pushMessages } from "../lib";
import { eventNotificationGroups } from "../groups";
import { closeElapsedEvents } from "../../../../lib/event-lifecycle";

const taipeiEvening = (eventDate: string, daysBefore: number) =>
  Date.parse(`${eventDate}T18:00:00+08:00`) - daysBefore * 24 * 60 * 60 * 1000;

// Cloudflare runs this Worker every five minutes.  Twenty minutes allows for
// occasional platform jitter while refusing a stale reminder later that day.
const allowedLateMinutes = 20;

const rules = [
  { key: "seven_days", label: "活動前 7 天提醒", setting: "sevenDays" as const, window: allowedLateMinutes,
    sendAt: (eventTime: number, eventDate: string) => taipeiEvening(eventDate, 7) },
  { key: "one_day", label: "活動前 1 天提醒", setting: "oneDay" as const, window: allowedLateMinutes,
    sendAt: (eventTime: number, eventDate: string) => taipeiEvening(eventDate, 1) },
  { key: "two_hours", label: "活動前 2 小時提醒", setting: "twoHours" as const, window: allowedLateMinutes,
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

  let runStage = "initializing";
  let checkedEvents = 0;
  let closedEvents = 0;
  let sentReminders = 0;
  let purgedRecords = 0;
  try {
    await ensureSchema();
    // This endpoint is invoked by the authenticated five-minute GitHub
    // schedule.  Running the lifecycle here means an activity ends even when
    // no visitor opens its public or management page.
    runStage = "closing_elapsed_activities";
    const closed = await closeElapsedEvents();
    closedEvents = closed.size;
    const db = getDb();
    const expiry = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    runStage = "purging_expired_records";
    const expired = await db.select({ id: events.id }).from(events).where(
      sql`(status = 'cancelled' AND substr(cancelled_at, 1, 10) <= ${expiry}) OR (status = 'active' AND event_date < ${expiry})`,
    );
    for (const event of expired) {
      await db.delete(lineReminderDeliveries).where(eq(lineReminderDeliveries.eventId, event.id));
      await db.delete(lineReminderSettings).where(eq(lineReminderSettings.eventId, event.id));
      await db.delete(lineBindings).where(eq(lineBindings.eventId, event.id));
      await db.delete(activityLineGroups).where(eq(activityLineGroups.eventId, event.id));
      await db.delete(rsvps).where(eq(rsvps.eventId, event.id));
      await db.delete(events).where(eq(events.id, event.id));
    }
    purgedRecords = expired.length;
    runStage = "loading_reminders";
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, location: events.location, address: events.address, description: events.description, shareToken: events.shareToken, shareCode: events.shareCode, updatedAt: events.updatedAt,
      sevenDays: lineReminderSettings.sevenDays,
      oneDay: lineReminderSettings.oneDay,
      twoHours: lineReminderSettings.twoHours,
    }).from(events)
      .innerJoin(lineReminderSettings, eq(events.id, lineReminderSettings.eventId))
      .where(eq(events.status, "active"));
    checkedEvents = rows.length;

    const sent: Array<{ eventId: string; reminder: string }> = [];
    const now = Date.now();
    runStage = "sending_reminders";
    for (const event of rows) {
      const eventTime = Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
      // An ended event must never become eligible again, even when its details
      // are edited after the original reminder window has passed.
      if (!Number.isFinite(eventTime) || eventTime <= now) continue;
      const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, event.id), eq(rsvps.response, "attending"),
      ));
      const attendingPeople = attending.reduce((sum, item) => sum + item.partySize, 0);
      const fingerprint = `${event.eventDate}T${event.startTime}|${event.updatedAt}`;
      const groups = await eventNotificationGroups(event.id);
      if (!groups.length) continue;

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
        const card = eventCard({ ...event, attendingPeople }, rule.label);
        await Promise.all(groups.map((group) => pushMessages(group.groupId, [card])));
        await db.insert(lineReminderDeliveries).values({
          id: crypto.randomUUID(), eventId: event.id,
          reminderKey: rule.key, eventFingerprint: fingerprint,
        });
        sent.push({ eventId: event.id, reminder: rule.key });
        sentReminders = sent.length;
      }
    }
    const completedAt = new Date().toISOString();
    runStage = "recording_result";
    await db.insert(schedulerRuns).values({
      id: crypto.randomUUID(), key: "line-reminders", runAt: completedAt,
      status: "success", stage: "completed", checkedEvents, closedEvents, sentReminders, purgedRecords,
    });
    await db.insert(schedulerHealth).values({
      key: "line-reminders", lastSuccessAt: completedAt, checkedEvents,
      closedEvents, sentReminders, purgedRecords,
    }).onConflictDoUpdate({
      target: schedulerHealth.key,
      set: {
        lastSuccessAt: completedAt, checkedEvents,
        closedEvents, sentReminders, purgedRecords,
      },
    });
    runStage = "pruning_audit";
    const auditExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(schedulerRuns).where(sql`key = 'line-reminders' AND run_at < ${auditExpiry}`);
    return Response.json({ ok: true, checked: checkedEvents, sent, purged: purgedRecords, closed: closedEvents, completedAt });
  } catch (error) {
    // Keep a bounded operational trace without persisting an exception's raw
    // message, which could contain third-party response data or identifiers.
    try {
      const db = getDb();
      await db.insert(schedulerRuns).values({
        id: crypto.randomUUID(), key: "line-reminders", runAt: new Date().toISOString(),
        status: "failed", stage: runStage, checkedEvents, closedEvents, sentReminders, purgedRecords,
      });
      // A prolonged outage must not turn the failure audit into unbounded
      // storage. Apply the same 30-day retention rule on this path too.
      const auditExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.delete(schedulerRuns).where(sql`key = 'line-reminders' AND run_at < ${auditExpiry}`);
    } catch {}
    return Response.json({ error: error instanceof Error ? error.message : "提醒排程失敗" }, { status: 500 });
  }
}
