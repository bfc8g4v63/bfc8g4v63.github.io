import { eq } from "drizzle-orm";
import { getDb, getD1 } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { events, rsvps } from "../../../db/schema";
import { hashCode } from "../admin/auth";
import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// This is one conditional statement so concurrent replies cannot both take the
// final remaining places. Existing attendees may still keep or reduce their
// party size if a legacy activity is already over its configured capacity.
const writeRsvpWithinCapacity = `
  INSERT INTO rsvps (
    id, event_id, name, party_size, diet, note, response, share_name, viewer_token_hash, updated_at
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM events
  WHERE id = ?
    AND (
      capacity IS NULL
      OR ? != 'attending'
      OR COALESCE((
        SELECT SUM(party_size) FROM rsvps
        WHERE event_id = ? AND response = 'attending' AND name <> ?
      ), 0) + ? <= capacity
      OR COALESCE((
        SELECT SUM(party_size) FROM rsvps
        WHERE event_id = ? AND response = 'attending' AND name <> ?
      ), 0) + ? <= COALESCE((
        SELECT SUM(party_size) FROM rsvps
        WHERE event_id = ? AND response = 'attending'
      ), 0)
    )
  ON CONFLICT(event_id, name) DO UPDATE SET
    party_size = excluded.party_size,
    diet = excluded.diet,
    note = excluded.note,
    response = excluded.response,
    share_name = excluded.share_name,
    viewer_token_hash = excluded.viewer_token_hash,
    updated_at = excluded.updated_at
`;

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
      capacity: events.capacity,
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
    const attendeeToken = response === "attending" ? crypto.randomUUID() : "";
    const shareName = response === "attending" && (
      event.attendanceVisibility === "all"
      || (event.attendanceVisibility === "opt_in" && (body.shareName === true || body.shareName === "true"))
    );
    const result = await getD1().prepare(writeRsvpWithinCapacity).bind(
      crypto.randomUUID(), eventId, name, partySize,
      clean(body.diet, 120), clean(body.note, 300), response, shareName ? 1 : 0,
      attendeeToken ? await hashCode(attendeeToken) : "", new Date().toISOString(),
      eventId, response,
      eventId, name, partySize,
      eventId, name, partySize,
      eventId,
    ).run();
    if (result.meta.changes !== 1) {
      const capacity = event.capacity ? `（上限 ${event.capacity} 人）` : "";
      return json(request, {
        error: `這個活動已額滿${capacity}；已報名者仍可用相同姓名更新內容、減少人數或改為不參加。`,
      }, 409);
    }
    return json(request, { ok: true, attendeeToken: attendeeToken || undefined });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "回覆失敗" }, 500);
  }
}
