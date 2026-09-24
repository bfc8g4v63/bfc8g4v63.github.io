import { and, asc, eq, gt } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { events, lineBindCodes, lineBindings, lineGroups, lineReminderSettings, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { clean, hashCredential, requireEventManager, verifyCredential } from "../auth";
import { eventMessage, lineConfig, pushText } from "../../line/lib";
import { rateLimit } from "../../rate-limit";

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

async function ensureReminderSettings(eventId: string) {
  await getDb().insert(lineReminderSettings).values({ eventId }).onConflictDoNothing({ target: lineReminderSettings.eventId });
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
    const [currentBinding] = await db.select().from(lineBindings)
      .where(eq(lineBindings.eventId, access.event.id)).limit(1);
    await adoptCurrentGroup(credential, currentBinding);

    if (action === "list_groups") {
      const groups = await ownedGroups(credential);
      return json(request, { groups: groups.map((group) => ({ groupId: group.groupId, groupName: group.groupName })) });
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

    if (action === "use_existing_group") {
      const groupId = clean(body.groupId, 160);
      const groups = await ownedGroups(credential);
      const group = groups.find((item) => item.groupId === groupId);
      if (!group) return json(request, { error: "找不到可使用的通知群組" }, 404);
      const now = new Date().toISOString();
      await db.insert(lineBindings).values({ eventId: access.event.id, groupId: group.groupId, groupName: group.groupName, boundAt: now })
        .onConflictDoUpdate({ target: lineBindings.eventId, set: { groupId: group.groupId, groupName: group.groupName, boundAt: now } });
      await ensureReminderSettings(access.event.id);
      return json(request, { ok: true, binding: { groupId: group.groupId, groupName: group.groupName } });
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
      if (!currentBinding) return json(request, { error: "這個活動尚未選擇通知群組" }, 400);
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
      await pushText(currentBinding.groupId, eventMessage({
        ...access.event,
        attendingPeople: attending.reduce((sum, item) => sum + item.partySize, 0),
      }, label));
      return json(request, { ok: true });
    }

    if (action === "list_publishable") {
      const future = await db.select({
        id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime, location: events.location,
        editCodeHash: events.editCodeHash, managerTokenHash: events.managerTokenHash,
      }).from(events).where(and(eq(events.status, "active"), gt(events.eventDate, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10))))
        .orderBy(asc(events.eventDate), asc(events.startTime));
      const visible = [] as Array<{ id: string; title: string; eventDate: string; startTime: string; location: string }>;
      for (const event of future) {
        const expected = clean(body.managerToken, 160) ? event.managerTokenHash : event.editCodeHash;
        if (credential && await verifyCredential(credential, expected) && eventStartsAt(event) > Date.now()) {
          visible.push({ id: event.id, title: event.title, eventDate: event.eventDate, startTime: event.startTime, location: event.location });
        }
      }
      return json(request, { events: visible });
    }

    if (action === "publish_events") {
      if (!currentBinding) return json(request, { error: "請先選擇通知群組" }, 400);
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
      const now = new Date().toISOString();
      for (const event of selected) {
        await db.insert(lineBindings).values({ eventId: event.id, groupId: currentBinding.groupId, groupName: currentBinding.groupName, boundAt: now })
          .onConflictDoUpdate({ target: lineBindings.eventId, set: { groupId: currentBinding.groupId, groupName: currentBinding.groupName, boundAt: now } });
        await ensureReminderSettings(event.id);
      }
      const message = ["【近期活動】", ...selected.map((event, index) => `${index + 1}. ${event.title}\n${event.eventDate} ${event.startTime}｜${event.location}\n${`https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(event.shareToken)}`}`)].join("\n\n");
      await pushText(currentBinding.groupId, message);
      return json(request, { ok: true, count: selected.length });
    }

    if (action === "unbind") {
      await db.delete(lineBindings).where(eq(lineBindings.eventId, access.event.id));
      return json(request, { ok: true });
    }

    return json(request, { error: "不支援的操作" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "LINE 設定失敗" }, 500);
  }
}
