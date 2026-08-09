import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { fairyNotificationTargets } from "../../../db/schema";
import { json, preflight } from "../cors";
import { pushText } from "../line/lib";
import { rateLimit } from "../rate-limit";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00+08:00`));
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "fairy-note", 3, 30 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `小馬車正在休息，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    const body = await request.json() as Record<string, unknown>;
    const coffee = clean(body.coffee, 80);
    const carriageSong = clean(body.carriageSong, 80);
    const date = clean(body.date, 10);
    const activity = clean(body.activity, 40);
    const chat = body.chat === true;
    if (!coffee && !carriageSong && !date && !activity && !chat) {
      return json(request, { error: "先挑一個小願望再送出吧" }, 400);
    }
    if (date && !validDate(date)) return json(request, { error: "日期格式看起來不太對" }, 400);
    await ensureSchema();
    const [target] = await getDb().select().from(fairyNotificationTargets)
      .where(eq(fairyNotificationTargets.id, "owner")).limit(1);
    if (!target) return json(request, { error: "配送員還沒完成 LINE 私訊設定，請晚一點再試" }, 503);
    const lines = ["【仙女補給站・新小卡】"];
    if (coffee) lines.push(`星巴克補給：${coffee}`);
    if (chat) lines.push("少卿陪聊：已點選");
    if (carriageSong) lines.push(`南瓜馬車乘車資格：${carriageSong}`);
    if (date || activity) lines.push(`想約的副本：${date || "日期未定"}${activity ? `｜${activity}` : ""}`);
    lines.push("（此內容由仙女補給站私訊送達，未發到任何群組。）");
    await pushText(target.lineUserId, lines.join("\n"));
    return json(request, { ok: true });
  } catch (error) {
    return json(request, { error: error instanceof Error ? "配送暫時塞車了，晚一點再試" : "配送暫時塞車了，晚一點再試" }, 500);
  }
}
