import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureSchema } from "../../../../db/init";
import { fairyNotificationTargets } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { pushText } from "../../line/lib";
import { rateLimit } from "../../rate-limit";

const quickReplies = new Set(["補給收到", "😂 有被鬧到", "馬車先停好", "本仙女已閱"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "fairy-reaction", 10, 30 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `回覆太快了，${limit.retryAfterSeconds} 秒後再試。` }, 429);
    const body = await request.json() as Record<string, unknown>;
    const type = body.type;
    const reply = typeof body.reply === "string" ? body.reply.trim() : "";
    const rating = Number(body.rating);
    const note = clean(body.note, 240);

    let text = "";
    if (type === "quick-reply" && quickReplies.has(reply)) text = `仙女回傳小卡\n${reply}`;
    if (type === "rating" && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      text = `仙女補給服務評價\n${rating} 星`;
      if (note) text += `\n想對少卿說的話：${note}`;
    }
    if (!text) return json(request, { error: "這張小卡暫時無法送出。" }, 400);

    await ensureSchema();
    const [target] = await getDb().select().from(fairyNotificationTargets)
      .where(eq(fairyNotificationTargets.id, "owner")).limit(1);
    if (!target) return json(request, { error: "配送員還沒完成 LINE 私訊設定，請先綁定。" }, 503);
    await pushText(target.lineUserId, text);
    return json(request, { ok: true });
  } catch {
    return json(request, { error: "小幫手暫時塞車了，晚一點再試。" }, 500);
  }
}
