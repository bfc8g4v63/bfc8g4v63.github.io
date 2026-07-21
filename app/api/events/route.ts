import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import {
  events, lineBindCodes, lineBindings, lineReminderDeliveries, lineReminderSettings, rsvps,
} from "../../../db/schema";
import { json, preflight } from "../cors";
import { clean, hashCode, requireEventManager } from "../admin/auth";
import { lineConfig, pushText } from "../line/lib";
import { rateLimit } from "../rate-limit";

const accessModes = new Set(["public", "unlisted", "private"]);
const attendanceVisibilities = new Set(["count", "opt_in", "all"]);

export function OPTIONS(request: Request) {
  return preflight(request);
}

function accessMode(value: unknown, fallback = "unlisted") {
  return typeof value === "string" && accessModes.has(value) ? value : fallback;
}

function attendanceVisibility(value: unknown, fallback = "count") {
  return typeof value === "string" && attendanceVisibilities.has(value) ? value : fallback;
}

function shareUrl(token: string) {
  return `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(token)}`;
}

function managerUrl(id: string, token: string) {
  // Keep the capability in the fragment so it is never sent as part of the
  // page request or a referrer header.
  return `https://bfc8g4v63.github.io/?manage=${encodeURIComponent(id)}#token=${encodeURIComponent(token)}`;
}

async function notifyBoundGroup(event: typeof events.$inferSelect, message: string) {
  if (!lineConfig().token) return;
  try {
    const [binding] = await getDb().select().from(lineBindings).where(eq(lineBindings.eventId, event.id)).limit(1);
    if (binding) await pushText(binding.groupId, message);
  } catch (error) {
    // A notification failure must not prevent the creator from cancelling or
    // deleting their activity. The status change still stops future reminders.
    console.error("Unable to notify the LINE group", error);
  }
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
        capacity: events.capacity, status: events.status, accessMode: events.accessMode,
        attendanceVisibility: events.attendanceVisibility,
        shareToken: events.shareToken,
      }).from(events).where(and(eq(events.accessMode, "public"), eq(events.status, "active")))
        .orderBy(asc(events.eventDate), asc(events.startTime)),
      db.select({
        eventId: rsvps.eventId, partySize: rsvps.partySize, response: rsvps.response,
      }).from(rsvps),
    ]);
    return json(request, {
      events: eventRows.map((event) => ({
        ...withSummary(event, rsvpRows), shareUrl: shareUrl(event.shareToken),
      })),
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法讀取活動" }, 500);
  }
}

function withSummary<T extends { id: string }>(event: T, rows: Array<{ eventId: string; partySize: number; response: string }>) {
  const replies = rows.filter((rsvp) => rsvp.eventId === event.id);
  const attending = replies.filter((rsvp) => rsvp.response === "attending");
  return {
    ...event,
    summary: {
      attendingPeople: attending.reduce((sum, rsvp) => sum + rsvp.partySize, 0),
      attendingReplies: attending.length,
      notAttendingReplies: replies.filter((rsvp) => rsvp.response === "not_attending").length,
    },
  };
}

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, "event-create", 8, 60 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `建立活動過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const title = clean(body.title, 80);
    const creatorName = clean(body.creatorName, 60);
    const eventDate = clean(body.eventDate, 10);
    const startTime = clean(body.startTime, 5);
    const location = clean(body.location, 160);
    const editCode = clean(body.editCode, 80);
    const mode = accessMode(body.accessMode);
    const visibility = attendanceVisibility(body.attendanceVisibility);
    const participantCode = clean(body.participantCode, 80);
    if (!title || !creatorName || !eventDate || !startTime || !location) {
      return json(request, { error: "請填寫活動名稱、日期、時間與地點" }, 400);
    }
    if (editCode.length < 6) {
      return json(request, { error: "管理碼至少需要 6 個字元" }, 400);
    }
    if (mode === "private" && participantCode.length < 4) {
      return json(request, { error: "私人活動的參加碼至少需要 4 個字" }, 400);
    }
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const managerToken = crypto.randomUUID();
    await getDb().insert(events).values({
      id, title, eventDate, startTime, location,
      description: clean(body.description, 1000),
      creatorName,
      contactName: clean(body.contactName, 60),
      contactPhone: clean(body.contactPhone, 40),
      capacity: typeof body.capacity === "number" && body.capacity > 0
        ? Math.min(Math.floor(body.capacity), 999) : null,
      accessMode: mode,
      attendanceVisibility: visibility,
      shareToken: token,
      participantCodeHash: mode === "private" ? await hashCode(participantCode) : "",
      editCodeHash: await hashCode(editCode),
      managerTokenHash: await hashCode(managerToken),
    });
    return json(request, {
      id,
      shareToken: token,
      shareUrl: shareUrl(token),
      // Returned only at creation time. The database stores only its hash.
      managerToken,
      managerUrl: managerUrl(id, managerToken),
    }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "建立活動失敗" }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.id, body.editCode, body.managerToken);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const existing = access.event;
    const id = existing.id;
    const status = body.status === "cancelled" || body.status === "active" ? body.status : existing.status;
    const title = body.title === undefined ? existing.title : clean(body.title, 80);
    const eventDate = body.eventDate === undefined ? existing.eventDate : clean(body.eventDate, 10);
    const startTime = body.startTime === undefined ? existing.startTime : clean(body.startTime, 5);
    const location = body.location === undefined ? existing.location : clean(body.location, 160);
    const mode = body.accessMode === undefined ? existing.accessMode : accessMode(body.accessMode, existing.accessMode);
    const visibility = body.attendanceVisibility === undefined
      ? existing.attendanceVisibility
      : attendanceVisibility(body.attendanceVisibility, existing.attendanceVisibility);
    const participantCode = clean(body.participantCode, 80);
    if (!title || !eventDate || !startTime || !location) {
      return json(request, { error: "請填寫活動名稱、日期、時間與地點" }, 400);
    }
    if (mode === "private" && !existing.participantCodeHash && participantCode.length < 4) {
      return json(request, { error: "請設定至少 4 個字的參加碼" }, 400);
    }
    const participantCodeHash = mode !== "private" ? ""
      : participantCode ? await hashCode(participantCode) : existing.participantCodeHash;
    const shareToken = existing.shareToken || crypto.randomUUID();
    const cancelledAt = status === "cancelled"
      ? (existing.status === "cancelled" ? existing.cancelledAt : new Date().toISOString())
      : null;
    await getDb().update(events).set({
      title, eventDate, startTime, location, status, accessMode: mode, attendanceVisibility: visibility,
      shareToken, participantCodeHash, cancelledAt,
      description: body.description === undefined ? existing.description : clean(body.description, 1000),
      creatorName: body.creatorName === undefined ? existing.creatorName : clean(body.creatorName, 60),
      contactName: body.contactName === undefined ? existing.contactName : clean(body.contactName, 60),
      contactPhone: body.contactPhone === undefined ? existing.contactPhone : clean(body.contactPhone, 40),
      capacity: body.capacity === undefined ? existing.capacity
        : typeof body.capacity === "number" && body.capacity > 0
          ? Math.min(Math.floor(body.capacity), 999) : null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(events.id, id), eq(events.editCodeHash, existing.editCodeHash)));
    if (existing.status !== "cancelled" && status === "cancelled") {
      await notifyBoundGroup(
        existing,
        `活動取消通知\n「${existing.title}」原訂 ${existing.eventDate} ${existing.startTime} 的活動已由建立者取消。`,
      );
    }
    return json(request, { ok: true, shareToken, shareUrl: shareUrl(shareToken) });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "修改活動失敗" }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.id, body.editCode, body.managerToken);
    if ("error" in access) return json(request, { error: access.error }, access.status);

    const db = getDb();
    await notifyBoundGroup(
      access.event,
      `活動刪除通知\n「${access.event.title}」已由建立者永久刪除，活動提醒將不再發送。`,
    );
    // Delete dependent records explicitly. This keeps the behaviour reliable
    // even if a deployed SQLite database has foreign-key cascades disabled.
    await db.delete(lineBindCodes).where(eq(lineBindCodes.eventId, access.event.id));
    await db.delete(lineReminderDeliveries).where(eq(lineReminderDeliveries.eventId, access.event.id));
    await db.delete(lineReminderSettings).where(eq(lineReminderSettings.eventId, access.event.id));
    await db.delete(lineBindings).where(eq(lineBindings.eventId, access.event.id));
    await db.delete(rsvps).where(eq(rsvps.eventId, access.event.id));
    await db.delete(events).where(eq(events.id, access.event.id));
    return json(request, { ok: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "刪除活動失敗" }, 500);
  }
}
