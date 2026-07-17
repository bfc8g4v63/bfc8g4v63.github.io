import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, rsvps } from "../../../db/schema";

async function hashCode(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function GET() {
  try {
    await ensureSchema();
    const db = getDb();
    const [eventRows, rsvpRows] = await Promise.all([
      db.select({ id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime, location: events.location, description: events.description, contactName: events.contactName, contactPhone: events.contactPhone, capacity: events.capacity, status: events.status }).from(events).orderBy(asc(events.eventDate), asc(events.startTime)),
      db.select({ id: rsvps.id, eventId: rsvps.eventId, name: rsvps.name, partySize: rsvps.partySize, diet: rsvps.diet, note: rsvps.note, response: rsvps.response }).from(rsvps),
    ]);
    return Response.json({ events: eventRows.map((event) => ({ ...event, rsvps: rsvpRows.filter((rsvp) => rsvp.eventId === event.id) })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "讀取活動失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const title = clean(body.title, 80), eventDate = clean(body.eventDate, 10), startTime = clean(body.startTime, 5), location = clean(body.location, 160), editCode = clean(body.editCode, 80);
    if (!title || !eventDate || !startTime || !location) return Response.json({ error: "請填寫活動名稱、日期、時間和地點" }, { status: 400 });
    if (editCode.length < 4) return Response.json({ error: "活動修改碼至少需要 4 碼" }, { status: 400 });
    const id = crypto.randomUUID();
    await getDb().insert(events).values({
      id, title, eventDate, startTime, location,
      description: clean(body.description, 1000), contactName: clean(body.contactName, 60), contactPhone: clean(body.contactPhone, 40),
      capacity: typeof body.capacity === "number" && body.capacity > 0 ? Math.min(Math.floor(body.capacity), 999) : null,
      editCodeHash: await hashCode(editCode),
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "建立活動失敗" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const id = clean(body.id, 80), editCode = clean(body.editCode, 80);
    const [existing] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return Response.json({ error: "找不到這個活動" }, { status: 404 });
    if (!editCode || await hashCode(editCode) !== existing.editCodeHash) return Response.json({ error: "活動修改碼不正確" }, { status: 403 });
    const status = body.status === "cancelled" || body.status === "active" ? body.status : existing.status;
    const title = body.title === undefined ? existing.title : clean(body.title, 80);
    const eventDate = body.eventDate === undefined ? existing.eventDate : clean(body.eventDate, 10);
    const startTime = body.startTime === undefined ? existing.startTime : clean(body.startTime, 5);
    const location = body.location === undefined ? existing.location : clean(body.location, 160);
    if (!title || !eventDate || !startTime || !location) return Response.json({ error: "請填寫活動名稱、日期、時間和地點" }, { status: 400 });
    await getDb().update(events).set({
      title, eventDate, startTime, location, status,
      description: body.description === undefined ? existing.description : clean(body.description, 1000),
      contactName: body.contactName === undefined ? existing.contactName : clean(body.contactName, 60),
      contactPhone: body.contactPhone === undefined ? existing.contactPhone : clean(body.contactPhone, 40),
      capacity: body.capacity === undefined ? existing.capacity : typeof body.capacity === "number" && body.capacity > 0 ? Math.min(Math.floor(body.capacity), 999) : null,
      updatedAt: new Date().toISOString(),
    }).where(eq(events.id, id));
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "修改活動失敗" }, { status: 500 }); }
}
