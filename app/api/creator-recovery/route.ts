import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import {
  events, lineBindings, lineManagerBatchBindCodes, lineManagerBindCodes,
  lineManagerTargets, mealAssignments, mealTables, rsvps,
} from "../../../db/schema";
import { clean, verifyCredential } from "../admin/auth";
import { json, preflight } from "../cors";
import { lineConfig } from "../line/lib";
import { rateLimit } from "../rate-limit";
import { eventShareUrl } from "../../../lib/event-share";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function eventStartsAt(event: { eventDate: string; startTime: string }) {
  return Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
}

function eventIdChunks(eventIds: string[], size = 80) {
  return Array.from({ length: Math.ceil(eventIds.length / size) }, (_, index) => eventIds.slice(index * size, (index + 1) * size));
}

async function createUniqueManagerBatchCode() {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const [[single], [batch]] = await Promise.all([
      db.select({ code: lineManagerBindCodes.code }).from(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, code)).limit(1),
      db.select({ code: lineManagerBatchBindCodes.code }).from(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, code)).limit(1),
    ]);
    if (!single && !batch) return code;
  }
  throw new Error("暫時無法產生管理提醒綁定碼，請再試一次");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action === "unlock" || body.action === "create_manager_batch_binding_code"
      ? body.action
      : "search";
    const limit = await rateLimit(request, `creator-recovery-${action}`, action === "search" ? 8 : 5, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `操作過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);

    const creatorName = clean(body.creatorName, 60);
    if (creatorName.length < 2) return json(request, { error: "請輸入完整的管理者名稱" }, 400);

    await ensureSchema();
    const db = getDb();
    // Activities created before recovery was introduced do not have creator_name.
    // Their existing contact name remains the recovery name so no activity is lost.
    const creatorMatch = or(
      eq(events.creatorName, creatorName),
      and(eq(events.creatorName, ""), eq(events.contactName, creatorName)),
    );
    if (action === "search") {
      // Search intentionally reveals no count, ID, title, date, or link.
      const [match] = await db.select({ creatorName: events.creatorName }).from(events)
        .where(creatorMatch).limit(1);
      return json(request, { matches: match ? [{ creatorName: match.creatorName || creatorName }] : [] });
    }

    const editCode = clean(body.editCode, 80);
    // Older activities were created with four-digit management codes.
    // New activities still require six characters when they are created.
    if (editCode.length < 4) return json(request, { error: "請輸入至少 4 個字元的管理碼" }, 400);
    const rows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate,
      startTime: events.startTime, status: events.status, shareToken: events.shareToken, shareCode: events.shareCode,
      capacity: events.capacity,
      editCodeHash: events.editCodeHash,
    }).from(events).where(creatorMatch).orderBy(desc(events.createdAt));
    const matches = [];
    for (const event of rows) {
      if (await verifyCredential(editCode, event.editCodeHash)) matches.push(event);
    }
    if (!matches.length) return json(request, { error: "管理者名稱或管理碼不正確" }, 403);
    if (action === "create_manager_batch_binding_code") {
      if (!lineConfig().token || !lineConfig().channelSecret) {
        return json(request, { error: "請先完成 LINE 小幫手設定" }, 503);
      }
      const selectedIds = Array.isArray(body.eventIds)
        ? [...new Set(body.eventIds.filter((value): value is string => typeof value === "string").map((value) => clean(value, 80)).filter(Boolean))]
        : [];
      if (!selectedIds.length) return json(request, { error: "請至少選擇一場尚未開始的活動" }, 400);
      const selected = matches.filter((event) => selectedIds.includes(event.id)
        && event.status === "active" && eventStartsAt(event) > Date.now());
      if (selected.length !== selectedIds.length) {
        return json(request, { error: "僅能綁定仍在進行且尚未開始的活動，請重新勾選" }, 400);
      }
      const code = await createUniqueManagerBatchCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      // A single selected activity must use the exact same binding-code record
      // as the per-activity dashboard. The batch record is only for two or more
      // activities, so both entry points are accepted by the LINE webhook alike.
      if (selected.length === 1) {
        await db.delete(lineManagerBindCodes).where(eq(lineManagerBindCodes.eventId, selected[0].id));
        await db.insert(lineManagerBindCodes).values({ code, eventId: selected[0].id, expiresAt });
      } else {
        await db.insert(lineManagerBatchBindCodes).values({
          code,
          eventIds: JSON.stringify(selected.map((event) => event.id)),
          expiresAt,
        });
      }
      return json(request, {
        ok: true,
        code,
        expiresAt,
        count: selected.length,
        activities: selected.map((event) => ({ id: event.id, title: event.title })),
      });
    }
    const eventIds = matches.map((event) => event.id);
    const chunks = eventIdChunks(eventIds);
    const [attendeeGroups, bindingGroups, managerTargetGroups, tableGroups, assignmentGroups] = await Promise.all([
      Promise.all(chunks.map((ids) => db.select({ id: rsvps.id, eventId: rsvps.eventId, partySize: rsvps.partySize }).from(rsvps).where(and(
        inArray(rsvps.eventId, ids), eq(rsvps.response, "attending"),
      )))),
      Promise.all(chunks.map((ids) => db.select({ eventId: lineBindings.eventId, groupName: lineBindings.groupName }).from(lineBindings)
        .where(inArray(lineBindings.eventId, ids)))),
      Promise.all(chunks.map((ids) => db.select({ eventId: lineManagerTargets.eventId }).from(lineManagerTargets)
        .where(inArray(lineManagerTargets.eventId, ids)))),
      Promise.all(chunks.map((ids) => db.select({ eventId: mealTables.eventId }).from(mealTables)
        .where(inArray(mealTables.eventId, ids)))),
      Promise.all(chunks.map((ids) => db.select({ eventId: mealAssignments.eventId, rsvpId: mealAssignments.rsvpId, people: mealAssignments.people }).from(mealAssignments)
        .where(inArray(mealAssignments.eventId, ids)))),
    ]);
    const attendeeRows = attendeeGroups.flat();
    const bindingRows = bindingGroups.flat();
    const managerTargetRows = managerTargetGroups.flat();
    const tableRows = tableGroups.flat();
    const assignmentRows = assignmentGroups.flat();
    const attendingPeopleByEvent = new Map<string, number>();
    const attendeeById = new Map<string, { eventId: string; partySize: number }>();
    for (const attendee of attendeeRows) {
      attendeeById.set(attendee.id, attendee);
      attendingPeopleByEvent.set(
        attendee.eventId,
        (attendingPeopleByEvent.get(attendee.eventId) || 0) + attendee.partySize,
      );
    }
    const assignedPeopleByRsvp = new Map<string, number>();
    for (const assignment of assignmentRows) {
      assignedPeopleByRsvp.set(assignment.rsvpId, (assignedPeopleByRsvp.get(assignment.rsvpId) || 0) + assignment.people);
    }
    const unassignedPeopleByEvent = new Map<string, number>();
    for (const [rsvpId, attendee] of attendeeById) {
      const remaining = Math.max(0, attendee.partySize - (assignedPeopleByRsvp.get(rsvpId) || 0));
      unassignedPeopleByEvent.set(attendee.eventId, (unassignedPeopleByEvent.get(attendee.eventId) || 0) + remaining);
    }
    const lineGroupByEvent = new Map(bindingRows.map((binding) => [binding.eventId, binding.groupName]));
    const managerTargetCountByEvent = new Map<string, number>();
    for (const target of managerTargetRows) {
      managerTargetCountByEvent.set(target.eventId, (managerTargetCountByEvent.get(target.eventId) || 0) + 1);
    }
    const tableCountByEvent = new Map<string, number>();
    for (const table of tableRows) {
      tableCountByEvent.set(table.eventId, (tableCountByEvent.get(table.eventId) || 0) + 1);
    }
    return json(request, {
      activities: matches.map(({ editCodeHash: _editCodeHash, ...event }) => {
        const attendingPeople = attendingPeopleByEvent.get(event.id) || 0;
        return {
          ...event,
          attendingPeople,
          remainingCapacity: event.capacity === null ? null : Math.max(0, event.capacity - attendingPeople),
          lineGroupName: lineGroupByEvent.get(event.id) || null,
          managerTargetCount: managerTargetCountByEvent.get(event.id) || 0,
          unassignedPeople: tableCountByEvent.has(event.id) ? unassignedPeopleByEvent.get(event.id) || 0 : null,
          shareUrl: eventShareUrl(event.shareCode, event.shareToken),
        };
      }),
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法取得管理活動" }, 500);
  }
}
