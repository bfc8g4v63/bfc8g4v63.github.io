import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureSchema } from "../../../../db/init";
import { events, rsvps } from "../../../../db/schema";
import { clean, hashCode } from "../../admin/auth";
import { json, preflight } from "../../cors";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function eventView(
  event: typeof events.$inferSelect,
  replies: Array<{ partySize: number; response: string }>,
  attendeeNames: string[] | null,
) {
  const attending = replies.filter((reply) => reply.response === "attending");
  return {
    id: event.id,
    title: event.title,
    eventDate: event.eventDate,
    startTime: event.startTime,
    location: event.location,
    description: event.description,
    contactName: event.contactName,
    capacity: event.capacity,
    status: event.status,
    accessMode: event.accessMode,
    attendanceVisibility: event.attendanceVisibility,
    summary: {
      attendingPeople: attending.reduce((sum, reply) => sum + reply.partySize, 0),
      attendingReplies: attending.length,
      notAttendingReplies: replies.filter((reply) => reply.response === "not_attending").length,
    },
    roster: attendeeNames === null ? undefined : { names: attendeeNames },
  };
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const shareToken = clean(body.shareToken, 80);
    const participantCode = clean(body.participantCode, 80);
    const attendeeToken = clean(body.attendeeToken, 160);
    if (!shareToken) return json(request, { error: "分享連結不完整" }, 400);
    const db = getDb();
    const [event] = await db.select().from(events).where(eq(events.shareToken, shareToken)).limit(1);
    if (!event) return json(request, { error: "找不到活動或分享連結已失效" }, 404);
    // A cancelled activity must remain recognisable from its original share
    // URL, even when it was previously protected by a participant code.
    if (event.status === "cancelled") {
      const replies = await db.select({ partySize: rsvps.partySize, response: rsvps.response })
        .from(rsvps).where(eq(rsvps.eventId, event.id));
      return json(request, { event: eventView(event, replies, null) });
    }
    if (event.accessMode === "private") {
      if (!participantCode) return json(request, { error: "需要參加碼", requiresParticipantCode: true }, 401);
      if (await hashCode(participantCode) !== event.participantCodeHash) {
        return json(request, { error: "參加碼不正確", requiresParticipantCode: true }, 403);
      }
    }
    const replies = await db.select({ partySize: rsvps.partySize, response: rsvps.response })
      .from(rsvps).where(eq(rsvps.eventId, event.id));
    let attendeeNames: string[] | null = null;
    if (event.status === "active" && event.attendanceVisibility !== "count" && attendeeToken) {
      const tokenHash = await hashCode(attendeeToken);
      const [verified] = await db.select({ id: rsvps.id }).from(rsvps).where(and(
        eq(rsvps.eventId, event.id),
        eq(rsvps.response, "attending"),
        eq(rsvps.viewerTokenHash, tokenHash),
      )).limit(1);
      if (verified) {
        const visibleRows = await db.select({ name: rsvps.name }).from(rsvps).where(and(
          eq(rsvps.eventId, event.id),
          eq(rsvps.response, "attending"),
          ...(event.attendanceVisibility === "opt_in" ? [eq(rsvps.shareName, true)] : []),
        ));
        attendeeNames = visibleRows.map((row) => row.name);
      }
    }
    return json(request, { event: eventView(event, replies, attendeeNames) });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法開啟活動" }, 500);
  }
}
