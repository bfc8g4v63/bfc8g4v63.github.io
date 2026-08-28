import { and, asc, eq, lt } from "drizzle-orm";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { getDb } from "../../../../db";
import { events, lineBindCodes, lineBindings, lineCommandLogs, lineReminderSettings, lineWebhookDeliveries, mealTables, rsvps } from "../../../../db/schema";
import { normalizeLineCommand } from "../commands";
import { activityArrangementImageUrl, activityShareMessage, getGroupName, lineConfig, pushMessages, replyMessages, replyText, rsvpSummaryMessage, verifyLineSignature } from "../lib";

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

function canRetryLinePush(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /LINE 傳送失敗（5\d\d）|fetch failed|network|timeout/i.test(message);
}

async function pushArrangement(chatId: string, messages: Parameters<typeof pushMessages>[1]) {
  const retryKey = crypto.randomUUID();
  try {
    await pushMessages(chatId, messages, retryKey);
    return "sent" as const;
  } catch (error) {
    if (!canRetryLinePush(error)) throw error;
    // LINE uses the retry key to avoid duplicate delivery if the first request
    // reached LINE but the response was interrupted in transit.
    await pushMessages(chatId, messages, retryKey);
    return "retried" as const;
  }
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

  // LINE requires a 2xx response within two seconds. Database work and a
  // reply/push call can exceed that budget on a cold Worker, so acknowledge
  // the verified delivery first and keep the actual command work alive with
  // the request execution context.
  const processing = processWebhookEvents(payload.events || [], request.url);
  if (isTrustedRelay) {
    await processing;
    return Response.json({ ok: true });
  }
  const context = getRequestExecutionContext();
  if (context) context.waitUntil(processing);
  else void processing;
  return Response.json({ ok: true });
}

async function claimWebhookEvent(event: LineEvent) {
  // Webhook verification requests and some legacy events do not include an ID.
  // In that case, retain the original handling behaviour.
  if (!event.webhookEventId) return true;
  try {
    const [claimed] = await getDb().insert(lineWebhookDeliveries).values({
      id: event.webhookEventId,
      receivedAt: new Date().toISOString(),
    }).onConflictDoNothing().returning({ id: lineWebhookDeliveries.id });
    return Boolean(claimed);
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
        && event.message.text?.trim() === "PORTFOLIO_ID"
      ) {
        await replyText(
          event.replyToken,
          `Your Portfolio notification ID:\n${event.source?.userId || "Unavailable"}`,
        );
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
      if (command === "活動") {
        const db = getDb();
        const [binding] = await db.select().from(lineBindings)
          .where(eq(lineBindings.groupId, chatId)).limit(1);
        if (!binding) {
          await replyText(event.replyToken, "這個群組尚未綁定活動，請先在活動管理後台產生綁定碼，再輸入「綁定 123456」。");
          continue;
        }
        const [targetEvent] = await db.select({
          title: events.title, eventDate: events.eventDate, startTime: events.startTime,
          location: events.location, description: events.description, shareToken: events.shareToken,
        })
          .from(events).where(eq(events.id, binding.eventId)).limit(1);
        if (!targetEvent?.shareToken) {
          await replyText(event.replyToken, "找不到這個群組綁定的活動連結，請到活動管理後台重新綁定。 ");
          continue;
        }
        const shareUrl = `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(targetEvent.shareToken)}`;
        const qrUrl = new URL("/api/line/qr", requestUrl);
        qrUrl.searchParams.set("s", targetEvent.shareToken);
        await replyMessages(event.replyToken, [
          { type: "text", text: activityShareMessage({ ...targetEvent, shareUrl }) },
          { type: "image", originalContentUrl: qrUrl.toString(), previewImageUrl: qrUrl.toString() },
        ]);
        continue;
      }
      if (command === "原神啟動") {
        const db = getDb();
        const [binding] = await db.select().from(lineBindings)
          .where(eq(lineBindings.groupId, chatId)).limit(1);
        if (!binding) {
          await replyText(event.replyToken, "這個群組尚未綁定活動，請先在活動管理後台產生綁定碼，再輸入「綁定 123456」。");
          continue;
        }

        const [eventRows, registrations, settingRows] = await Promise.all([
          db.select({ title: events.title }).from(events)
            .where(eq(events.id, binding.eventId)).limit(1),
          db.select({ name: rsvps.name, partySize: rsvps.partySize, diet: rsvps.diet, note: rsvps.note })
            .from(rsvps)
            .where(and(eq(rsvps.eventId, binding.eventId), eq(rsvps.response, "attending")))
            .orderBy(asc(rsvps.createdAt)),
          db.select({ includeDiet: lineReminderSettings.includeDiet, includeNote: lineReminderSettings.includeNote }).from(lineReminderSettings)
            .where(eq(lineReminderSettings.eventId, binding.eventId)).limit(1),
        ]);
        const [targetEvent] = eventRows;
        if (!targetEvent) {
          await replyText(event.replyToken, "找不到這個群組綁定的活動，請重新建立綁定。 ");
          continue;
        }
        await replyText(event.replyToken, rsvpSummaryMessage(
          targetEvent.title,
          registrations,
          Boolean(settingRows[0]?.includeDiet),
          Boolean(settingRows[0]?.includeNote),
        ));
        continue;
      }
      if (command === "安排" || command === "安排測試") {
        const db = getDb();
        const [binding] = await db.select().from(lineBindings)
          .where(eq(lineBindings.groupId, chatId)).limit(1);
        if (!binding) {
          await replyText(event.replyToken, "這個群組尚未綁定活動，請先在活動管理後台產生綁定碼，再輸入「綁定 123456」。");
          continue;
        }
        const [eventRows, tables] = await Promise.all([
          db.select({ title: events.title }).from(events)
            .where(eq(events.id, binding.eventId)).limit(1),
          db.select({ id: mealTables.id, name: mealTables.name, capacity: mealTables.capacity, isReserve: mealTables.isReserve, note: mealTables.note })
            .from(mealTables).where(eq(mealTables.eventId, binding.eventId)).orderBy(asc(mealTables.sortOrder)),
        ]);
        const [targetEvent] = eventRows;
        if (!targetEvent) {
          await replyText(event.replyToken, "找不到這個群組綁定的活動，請重新建立綁定。");
          continue;
        }
        if (!tables.length) {
          await replyText(event.replyToken, `「${targetEvent.title}」尚未建立活動安排，請由建立者到活動管理後台設定。`);
          await logCommand(binding.eventId, "安排", "no_arrangement", "尚未建立活動安排");
          continue;
        }
        // LINE allows at most five messages in one push. The app limits an
        // activity to 24 arrangement areas, which fit into four image pages.
        const pages = Math.min(4, Math.ceil(tables.length / 6));
        const messages = await Promise.all(Array.from({ length: pages }, async (_, page) => {
          const originalContentUrl = await activityArrangementImageUrl(requestUrl, binding.eventId, page);
          const previewImageUrl = originalContentUrl;
          return { type: "image" as const, originalContentUrl, previewImageUrl };
        }));
        try {
          const result = await pushArrangement(chatId, messages);
          await logCommand(binding.eventId, "安排", "sent", result === "retried"
            ? `安全重試後已傳送 ${pages} 張安排圖卡`
            : `已傳送 ${pages} 張安排圖卡`);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "LINE 圖卡傳送失敗";
          try {
            await replyText(event.replyToken, "活動安排圖卡暫時無法傳送，請稍後再輸入「安排」。");
            await logCommand(binding.eventId, "安排", "fallback_sent", "圖卡傳送失敗，已回覆文字提示");
          } catch {
            await logCommand(binding.eventId, "安排", "failed", detail);
          }
        }
        continue;
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
      const [targetEvent] = await db.select({ title: events.title }).from(events)
        .where(eq(events.id, bindingCode.eventId)).limit(1);
      if (!targetEvent) {
        await replyText(event.replyToken, "找不到對應活動，請重新取得綁定碼。");
        continue;
      }

      const groupName = sourceType === "group" ? await getGroupName(chatId) : "LINE 多人聊天室";
      await db.delete(lineBindings).where(eq(lineBindings.groupId, chatId));
      await db.insert(lineBindings).values({
        eventId: bindingCode.eventId, groupId: chatId, groupName, boundAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: lineBindings.eventId,
        set: { groupId: chatId, groupName, boundAt: new Date().toISOString() },
      });
      await db.insert(lineReminderSettings).values({ eventId: bindingCode.eventId })
        .onConflictDoNothing({ target: lineReminderSettings.eventId });
      await db.delete(lineBindCodes).where(eq(lineBindCodes.code, bindingCode.code));
      await replyText(event.replyToken, `綁定成功：${targetEvent.title}\n預設會在活動前 7 天與 1 天提醒，可回網站管理後台調整。`);
    }
  } catch (error) {
    console.error("LINE webhook failed", error);
  }
}
