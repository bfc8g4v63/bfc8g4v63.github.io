import { and, eq, or } from "drizzle-orm";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { companionCards, companionRequests, events, lineManagerTargets, mealAssignments, rsvps } from "../../../db/schema";
import { hashCode, verifyCredential } from "../admin/auth";
import { json, preflight } from "../cors";
import { managerRsvpMessage, pushText } from "../line/lib";
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

async function notifyPairedManagers(input: {
  eventId: string;
  eventTitle: string;
  name: string;
  partySize: number;
  change: string;
}) {
  try {
    const db = getDb();
    const [targets, attending, assignments] = await Promise.all([
      db.select({ lineUserId: lineManagerTargets.lineUserId }).from(lineManagerTargets)
        .where(eq(lineManagerTargets.eventId, input.eventId)),
      db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, input.eventId), eq(rsvps.response, "attending"),
      )),
      db.select({ people: mealAssignments.people }).from(mealAssignments)
        .where(eq(mealAssignments.eventId, input.eventId)),
    ]);
    if (!targets.length) return;
    const attendingPeople = attending.reduce((sum, item) => sum + item.partySize, 0);
    const assignedPeople = assignments.reduce((sum, item) => sum + item.people, 0);
    const text = managerRsvpMessage({
      ...input,
      attendingPeople,
      unassignedPeople: Math.max(0, attendingPeople - assignedPeople),
    });
    await Promise.allSettled(targets.map((target) => pushText(target.lineUserId, text)));
  } catch (error) {
    // A notification must never make an attendee's RSVP fail.
    console.error("Unable to send paired manager notification", error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "rsvp", 24, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `回覆過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const eventId = clean(body.eventId, 80);
    const shareToken = clean(body.shareToken, 80);
    const participantCode = clean(body.participantCode, 80);
    const suppliedAttendeeToken = clean(body.attendeeToken, 160);
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
      id: events.id, title: events.title, status: events.status, accessMode: events.accessMode,
      attendanceVisibility: events.attendanceVisibility,
      feePerPerson: events.feePerPerson,
      shareToken: events.shareToken, shareCode: events.shareCode, participantCodeHash: events.participantCodeHash,
    }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return json(request, { error: "找不到活動" }, 404);
    if (event.status === "cancelled") return json(request, { error: "這個活動已取消" }, 400);
    if (event.accessMode !== "public" && shareToken !== event.shareCode && shareToken !== event.shareToken) {
      return json(request, { error: "請從活動專屬連結參加" }, 403);
    }
    if (event.accessMode === "private" && !await verifyCredential(participantCode, event.participantCodeHash)) {
      return json(request, { error: "參加碼不正確" }, 403);
    }
    const [existingByName] = await db.select({
      id: rsvps.id, name: rsvps.name, viewerTokenHash: rsvps.viewerTokenHash, partySize: rsvps.partySize, response: rsvps.response, paymentStatus: rsvps.paymentStatus,
    }).from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.name, name))).limit(1);
    const attendeeTokenHash = suppliedAttendeeToken ? await hashCode(suppliedAttendeeToken) : "";
    const [existingByToken] = attendeeTokenHash
      ? await db.select({ id: rsvps.id, name: rsvps.name, viewerTokenHash: rsvps.viewerTokenHash, partySize: rsvps.partySize, response: rsvps.response, paymentStatus: rsvps.paymentStatus })
        .from(rsvps).where(and(eq(rsvps.eventId, eventId), eq(rsvps.viewerTokenHash, attendeeTokenHash))).limit(1)
      : [];
    if (existingByName && existingByToken && existingByName.id !== existingByToken.id) {
      return json(request, { error: "這個姓名已有其他回覆，請聯絡活動建立者協助處理" }, 409);
    }
    const existing = existingByToken || existingByName;
    if (existing?.viewerTokenHash) {
      if (!suppliedAttendeeToken || attendeeTokenHash !== existing.viewerTokenHash) {
        return json(request, {
          error: "為保護您的回覆，請使用原先報名的裝置，從活動連結重新開啟後再更新或取消。",
        }, 403);
      }
    }
    // Older responses did not retain a token after cancellation. Let their next
    // update establish one, while all newly created or updated responses remain
    // tied to the attendee's browser.
    const attendeeToken = suppliedAttendeeToken || crypto.randomUUID();
    const shareName = response === "attending" && (
      event.attendanceVisibility === "all"
      || (event.attendanceVisibility === "opt_in" && (body.shareName === true || body.shareName === "true"))
    );
    const attendanceChanged = existing?.partySize !== partySize || existing?.response !== response;
    const paymentStatus = response !== "attending" || event.feePerPerson <= 0
      ? "not_applicable"
      : attendanceChanged || !existing || !["paid", "waived"].includes(existing.paymentStatus)
        ? "unpaid"
        : existing.paymentStatus;
    const values = {
      // An attendee token remains valid when a creator corrects that attendee's
      // displayed name in the management dashboard.
      eventId, name: existingByToken?.name || name, partySize,
      diet: clean(body.diet, 120),
      note: clean(body.note, 300),
      response,
      paymentStatus,
      shareName,
      viewerTokenHash: attendeeTokenHash || await hashCode(attendeeToken),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      if (attendanceChanged) {
        await db.delete(mealAssignments).where(eq(mealAssignments.rsvpId, existing.id));
      }
      if (response === "not_attending") {
        await db.delete(companionCards).where(eq(companionCards.rsvpId, existing.id));
        await db.delete(companionRequests).where(or(
          eq(companionRequests.fromRsvpId, existing.id),
          eq(companionRequests.toRsvpId, existing.id),
        ));
      }
      await db.update(rsvps).set(values).where(eq(rsvps.id, existing.id));
    }
    else await db.insert(rsvps).values({ id: crypto.randomUUID(), ...values });
    const shouldNotifyManagers = existing ? attendanceChanged : response === "attending";
    if (shouldNotifyManagers) {
      const change = !existing
        ? "新增報名"
        : response !== "attending"
          ? "取消參加"
          : existing.response !== "attending"
            ? "改為參加"
            : "更新人數";
      const notification = notifyPairedManagers({
        eventId, eventTitle: event.title, name: values.name, partySize: response === "attending" ? partySize : 0, change,
      });
      const context = getRequestExecutionContext();
      if (context) context.waitUntil(notification);
      else await notification;
    }
    return json(request, { ok: true, attendeeToken });
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

export async function DELETE(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const eventId = clean(body.eventId, 80);
    const name = clean(body.name, 60);
    const attendeeToken = clean(body.attendeeToken, 160);
    if (!eventId || !name || !attendeeToken) return json(request, { error: "請使用原本報名的裝置與姓名" }, 400);
    const db = getDb();
    const [existingByName] = await db.select({ id: rsvps.id, viewerTokenHash: rsvps.viewerTokenHash }).from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.name, name))).limit(1);
    const attendeeTokenHash = await hashCode(attendeeToken);
    const [existingByToken] = await db.select({ id: rsvps.id, viewerTokenHash: rsvps.viewerTokenHash }).from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.viewerTokenHash, attendeeTokenHash))).limit(1);
    if (existingByName && existingByToken && existingByName.id !== existingByToken.id) return json(request, { error: "這個姓名已有其他回覆，請聯絡活動建立者協助處理" }, 409);
    const existing = existingByToken || existingByName;
    if (!existing || attendeeTokenHash !== existing.viewerTokenHash) return json(request, { error: "無法驗證這筆回覆" }, 403);
    await db.delete(mealAssignments).where(eq(mealAssignments.rsvpId, existing.id));
    await db.delete(companionRequests).where(or(
      eq(companionRequests.fromRsvpId, existing.id),
      eq(companionRequests.toRsvpId, existing.id),
    ));
    await db.delete(rsvps).where(eq(rsvps.id, existing.id));
    return json(request, { ok: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法刪除回覆" }, 500);
  }
}
