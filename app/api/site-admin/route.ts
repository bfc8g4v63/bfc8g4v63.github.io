import { asc, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { activityLineGroups, events, lineBindings, lineManagerTargets, lineReminderSettings, rsvps, siteOperatorCredentials } from "../../../db/schema";
import { clean, hashCredential, verifyCredential } from "../admin/auth";
import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

type OperatorBindings = { SITE_OPERATOR_CODE?: string };

export function OPTIONS(request: Request) {
  return preflight(request);
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function operationalStatus(event: { status: string; eventDate: string; startTime: string }) {
  if (event.status === "cancelled" || event.status === "completed") return event.status;
  const startsAt = Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
  // Activities have a start time but deliberately no guessed duration. Once
  // the start time has passed, the operator confirms whether it is still in
  // progress or should be marked completed in its own management dashboard.
  return Number.isFinite(startsAt) && startsAt <= Date.now() ? "needs_close_confirmation" : "upcoming";
}

async function verifyOperatorCode(code: string, storedHash: string | undefined, configuredCode: string) {
  if (storedHash) return verifyCredential(code, storedHash);
  return Boolean(configuredCode) && constantTimeEqual(code, configuredCode);
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "site-operator", 5, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `營運管理驗證過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);

    const body = await request.json() as Record<string, unknown>;
    await ensureSchema();
    const db = getDb();
    const configuredCode = (env as unknown as OperatorBindings).SITE_OPERATOR_CODE?.trim() || "";
    const [savedCredential] = await db.select().from(siteOperatorCredentials).where(eq(siteOperatorCredentials.key, "primary")).limit(1);
    const action = clean(body.action, 32);
    if (action && action !== "change_code") return json(request, { error: "不支援的營運管理操作" }, 400);

    if (action === "change_code") {
      const currentCode = clean(body.currentCode, 160);
      const nextCode = clean(body.nextCode, 160);
      const confirmCode = clean(body.confirmCode, 160);
      if (!savedCredential && !configuredCode) return json(request, { error: "營運管理尚未完成設定" }, 503);
      if (!await verifyOperatorCode(currentCode, savedCredential?.codeHash, configuredCode)) return json(request, { error: "目前的營運管理碼不正確" }, 403);
      if (nextCode.length < 12) return json(request, { error: "新營運管理碼至少需要 12 個字元" }, 400);
      if (nextCode !== confirmCode) return json(request, { error: "兩次輸入的新營運管理碼不一致" }, 400);
      if (currentCode === nextCode) return json(request, { error: "新營運管理碼需與目前不同" }, 400);
      const now = new Date().toISOString();
      const nextCodeHash = await hashCredential(nextCode);
      await db.insert(siteOperatorCredentials).values({ key: "primary", codeHash: nextCodeHash, updatedAt: now })
        .onConflictDoUpdate({ target: siteOperatorCredentials.key, set: { codeHash: nextCodeHash, updatedAt: now } });
      return json(request, { ok: true, message: "營運管理碼已更新" });
    }

    const suppliedCode = clean(body.code, 160);
    if (!savedCredential && !configuredCode) return json(request, { error: "營運管理尚未完成設定" }, 503);
    if (!await verifyOperatorCode(suppliedCode, savedCredential?.codeHash, configuredCode)) return json(request, { error: "營運管理碼不正確" }, 403);
    const eventRows = await db.select({
      id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime,
      location: events.location, address: events.address, description: events.description,
      creatorName: events.creatorName, contactName: events.contactName, contactPhone: events.contactPhone,
      capacity: events.capacity, feePerPerson: events.feePerPerson, status: events.status,
      accessMode: events.accessMode, attendanceVisibility: events.attendanceVisibility,
      cancelledAt: events.cancelledAt, createdAt: events.createdAt, updatedAt: events.updatedAt,
    }).from(events).orderBy(asc(events.eventDate), asc(events.startTime), desc(events.createdAt));
    if (!eventRows.length) return json(request, { summary: { total: 0, upcoming: 0, needsCloseConfirmation: 0, completed: 0, cancelled: 0 }, activities: [] });

    const eventIds = eventRows.map((event) => event.id);
    const [rsvpRows, primaryBindings, activityGroups, reminderRows, managerRows] = await Promise.all([
      db.select({ eventId: rsvps.eventId, response: rsvps.response, partySize: rsvps.partySize }).from(rsvps).where(inArray(rsvps.eventId, eventIds)),
      db.select({ eventId: lineBindings.eventId, groupName: lineBindings.groupName }).from(lineBindings).where(inArray(lineBindings.eventId, eventIds)),
      db.select({ eventId: activityLineGroups.eventId, groupName: activityLineGroups.groupName }).from(activityLineGroups).where(inArray(activityLineGroups.eventId, eventIds)),
      db.select({ eventId: lineReminderSettings.eventId, sevenDays: lineReminderSettings.sevenDays, oneDay: lineReminderSettings.oneDay, twoHours: lineReminderSettings.twoHours }).from(lineReminderSettings).where(inArray(lineReminderSettings.eventId, eventIds)),
      db.select({ eventId: lineManagerTargets.eventId }).from(lineManagerTargets).where(inArray(lineManagerTargets.eventId, eventIds)),
    ]);

    const rsvpByEvent = new Map<string, { attendingPeople: number; attendingReplies: number; waitlistPeople: number; responseCount: number }>();
    for (const row of rsvpRows) {
      const summary = rsvpByEvent.get(row.eventId) || { attendingPeople: 0, attendingReplies: 0, waitlistPeople: 0, responseCount: 0 };
      summary.responseCount += 1;
      if (row.response === "attending") { summary.attendingPeople += row.partySize; summary.attendingReplies += 1; }
      else if (row.response === "waitlisted") summary.waitlistPeople += row.partySize;
      rsvpByEvent.set(row.eventId, summary);
    }
    const groupNames = new Map<string, Set<string>>();
    for (const binding of [...primaryBindings, ...activityGroups]) {
      const names = groupNames.get(binding.eventId) || new Set<string>();
      names.add(binding.groupName);
      groupNames.set(binding.eventId, names);
    }
    const reminderByEvent = new Map(reminderRows.map((row) => [row.eventId, { sevenDays: Boolean(row.sevenDays), oneDay: Boolean(row.oneDay), twoHours: Boolean(row.twoHours) }]));
    const managerCount = new Map<string, number>();
    for (const row of managerRows) managerCount.set(row.eventId, (managerCount.get(row.eventId) || 0) + 1);

    const summary = { total: eventRows.length, upcoming: 0, needsCloseConfirmation: 0, completed: 0, cancelled: 0 };
    const activities = eventRows.map((event) => {
      const operational = operationalStatus(event);
      if (operational === "upcoming") summary.upcoming += 1;
      else if (operational === "needs_close_confirmation") summary.needsCloseConfirmation += 1;
      else if (operational === "completed") summary.completed += 1;
      else summary.cancelled += 1;
      return {
        ...event, operationalStatus: operational,
        rsvpSummary: rsvpByEvent.get(event.id) || { attendingPeople: 0, attendingReplies: 0, waitlistPeople: 0, responseCount: 0 },
        lineGroupNames: [...(groupNames.get(event.id) || [])], reminder: reminderByEvent.get(event.id) || null,
        managerTargetCount: managerCount.get(event.id) || 0,
      };
    });
    return json(request, { summary, activities });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法讀取全站活動總覽" }, 500);
  }
}
