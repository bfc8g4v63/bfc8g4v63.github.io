import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { activityLineGroups, events, lineBindCodes, lineBindings, lineGroups, lineManagerBatchBindCodes, lineManagerBindCodes, lineManagerTargets, lineReminderSettings, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { clean, hashCredential, requireEventManager, verifyCredential } from "../auth";
import { activityListCard, eventCard, lineConfig, pushMessages, pushText } from "../../line/lib";
import { eventNotificationGroups, type NotificationGroup } from "../../line/groups";
import { rateLimit } from "../../rate-limit";
import { eventShareUrl } from "../../../../lib/event-share";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function boolean(value: unknown) {
  return value === true;
}

function credentialFrom(body: Record<string, unknown>) {
  return clean(body.managerToken, 160) || clean(body.editCode, 80);
}

function eventStartsAt(event: { eventDate: string; startTime: string }) {
  return Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
}

async function adoptCurrentGroup(
  credential: string,
  binding?: { groupId: string; groupName: string } | null,
) {
  if (!binding || !credential) return;
  const db = getDb();
  const [known] = await db.select().from(lineGroups).where(eq(lineGroups.groupId, binding.groupId)).limit(1);
  const now = new Date().toISOString();
  const ownerCredentialHash = await hashCredential(credential);
  if (known?.ownerCredentialHash) return;
  if (known) {
    await db.update(lineGroups).set({
      groupName: binding.groupName,
      ownerCredentialHash,
      updatedAt: now,
    }).where(eq(lineGroups.groupId, binding.groupId));
    return;
  }
  await db.insert(lineGroups).values({
    groupId: binding.groupId, groupName: binding.groupName,
    ownerCredentialHash, boundAt: now, updatedAt: now,
  }).onConflictDoNothing();
}

async function ownedGroups(credential: string) {
  if (!credential) return [];
  const rows = await getDb().select().from(lineGroups).orderBy(asc(lineGroups.groupName));
  const result = [] as typeof rows;
  for (const group of rows) {
    if (group.ownerCredentialHash && await verifyCredential(credential, group.ownerCredentialHash)) result.push(group);
  }
  return result;
}

async function groupsPreviouslyUsedByCreator(editCode: string, creatorName: string) {
  if (!editCode || !creatorName) return [];
  const db = getDb();
  const creatorEvents = await db.select({ id: events.id, editCodeHash: events.editCodeHash })
    .from(events).where(eq(events.creatorName, creatorName));
  const matchingEventIds: string[] = [];
  for (const event of creatorEvents) {
    if (await verifyCredential(editCode, event.editCodeHash)) matchingEventIds.push(event.id);
  }
  if (!matchingEventIds.length) return [];
  const [activityGroups, primaryGroups] = await Promise.all([
    db.select({ groupId: activityLineGroups.groupId }).from(activityLineGroups)
      .where(inArray(activityLineGroups.eventId, matchingEventIds)),
    db.select({ groupId: lineBindings.groupId }).from(lineBindings)
      .where(inArray(lineBindings.eventId, matchingEventIds)),
  ]);
  const groupIds = [...new Set([...activityGroups, ...primaryGroups].map((group) => group.groupId))];
  if (!groupIds.length) return [];
  return db.select().from(lineGroups).where(inArray(lineGroups.groupId, groupIds)).orderBy(asc(lineGroups.groupName));
}

async function availableGroups(credential: string, editCode: string, creatorName: string) {
  const [owned, previouslyUsed] = await Promise.all([
    ownedGroups(credential),
    groupsPreviouslyUsedByCreator(editCode, creatorName),
  ]);
  return [...new Map([...owned, ...previouslyUsed].map((group) => [group.groupId, group])).values()];
}

async function saveEventGroups(eventId: string, groups: NotificationGroup[]) {
  const db = getDb();
  const unique = [...new Map(groups.map((group) => [group.groupId, group])).values()];
  if (!unique.length) throw new Error("請至少選擇一個通知群組");
  const now = new Date().toISOString();
  await db.delete(activityLineGroups).where(eq(activityLineGroups.eventId, eventId));
  await db.insert(activityLineGroups).values(unique.map((group) => ({
    eventId, groupId: group.groupId, groupName: group.groupName, boundAt: now,
  })));
  const primary = unique[0];
  await db.insert(lineBindings).values({ eventId, groupId: primary.groupId, groupName: primary.groupName, boundAt: now })
    .onConflictDoUpdate({ target: lineBindings.eventId, set: { groupId: primary.groupId, groupName: primary.groupName, boundAt: now } });
  for (const group of unique) {
    await db.update(lineGroups).set({ updatedAt: now }).where(eq(lineGroups.groupId, group.groupId));
  }
  await ensureReminderSettings(eventId);
}

async function ensureReminderSettings(eventId: string) {
  await getDb().insert(lineReminderSettings).values({ eventId }).onConflictDoNothing({ target: lineReminderSettings.eventId });
}

async function reuseGroupForUnboundUpcomingEvents(
  credential: string,
  group: { groupId: string; groupName: string },
) {
  if (!credential) return 0;
  const db = getDb();
  const candidates = await db.select({
    id: events.id, eventDate: events.eventDate, startTime: events.startTime,
    editCodeHash: events.editCodeHash, managerTokenHash: events.managerTokenHash,
  }).from(events).where(eq(events.status, "active"));
  const now = Date.now();
  const boundAt = new Date().toISOString();
  let linked = 0;
  for (const event of candidates) {
    const startsAt = eventStartsAt(event);
    if (!Number.isFinite(startsAt) || startsAt <= now) continue;
    const managesEvent = await verifyCredential(credential, event.editCodeHash)
      || await verifyCredential(credential, event.managerTokenHash);
    if (!managesEvent) continue;
    const inserted = await db.insert(lineBindings).values({
      eventId: event.id, groupId: group.groupId, groupName: group.groupName, boundAt,
    }).onConflictDoNothing().returning({ eventId: lineBindings.eventId });
    if (inserted.length) {
      await db.insert(activityLineGroups).values({ eventId: event.id, groupId: group.groupId, groupName: group.groupName, boundAt })
        .onConflictDoNothing();
      linked += 1;
      await ensureReminderSettings(event.id);
    }
  }
  return linked;
}

async function createUniqueCode() {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const [existing] = await db.select({ code: lineBindCodes.code }).from(lineBindCodes)
      .where(eq(lineBindCodes.code, code)).limit(1);
    if (!existing) return code;
  }
  throw new Error("暫時無法產生綁定碼，請再試一次");
}

async function createUniqueManagerCode() {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const [[existing], [batch]] = await Promise.all([
      db.select({ code: lineManagerBindCodes.code }).from(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, code)).limit(1),
      db.select({ code: lineManagerBatchBindCodes.code }).from(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, code)).limit(1),
    ]);
    if (!existing && !batch) return code;
  }
  throw new Error("暫時無法產生管理提醒綁定碼，請再試一次");
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "admin-line", 12, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `管理操作過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.eventId, body.editCode, body.managerToken);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const db = getDb();
    const action = body.action;
    const credential = credentialFrom(body);
    const sharedEditCode = clean(body.editCode, 80);
    const availableGroupsForEvent = () => availableGroups(credential, sharedEditCode, access.event.creatorName);
    const currentGroups = await eventNotificationGroups(access.event.id);
    const currentBinding = currentGroups[0] || null;
    await adoptCurrentGroup(credential, currentBinding);

    if (action === "list_groups") {
      const groups = await availableGroupsForEvent();
      return json(request, {
        groups: groups.map((group) => ({ groupId: group.groupId, groupName: group.groupName, isTest: Boolean(group.isTest) })),
        selectedGroupIds: currentGroups.map((group) => group.groupId),
      });
    }

    if (action === "auto_reuse_group") {
      const groups = await availableGroupsForEvent();
      if (groups.length !== 1 || groups[0].isTest) return json(request, { ok: true, binding: null, linked: 0 });
      const group = groups[0];
      const linked = await reuseGroupForUnboundUpcomingEvents(credential, group);
      const groupsAfterReuse = await eventNotificationGroups(access.event.id);
      return json(request, { ok: true, binding: groupsAfterReuse[0] || null, groups: groupsAfterReuse, linked });
    }

    if (action === "create_binding_code") {
      if (!lineConfig().token || !lineConfig().channelSecret) {
        return json(request, { error: "請先完成 LINE Channel access token 與 Channel secret 設定" }, 503);
      }
      await db.delete(lineBindCodes).where(eq(lineBindCodes.eventId, access.event.id));
      const code = await createUniqueCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await db.insert(lineBindCodes).values({
        code, eventId: access.event.id, ownerCredentialHash: await hashCredential(credential), expiresAt,
      });
      return json(request, { ok: true, code, expiresAt });
    }

    if (action === "create_manager_binding_code") {
      if (!lineConfig().token || !lineConfig().channelSecret) {
        return json(request, { error: "請先完成 LINE Channel access token 與 Channel secret 設定" }, 503);
      }
      await db.delete(lineManagerBindCodes).where(eq(lineManagerBindCodes.eventId, access.event.id));
      const code = await createUniqueManagerCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.insert(lineManagerBindCodes).values({ code, eventId: access.event.id, expiresAt });
      return json(request, { ok: true, code, expiresAt });
    }

    if (action === "clear_manager_targets") {
      await db.delete(lineManagerBindCodes).where(eq(lineManagerBindCodes.eventId, access.event.id));
      await db.delete(lineManagerTargets).where(eq(lineManagerTargets.eventId, access.event.id));
      return json(request, { ok: true });
    }

    if (action === "save_group_profile") {
      const groupId = clean(body.groupId, 160);
      const groups = await availableGroupsForEvent();
      const group = groups.find((item) => item.groupId === groupId);
      if (!group) return json(request, { error: "找不到可管理的通知群組" }, 404);
      await db.update(lineGroups).set({ isTest: boolean(body.isTest), updatedAt: new Date().toISOString() })
        .where(eq(lineGroups.groupId, groupId));
      return json(request, { ok: true });
    }

    if (action === "set_event_groups") {
      const groupIds = Array.isArray(body.groupIds)
        ? [...new Set(body.groupIds.filter((value): value is string => typeof value === "string").map((value) => clean(value, 160)).filter(Boolean))].slice(0, 5)
        : [];
      const groups = await availableGroupsForEvent();
      const selected = groupIds.map((id) => groups.find((group) => group.groupId === id)).filter((group): group is typeof groups[number] => Boolean(group));
      if (!selected.length || selected.length !== groupIds.length) return json(request, { error: "請從你已綁定的通知群組中選擇" }, 400);
      if (!boolean(body.allowTestGroups) && selected.some((group) => group.isTest)) {
        return json(request, { error: "測試群組需要另外勾選確認，避免誤發正式通知" }, 400);
      }
      const targets = selected.map((group) => ({ groupId: group.groupId, groupName: group.groupName }));
      await saveEventGroups(access.event.id, targets);
      if (boolean(body.publishNow)) {
        const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
          eq(rsvps.eventId, access.event.id), eq(rsvps.response, "attending"),
        ));
        const card = eventCard({ ...access.event, attendingPeople: attending.reduce((sum, item) => sum + item.partySize, 0) }, "活動邀請");
        await Promise.all(targets.map((group) => pushMessages(group.groupId, [card])));
      }
      return json(request, { ok: true, groups: targets, published: boolean(body.publishNow) });
    }

    if (action === "use_existing_group") {
      const groupId = clean(body.groupId, 160);
      const groups = await availableGroupsForEvent();
      const group = groups.find((item) => item.groupId === groupId);
      if (!group) return json(request, { error: "找不到可使用的通知群組" }, 404);
      await saveEventGroups(access.event.id, [{ groupId: group.groupId, groupName: group.groupName }]);
      const linked = await reuseGroupForUnboundUpcomingEvents(credential, group);
      return json(request, { ok: true, binding: { groupId: group.groupId, groupName: group.groupName }, groups: await eventNotificationGroups(access.event.id), linked });
    }

    if (action === "save_settings") {
      const values = {
        eventId: access.event.id,
        sevenDays: boolean(body.sevenDays),
        oneDay: boolean(body.oneDay),
        twoHours: boolean(body.twoHours),
        includeDiet: boolean(body.includeDiet),
        includeNote: boolean(body.includeNote),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(lineReminderSettings).values(values).onConflictDoUpdate({
        target: lineReminderSettings.eventId,
        set: values,
      });
      return json(request, { ok: true });
    }

    if (action === "send_test") {
      if (!currentGroups.length) return json(request, { error: "這個活動尚未選擇通知群組" }, 400);
      if (!Number.isFinite(eventStartsAt(access.event)) || eventStartsAt(access.event) <= Date.now()) {
        return json(request, { error: "活動已結束，無法發送提醒測試" }, 400);
      }
      const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, access.event.id), eq(rsvps.response, "attending"),
      ));
      const testLabels: Record<string, string> = {
        seven_days: "活動前 7 天提醒（測試）",
        one_day: "活動前 1 天提醒（測試）",
        two_hours: "活動前 2 小時提醒（測試）",
      };
      const reminderType = typeof body.reminderType === "string" ? body.reminderType : "";
      const label = testLabels[reminderType];
      if (!label) return json(request, { error: "請選擇要測試的提醒時間" }, 400);
      const card = eventCard({
        ...access.event,
        attendingPeople: attending.reduce((sum, item) => sum + item.partySize, 0),
      }, label);
      await Promise.all(currentGroups.map((group) => pushMessages(group.groupId, [card])));
      return json(request, { ok: true });
    }

    if (action === "send_announcement") {
      if (!currentGroups.length) return json(request, { error: "請先選擇通知群組" }, 400);
      const message = clean(body.message, 1200);
      const includePretripInfo = boolean(body.includePretripInfo);
      const pretripInfo = includePretripInfo ? clean(access.event.description, 1000) : "";
      if (!message && !pretripInfo) return json(request, { error: "請輸入公告內容，或選擇附上行前資訊" }, 400);
      const shareUrl = eventShareUrl(access.event.shareCode, access.event.shareToken);
      const text = [
        `【${access.event.title}｜主辦公告】`,
        message,
        pretripInfo ? `行前資訊\n${pretripInfo}` : "",
        `日期：${access.event.eventDate} ${access.event.startTime}\n活動連結：${shareUrl}`,
      ].filter(Boolean).join("\n\n");
      await Promise.all(currentGroups.map((group) => pushText(group.groupId, text)));
      return json(request, { ok: true, groups: currentGroups.length });
    }

    if (action === "list_publishable") {
      const future = await db.select({
        id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime, location: events.location, address: events.address,
        editCodeHash: events.editCodeHash, managerTokenHash: events.managerTokenHash,
      }).from(events).where(and(eq(events.status, "active"), gt(events.eventDate, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10))))
        .orderBy(asc(events.eventDate), asc(events.startTime));
      const visible = [] as Array<{ id: string; title: string; eventDate: string; startTime: string; location: string; address: string }>;
      for (const event of future) {
        const expected = clean(body.managerToken, 160) ? event.managerTokenHash : event.editCodeHash;
        if (credential && await verifyCredential(credential, expected) && eventStartsAt(event) > Date.now()) {
          visible.push({ id: event.id, title: event.title, eventDate: event.eventDate, startTime: event.startTime, location: event.location, address: event.address });
        }
      }
      return json(request, { events: visible });
    }

    if (action === "publish_events") {
      if (!currentGroups.length) return json(request, { error: "請先選擇通知群組" }, 400);
      const ids = Array.isArray(body.eventIds) ? [...new Set(body.eventIds.filter((value): value is string => typeof value === "string").map((value) => clean(value, 80)).filter(Boolean))].slice(0, 8) : [];
      if (!ids.length) return json(request, { error: "請至少選擇一場活動" }, 400);
      const candidates = await db.select().from(events).where(eq(events.status, "active"));
      const selected = [] as typeof candidates;
      for (const id of ids) {
        const event = candidates.find((item) => item.id === id);
        if (!event || eventStartsAt(event) <= Date.now()) return json(request, { error: "只能發布尚未開始的活動" }, 400);
        const expected = clean(body.managerToken, 160) ? event.managerTokenHash : event.editCodeHash;
        if (!credential || !await verifyCredential(credential, expected)) return json(request, { error: "只能合併發布自己可管理的活動" }, 403);
        selected.push(event);
      }
      for (const event of selected) {
        await saveEventGroups(event.id, currentGroups);
      }
      const attending = await db.select({ eventId: rsvps.eventId, partySize: rsvps.partySize }).from(rsvps).where(eq(rsvps.response, "attending"));
      const cards = selected.map((event) => ({ ...event, attendingPeople: attending.filter((rsvp) => rsvp.eventId === event.id).reduce((sum, rsvp) => sum + rsvp.partySize, 0) }));
      await Promise.all(currentGroups.map((group) => pushMessages(group.groupId, [activityListCard(cards)])));
      return json(request, { ok: true, count: selected.length });
    }

    if (action === "unbind") {
      await db.delete(lineBindings).where(eq(lineBindings.eventId, access.event.id));
      await db.delete(activityLineGroups).where(eq(activityLineGroups.eventId, access.event.id));
      return json(request, { ok: true });
    }

    return json(request, { error: "不支援的操作" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "LINE 設定失敗" }, 500);
  }
}
