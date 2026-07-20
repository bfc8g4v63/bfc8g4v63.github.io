import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, rsvps } from "../../../db/schema";
import { hashCode } from "../admin/auth";
import { json, preflight } from "../cors";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const eventId = clean(body.eventId, 80);
    const shareToken = clean(body.shareToken, 80);
    const participantCode = clean(body.participantCode, 80);
    const name = clean(body.name, 60);
    const response = body.response === "not_attending" ? "not_attending" : "attending";
    const partySize = Math.max(1, Math.min(
      10,
      typeof body.partySize === "number" ? Math.floor(body.partySize) : 1,
    ));
    if (!eventId || !name) return json(request, { error: "請填寫姓名" }, 400);
    const db = getDb();
    const [event] = await db.select({
      id: events.id, status: events.status, accessMode: events.accessMode,
      shareToken: events.shareToken, participantCodeHash: events.participantCodeHash,
    }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return json(request, { error: "找不到活動" }, 404);
    if (event.status === "cancelled") return json(request, { error: "這個活動已取消" }, 400);
    if (event.accessMode !== "public" && shareToken !== event.shareToken) {
      return json(request, { error: "請從活動專屬連結參加" }, 403);
    }
    if (event.accessMode === "private" && await hashCode(participantCode) !== event.participantCodeHash) {
      return json(request, { error: "參加碼不正確" }, 403);
    }
    const [existing] = await db.select({ id: rsvps.id }).from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.name, name))).limit(1);
    const values = {
      eventId, name, partySize,
      diet: clean(body.diet, 120),
      note: clean(body.note, 300),
      response,
      updatedAt: new Date().toISOString(),
    };
    if (existing) await db.update(rsvps).set(values).where(eq(rsvps.id, existing.id));
    else await db.insert(rsvps).values({ id: crypto.randomUUID(), ...values });
    return json(request, { ok: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "回覆失敗" }, 500);
  }
}
