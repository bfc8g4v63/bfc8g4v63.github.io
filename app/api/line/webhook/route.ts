import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { activityLineGroups, events, lineBindCodes, lineBindings, lineCommandLogs, lineGroups, lineManagerBatchBindCodes, lineManagerBindCodes, lineManagerTargets, lineReminderSettings, lineWebhookDeliveries, mealTables, rsvps } from "../../../../db/schema";
import { normalizeLineCommand } from "../commands";
import { activityArrangementImageUrl, activityListCard, activityShareMessage, getGroupName, lineConfig, lineDateLabel, replyMessages, replyText, rsvpSummaryMessage, verifyLineSignature } from "../lib";
import { eventShareUrl } from "../../../../lib/event-share";

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  message?: { type?: string; text?: string };
};

async function logCommand(eventId: string, command: string, outcome: string, detail = "") {
  try {
    const db = getDb();
    await db.insert(lineCommandLogs).values({
      id: crypto.randomUUID(), eventId, command, outcome,
      detail: detail.slice(0, 180), createdAt: new Date().toISOString(),
    });
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(lineCommandLogs).where(lt(lineCommandLogs.createdAt, cutoff));
    await db.delete(lineWebhookDeliveries).where(lt(lineWebhookDeliveries.receivedAt, cutoff));
  } catch (error) {
    // Diagnostic logging must never prevent a family from receiving a response.
    console.error("Unable to record LINE command status", error);
  }
}

function eventStartsAt(event: { eventDate: string; startTime: string }) {
  return Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
}

function requestedDate(command: string, prefix: string) {
  const digits = command.slice(prefix.length).replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : "";
}

async function eventsForManagerBinding(eventIds: string[]) {
  // SQLite/D1 limits the number of query bindings. Chunking keeps a single
  // private manager binding usable for every selected upcoming activity.
  const rows: Array<{ id: string; title: string; status: string; eventDate: string; startTime: string }> = [];
  for (let index = 0; index < eventIds.length; index += 500) {
    const ids = eventIds.slice(index, index + 500);
    rows.push(...await getDb().select({
      id: events.id, title: events.title, status: events.status,
      eventDate: events.eventDate, startTime: events.startTime,
    }).from(events).where(inArray(events.id, ids)));
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return eventIds.map((id) => byId.get(id)).filter((row): row is typeof rows[number] => Boolean(row));
}

async function upcomingGroupEvents(groupId: string) {
  const db = getDb();
  const selectEvent = {
    id: events.id, title: events.title, eventDate: events.eventDate, startTime: events.startTime,
    location: events.location, address: events.address, description: events.description, shareToken: events.shareToken, shareCode: events.shareCode,
  };
  const [legacy, selected] = await Promise.all([
    db.select(selectEvent).from(events).innerJoin(lineBindings, eq(events.id, lineBindings.eventId))
      .where(and(eq(lineBindings.groupId, groupId), eq(events.status, "active"))),
    db.select(selectEvent).from(events).innerJoin(activityLineGroups, eq(events.id, activityLineGroups.eventId))
      .where(and(eq(activityLineGroups.groupId, groupId), eq(events.status, "active"))),
  ]);
  const rows = [...new Map([...legacy, ...selected].map((event) => [event.id, event])).values()]
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`));
  const now = Date.now();
  const upcoming = rows.filter((event) => Number.isFinite(eventStartsAt(event)) && eventStartsAt(event) > now);
  if (!upcoming.length) return upcoming;
  const attendance = await db.select({ eventId: rsvps.eventId, partySize: rsvps.partySize }).from(rsvps)
    .where(eq(rsvps.response, "attending"));
  return upcoming.map((event) => ({
    ...event,
    attendingPeople: attendance.filter((rsvp) => rsvp.eventId === event.id).reduce((sum, rsvp) => sum + rsvp.partySize, 0),
  }));
}

async function replyUpcomingActivities(
  replyToken: string,
  activities: Awaited<ReturnType<typeof upcomingGroupEvents>>,
  instruction = "",
) {
  const messages = [activityListCard(activities), ...(instruction ? [{ type: "text" as const, text: instruction }] : [])];
  try {
    await replyMessages(replyToken, messages);
  } catch (error) {
    // A malformed or unsupported Flex payload must never leave a group without
    // an answer. Keep the compact button card as the normal path and provide a
    // text-only fallback that still opens every activity.
    console.error("Unable to send LINE activity cards; using text fallback", error);
    const fallback = ["【近期活動】", ...activities.map((activity, index) => (
      `${index + 1}. ${activity.title}\n${lineDateLabel(activity.eventDate)} ${activity.startTime}｜${activity.location}${activity.address ? `\n地址：${activity.address}` : ""}\n查看／回覆：${eventShareUrl(activity.shareCode, activity.shareToken)}`
    ))];
    if (instruction) fallback.push(instruction);
    await replyText(replyToken, fallback.join("\n\n").slice(0, 5000));
  }
}

async function pairManagerAlert(event: LineEvent, code: string) {
  const db = getDb();
  await db.delete(lineManagerBindCodes).where(lt(lineManagerBindCodes.expiresAt, new Date().toISOString()));
  await db.delete(lineManagerBatchBindCodes).where(lt(lineManagerBatchBindCodes.expiresAt, new Date().toISOString()));
  const [[bindingCode], [batchBindingCode]] = await Promise.all([
    db.select().from(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, code)).limit(1),
    db.select().from(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, code)).limit(1),
  ]);
  if ((!bindingCode && !batchBindingCode) || !event.source?.userId) {
    await replyText(event.replyToken!, "管理提醒綁定碼無效或已超過 10 分鐘，請回活動管理後台重新取得。");
    return;
  }
  let eventIds: string[] = bindingCode ? [bindingCode.eventId] : [];
  if (batchBindingCode) {
    try {
      const parsed = JSON.parse(batchBindingCode.eventIds);
      eventIds = Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
    } catch {
      eventIds = [];
    }
  }
  const targetEvents = eventIds.length ? await eventsForManagerBinding(eventIds) : [];
  const activeEvents = targetEvents.filter((targetEvent) => targetEvent.status === "active" && eventStartsAt(targetEvent) > Date.now());
  if (!activeEvents.length || activeEvents.length !== eventIds.length) {
    if (bindingCode) await db.delete(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, bindingCode.code));
    if (batchBindingCode) await db.delete(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, batchBindingCode.code));
    await replyText(event.replyToken!, "找不到對應的進行中活動，請回網站重新取得綁定碼。");
    return;
  }
  const now = new Date().toISOString();
  for (const targetEvent of activeEvents) {
    const [existing] = await db.select({ id: lineManagerTargets.id }).from(lineManagerTargets).where(and(
      eq(lineManagerTargets.eventId, targetEvent.id), eq(lineManagerTargets.lineUserId, event.source.userId),
    )).limit(1);
    if (existing) {
      await db.update(lineManagerTargets).set({ updatedAt: now }).where(eq(lineManagerTargets.id, existing.id));
    } else {
      await db.insert(lineManagerTargets).values({
        id: crypto.randomUUID(), eventId: targetEvent.id, lineUserId: event.source.userId,
        pairedAt: now, updatedAt: now,
      });
    }
  }
  if (bindingCode) await db.delete(lineManagerBindCodes).where(eq(lineManagerBindCodes.code, bindingCode.code));
  if (batchBindingCode) await db.delete(lineManagerBatchBindCodes).where(eq(lineManagerBatchBindCodes.code, batchBindingCode.code));
  const listedTitles = activeEvents.slice(0, 5).map((targetEvent) => targetEvent.title).join("、");
  const titles = activeEvents.length > 5 ? `${listedTitles} 等 ${activeEvents.length} 場` : listedTitles;
  await replyText(event.replyToken!, `管理者私訊提醒已綁定 ${activeEvents.length} 場活動：${titles}\n之後有人報名、取消或更動人數時，小幫手會在這個私訊通知你；不會依管理者名稱判斷身分，也不會推送到活動群組。`);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";
  const relayToken = request.headers.get("x-goodday-line-relay") || "";
  const { reminderSecret } = lineConfig();
  let relayDifference = relayToken.length === reminderSecret.length ? 0 : 1;
  for (let index = 0; index < Math.min(relayToken.length, reminderSecret.length); index += 1) {
    relayDifference |= relayToken.charCodeAt(index) ^ reminderSecret.charCodeAt(index);
  }
  const isTrustedRelay = Boolean(reminderSecret) && relayDifference === 0;
  if (!isTrustedRelay && !await verifyLineSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid LINE signature" }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody) as { events?: LineEvent[] };
  } catch {
    return Response.json({ error: "Invalid LINE payload" }, { status: 400 });
  }

  // Commands that a person is waiting for must consume the LINE reply token
  // in this request. Deferring them with waitUntil made 「活動」and「安排」
  // appear minutes later when a Worker was scheduled late. Event claiming
  // above makes an eventual LINE retry safe if the response exceeds its window.
  await processWebhookEvents(payload.events || [], request.url);
  return Response.json({ ok: true });
}

async function claimWebhookEvent(event: LineEvent) {
  // Webhook verification requests and some legacy events do not include an ID.
  // In that case, retain the original handling behaviour.
  if (!event.webhookEventId) return true;
  try {
    const db = getDb();
    const [claimed] = await db.insert(lineWebhookDeliveries).values({
      id: event.webhookEventId,
      receivedAt: new Date().toISOString(),
    }).onConflictDoNothing().returning({ id: lineWebhookDeliveries.id });
    if (claimed) return true;

    // LINE retries a callback when its connection was cancelled before it
    // received our 2xx response. A stale in-progress claim must not suppress
    // that retry forever; a fresh claim still prevents duplicate cards.
    const retryCutoff = new Date(Date.now() - 15_000).toISOString();
    const retried = await db.update(lineWebhookDeliveries)
      .set({ receivedAt: new Date().toISOString() })
      .where(and(eq(lineWebhookDeliveries.id, event.webhookEventId), lt(lineWebhookDeliveries.receivedAt, retryCutoff)))
      .returning({ id: lineWebhookDeliveries.id });
    return Boolean(retried[0]);
  } catch (error) {
    // Do not turn a diagnostics safeguard into a dropped family command.
    // LINE will retry this delivery when it could not receive our 2xx response.
    console.error("Unable to claim LINE webhook event", error);
    return true;
  }
}

async function processWebhookEvents(lineEvents: LineEvent[], requestUrl: string) {
  try {
    for (const event of lineEvents) {
      if (!await claimWebhookEvent(event)) continue;
      const sourceType = event.source?.type || "";
      const chatId = sourceType === "group"
        ? event.source?.groupId || ""
        : sourceType === "room"
          ? event.source?.roomId || ""
          : "";
      if (!event.replyToken) continue;

      // Private messages do not have a groupId or roomId. Handle the temporary
      // Portfolio lookup command before the group/room guard below.
      if (
        sourceType === "user"
        && event.type === "message"
        && event.message?.type === "text"
        && /^管理綁定\s*(\d{6})$/.test(event.message.text?.trim() || "")
      ) {
        const match = (event.message.text?.trim() || "").match(/^管理綁定\s*(\d{6})$/);
        await pairManagerAlert(event, match![1]);
        continue;
      }

      if (
        sourceType === "user"
        && event.type === "message"
        && event.message?.type === "text"
        && event.message.text?.trim() === "PORTFOLIO_ID"
      ) {
        await replyText(
          event.replyToken,
          `Your Portfolio notification ID:\n${event.source?.userId || "Unavailable"}`,
        );
        continue;
      }

      if (
        (sourceType === "group" || sourceType === "room")
        && event.type === "message"
        && event.message?.type === "text"
        && /^管理綁定\s*\d{6}$/.test(event.message.text?.trim() || "")
      ) {
        await replyText(event.replyToken, "「管理綁定」只能在你與好日子小幫手的一對一私訊使用，這個群組不會啟用管理者私訊提醒。\n\n若要綁定通知群組，請回網站取得群組綁定碼，再在這裡輸入「綁定 123456」。");
        continue;
      }

      if (!chatId) continue;

      if (event.type === "join") {
        await replyText(event.replyToken, "好日子機器人已加入。請由活動管理者在網站取得 6 位數綁定碼，再於群組輸入：綁定 123456");
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text") continue;
      const text = event.message.text?.trim() || "";
      const command = normalizeLineCommand(text);
      if (command !== "活動" && !command.startsWith("原神啟動") && !command.startsWith("安排")) {
        // Binding is the only non-command action below; avoid a database lookup for ordinary chat.
      } else {
      const upcoming = await upcomingGroupEvents(chatId);
      if (command === "活動") {
        if (upcoming.length) await replyUpcomingActivities(event.replyToken, upcoming);
        else await replyText(event.replyToken, "這個群組目前沒有尚未開始的活動。");
        continue;
      }
      if (command.startsWith("原神啟動")) {
        const date = requestedDate(command, "原神啟動");
        const targetEvent = date ? upcoming.find((item) => item.eventDate === date) : upcoming.length === 1 ? upcoming[0] : null;
        if (!targetEvent) {
          if (upcoming.length) await replyUpcomingActivities(event.replyToken, upcoming, "要查看名單，請輸入「原神啟動 20260930」。");
          else await replyText(event.replyToken, "這個群組目前沒有尚未開始的活動。");
          continue;
        }
        const [registrations, settingRows] = await Promise.all([
          getDb().select({ name: rsvps.name, partySize: rsvps.partySize, diet: rsvps.diet, note: rsvps.note })
            .from(rsvps).where(and(eq(rsvps.eventId, targetEvent.id), eq(rsvps.response, "attending"))).orderBy(asc(rsvps.createdAt)),
          getDb().select({ includeDiet: lineReminderSettings.includeDiet, includeNote: lineReminderSettings.includeNote }).from(lineReminderSettings)
            .where(eq(lineReminderSettings.eventId, targetEvent.id)).limit(1),
        ]);
        await replyText(event.replyToken, rsvpSummaryMessage(targetEvent.title, registrations, Boolean(settingRows[0]?.includeDiet), Boolean(settingRows[0]?.includeNote)));
        continue;
      }
      if (command.startsWith("安排")) {
        const date = requestedDate(command, "安排");
        const targetEvents = date ? upcoming.filter((item) => item.eventDate === date) : upcoming;
        if (!targetEvents.length) {
          await replyText(event.replyToken, date ? "找不到這個日期的近期活動安排。" : "這個群組目前沒有尚未開始的活動安排。");
          continue;
        }
        const details = await Promise.all(targetEvents.map(async (targetEvent) => {
          const tables = await getDb().select({ id: mealTables.id }).from(mealTables)
            .where(eq(mealTables.eventId, targetEvent.id)).orderBy(asc(mealTables.sortOrder));
          return { targetEvent, pages: tables.length ? Math.min(4, Math.ceil(tables.length / 6)) : 0 };
        }));
        const sendable = details.filter((item) => item.pages > 0);
        const totalPages = sendable.reduce((sum, item) => sum + item.pages, 0);
        if (!sendable.length) {
          await replyText(event.replyToken, "近期活動尚未建立安排，請由建立者到活動管理後台設定。");
          continue;
        }
        if (totalPages > 5) {
          await replyUpcomingActivities(event.replyToken, targetEvents, "安排圖卡較多，請輸入「安排 20260930」查看指定日期。");
          continue;
        }
        const messages = await Promise.all(sendable.flatMap(({ targetEvent, pages }) => Array.from({ length: pages }, async (_, page) => {
          const originalContentUrl = await activityArrangementImageUrl(requestUrl, targetEvent.id, page);
          return { type: "image" as const, originalContentUrl, previewImageUrl: originalContentUrl };
        })));
        try {
          await replyMessages(event.replyToken, messages);
          for (const item of sendable) await logCommand(item.targetEvent.id, "安排", "sent", "已直接回覆安排圖卡");
        } catch (error) {
          const detail = error instanceof Error ? error.message : "LINE 圖卡傳送失敗";
          try {
            await replyText(event.replyToken, "活動安排圖卡暫時無法傳送，請稍後再輸入「安排」。");
            for (const item of sendable) await logCommand(item.targetEvent.id, "安排", "fallback_sent", detail);
          } catch {
            for (const item of sendable) await logCommand(item.targetEvent.id, "安排", "failed", detail);
          }
        }
        continue;
      }
      }

      const match = text.match(/^綁定\s*(\d{6})$/);
      if (!match) continue;

      const db = getDb();
      const [bindingCode] = await db.select().from(lineBindCodes)
        .where(eq(lineBindCodes.code, match[1])).limit(1);
      if (!bindingCode || Date.parse(bindingCode.expiresAt) < Date.now()) {
        await replyText(event.replyToken, "綁定碼無效或已超過 15 分鐘，請回網站重新取得。");
        continue;
      }
      const [targetEvent] = await db.select({ title: events.title, eventDate: events.eventDate, startTime: events.startTime, status: events.status }).from(events)
        .where(eq(events.id, bindingCode.eventId)).limit(1);
      if (!targetEvent || targetEvent.status !== "active" || eventStartsAt(targetEvent) <= Date.now()) {
        await replyText(event.replyToken, "找不到對應活動，請重新取得綁定碼。");
        continue;
      }

      const groupName = sourceType === "group" ? await getGroupName(chatId) : "LINE 多人聊天室";
      const now = new Date().toISOString();
      await db.insert(lineGroups).values({
        groupId: chatId, groupName, ownerCredentialHash: bindingCode.ownerCredentialHash,
        boundAt: now, updatedAt: now,
      }).onConflictDoUpdate({ target: lineGroups.groupId, set: { groupName, updatedAt: now } });
      await db.insert(lineBindings).values({
        eventId: bindingCode.eventId, groupId: chatId, groupName, boundAt: now,
      }).onConflictDoUpdate({
        target: lineBindings.eventId,
        set: { groupId: chatId, groupName, boundAt: now },
      });
      await db.insert(activityLineGroups).values({
        eventId: bindingCode.eventId, groupId: chatId, groupName, boundAt: now,
      }).onConflictDoNothing();
      await db.insert(lineReminderSettings).values({ eventId: bindingCode.eventId })
        .onConflictDoNothing({ target: lineReminderSettings.eventId });
      await db.delete(lineBindCodes).where(eq(lineBindCodes.code, bindingCode.code));
      await replyText(event.replyToken, `綁定成功：${targetEvent.title}\n預設會在活動前 7 天與 1 天提醒，可回網站管理後台調整。\n\n群組可直接輸入：\n活動：查看近期活動\n原神啟動 日期：查看指定日期名單\n安排 日期：查看指定日期安排圖卡\n\n有多場活動時，先輸入「活動」取得可用日期。`);
    }
  } catch (error) {
    console.error("LINE webhook failed", error);
  }
}
