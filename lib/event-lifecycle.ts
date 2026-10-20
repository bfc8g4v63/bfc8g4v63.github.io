import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { events } from "../db/schema";

export function eventTimestamp(eventDate: string, time: string) {
  const normalizedDate = eventDate.replaceAll("/", "-");
  const value = Date.parse(`${normalizedDate}T${time}:00+08:00`);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function validEventTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validEventSchedule(eventDate: string, startTime: string, endTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !validEventTime(startTime) || !validEventTime(endTime)) return false;
  return eventTimestamp(eventDate, endTime) > eventTimestamp(eventDate, startTime);
}

// There is no guessed duration at read time. The selected end time is the
// lifecycle boundary: once it passes, status is persisted as completed so
// public RSVP, manager tools and reminders all agree.
export async function closeElapsedEvents(now = Date.now()) {
  const db = getDb();
  const activeEvents = await db.select({ id: events.id, eventDate: events.eventDate, startTime: events.startTime, endTime: events.endTime })
    .from(events).where(eq(events.status, "active"));
  const expiredIds = activeEvents
    // A legacy row without a usable end time is still never left permanently
    // open: fall back to its start time until the schema repair fills it.
    .filter((event) => eventTimestamp(event.eventDate, validEventTime(event.endTime) ? event.endTime : event.startTime) <= now)
    .map((event) => event.id);
  if (!expiredIds.length) return new Set<string>();
  const updatedAt = new Date(now).toISOString();
  await Promise.all(expiredIds.map((id) => db.update(events).set({ status: "completed", updatedAt }).where(eq(events.id, id))));
  return new Set(expiredIds);
}
