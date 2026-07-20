import { eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { events, lineBindCodes, lineBindings, lineReminderSettings } from "../../../../db/schema";
import { getGroupName, replyText, verifyLineSignature } from "../lib";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; groupId?: string };
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
      const groupId = event.source?.type === "group" ? event.source.groupId : "";
      if (!groupId || !event.replyToken) continue;

      if (event.type === "join") {
        await replyText(event.replyToken, "好日子機器人已加入。請由活動管理者在網站取得 6 位數綁定碼，再於群組輸入：綁定 123456");
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text") continue;
      const match = event.message.text?.trim().match(/^綁定\s*(\d{6})$/);
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

      const groupName = await getGroupName(groupId);
      await db.delete(lineBindings).where(eq(lineBindings.groupId, groupId));
      await db.insert(lineBindings).values({
        eventId: bindingCode.eventId, groupId, groupName, boundAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: lineBindings.eventId,
        set: { groupId, groupName, boundAt: new Date().toISOString() },
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
