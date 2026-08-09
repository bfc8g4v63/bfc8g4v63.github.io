import { and, asc, eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { events, fairyNotificationTargets, lineBindCodes, lineBindings, lineReminderSettings, mealTables, rsvps } from "../../../../db/schema";
import { normalizeLineCommand } from "../commands";
import { activityArrangementImageUrl, activityShareMessage, getGroupName, lineConfig, pushText, replyMessages, replyText, rsvpSummaryMessage, verifyLineSignature } from "../lib";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";
  if (!await verifyLineSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid LINE signature" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const payload = JSON.parse(rawBody) as { events?: LineEvent[] };
    for (const event of payload.events || []) {
      const sourceType = event.source?.type || "";
      const senderUserId = event.source?.userId || "";
      const chatId = sourceType === "group"
        ? event.source?.groupId || ""
        : sourceType === "room"
          ? event.source?.roomId || ""
          : "";
      if (!chatId || !event.replyToken) continue;

      if (event.type === "join") {
        await replyText(event.replyToken, "好日子機器人已加入。請由活動管理者在網站取得 6 位數綁定碼，再於群組輸入：綁定 123456");
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text") continue;
      const text = event.message.text?.trim() || "";
      const command = normalizeLineCommand(text);
      const pairingCode = lineConfig().fairyPairingCode;
      if (sourceType === "group" && senderUserId && pairingCode && command === `仙女綁定${normalizeLineCommand(pairingCode)}`) {
        const db = getDb();
        const [existingTarget] = await db.select().from(fairyNotificationTargets)
          .where(eq(fairyNotificationTargets.id, "owner")).limit(1);
        if (existingTarget && existingTarget.lineUserId !== senderUserId) {
          await replyText(event.replyToken, "仙女補給站已完成私訊設定；為避免打擾，目前不開放更換通知帳號。 ");
          continue;
        }
        await db.insert(fairyNotificationTargets).values({
          id: "owner", lineUserId: senderUserId, pairedAt: new Date().toISOString(),
        }).onConflictDoUpdate({
          target: fairyNotificationTargets.id,
          set: { lineUserId: senderUserId, pairedAt: new Date().toISOString() },
        });
        try {
          await pushText(senderUserId, "仙女補給站私訊已連線 ✨\n之後她填的小卡會只傳到這裡，不會發到群組。\n南瓜馬車已待命，慢慢選就好。 ");
        } catch {
          // Group binding still succeeds if the account has not added the bot as a friend yet.
        }
        await replyText(event.replyToken, "仙女補給站已完成私訊設定。之後小卡內容只會傳給你的 LINE，不會發到群組。 ");
        continue;
      }
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
        const qrUrl = new URL("/api/line/qr", request.url);
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
      if (command === "安排") {
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
          continue;
        }
        const pages = Math.ceil(tables.length / 6);
        const messages = await Promise.all(Array.from({ length: pages }, async (_, page) => {
          const originalContentUrl = await activityArrangementImageUrl(request.url, binding.eventId, page);
          const previewImageUrl = originalContentUrl;
          return { type: "image" as const, originalContentUrl, previewImageUrl };
        }));
        await replyMessages(event.replyToken, messages);
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
    return Response.json({ ok: true });
  } catch (error) {
    console.error("LINE webhook failed", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
