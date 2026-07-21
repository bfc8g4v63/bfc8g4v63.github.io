import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, rsvps } from "../../../db/schema";
import { hashCode } from "../admin/auth";
import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessages(error: unknown) {
  const messages: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    else if (typeof current === "string") messages.push(current);
    if (typeof current !== "object" || !("cause" in current)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join("\n");
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, "rsvp", 24, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `回覆過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const eventId = clean(body.eventId, 80);
    const shareToken = clean(body.shareToken, 80);
    const participantCode = clean(body.participantCode, 80);
    const name = clean(body.name, 60);
    const response = body.response === "not_attending" ? "not_attending" : "attending";
    const partySize = Math.max(
      1,
      typeof body.partySize === "number" && Number.isFinite(body.partySize)
        ? Math.floor(body.partySize)
        : 1,
    );
    if (!eventId || !name) return json(request, { error: "請填寫姓名" }, 400);
    const db = getDb();
    const [event] = await db.select({
      id: events.id, status: events.status, accessMode: events.accessMode,
      attendanceVisibility: events.attendanceVisibility,
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
    const attendeeToken = response === "attending" ? crypto.randomUUID() : "";
    const shareName = response === "attending" && (
      event.attendanceVisibility === "all"
      || (event.attendanceVisibility === "opt_in" && (body.shareName === true || body.shareName === "true"))
    );
    const values = {
      eventId, name, partySize,
      diet: clean(body.diet, 120),
      note: clean(body.note, 300),
      response,
      shareName,
      viewerTokenHash: attendeeToken ? await hashCode(attendeeToken) : "",
      updatedAt: new Date().toISOString(),
    };
    if (existing) await db.update(rsvps).set(values).where(eq(rsvps.id, existing.id));
    else await db.insert(rsvps).values({ id: crypto.randomUUID(), ...values });
    return json(request, { ok: true, attendeeToken: attendeeToken || undefined });
  } catch (error) {
    const message = errorMessages(error);
    if (message.includes("capacity_exceeded")) {
      return json(request, {
        error: "這個活動已額滿；已報名者仍可用相同姓名更新內容、減少人數或改為不參加。",
      }, 409);
    }
    return json(request, { error: message || "回覆失敗" }, 500);
  }
}
