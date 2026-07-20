import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, rsvps } from "../../../db/schema";
import { json, preflight } from "../cors";
import { clean, hashCode } from "../admin/auth";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const db = getDb();
    const [eventRows, rsvpRows] = await Promise.all([
      db.select({
        id: events.id, title: events.title, eventDate: events.eventDate,
        startTime: events.startTime, location: events.location,
        description: events.description, contactName: events.contactName,
        capacity: events.capacity, status: events.status,
      }).from(events).orderBy(asc(events.eventDate), asc(events.startTime)),
      db.select({
        eventId: rsvps.eventId, partySize: rsvps.partySize, response: rsvps.response,
      }).from(rsvps),
    ]);
    return json(request, {
      events: eventRows.map((event) => {
        const replies = rsvpRows.filter((rsvp) => rsvp.eventId === event.id);
        const attending = replies.filter((rsvp) => rsvp.response === "attending");
        return {
          ...event,
          summary: {
            attendingPeople: attending.reduce((sum, rsvp) => sum + rsvp.partySize, 0),
            attendingReplies: attending.length,
            notAttendingReplies: replies.filter((rsvp) => rsvp.response === "not_attending").length,
          },
        };
      }),
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "讀取活動失敗" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const title = clean(body.title, 80);
    const eventDate = clean(body.eventDate, 10);
    const startTime = clean(body.startTime, 5);
    const location = clean(body.location, 160);
    const editCode = clean(body.editCode, 80);
    if (!title || !eventDate || !startTime || !location) {
      return json(request, { error: "請填寫活動名稱、日期、時間和地點" }, 400);
    }
    if (editCode.length < 4) {
      return json(request, { error: "活動修改碼至少需要 4 碼" }, 400);
    }
    const id = crypto.randomUUID();
    await getDb().insert(events).values({
      id, title, eventDate, startTime, location,
      description: clean(body.description, 1000),
      contactName: clean(body.contactName, 60),
      contactPhone: clean(body.contactPhone, 40),
      capacity: typeof body.capacity === "number" && body.capacity > 0
        ? Math.min(Math.floor(body.capacity), 999) : null,
      editCodeHash: await hashCode(editCode),
    });
    return json(request, { id }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "建立活動失敗" }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const id = clean(body.id, 80);
    const editCode = clean(body.editCode, 80);
    const [existing] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return json(request, { error: "找不到這個活動" }, 404);
    if (!editCode || await hashCode(editCode) !== existing.editCodeHash) {
      return json(request, { error: "活動修改碼不正確" }, 403);
    }
    const status = body.status === "cancelled" || body.status === "active" ? body.status : existing.status;
    const title = body.title === undefined ? existing.title : clean(body.title, 80);
    const eventDate = body.eventDate === undefined ? existing.eventDate : clean(body.eventDate, 10);
    const startTime = body.startTime === undefined ? existing.startTime : clean(body.startTime, 5);
    const location = body.location === undefined ? existing.location : clean(body.location, 160);
    if (!title || !eventDate || !startTime || !location) {
      return json(request, { error: "請填寫活動名稱、日期、時間和地點" }, 400);
    }
    await getDb().update(events).set({
      title, eventDate, startTime, location, status,
      description: body.description === undefined ? existing.description : clean(body.description, 1000),
      contactName: body.contactName === undefined ? existing.contactName : clean(body.contactName, 60),
      contactPhone: body.contactPhone === undefined ? existing.contactPhone : clean(body.contactPhone, 40),
      capacity: body.capacity === undefined ? existing.capacity
        : typeof body.capacity === "number" && body.capacity > 0
          ? Math.min(Math.floor(body.capacity), 999) : null,
      updatedAt: new Date().toISOString(),
    }).where(eq(events.id, id));
    return json(request, { ok: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "修改活動失敗" }, 500);
  }
}
