import { and, eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { events, lineBindings, rsvps } from "../../../../db/schema";
import { eventMessage, lineConfig, pushText } from "../lib";

const labels: Record<string, string> = {
  seven_days: "活動前 7 天提醒（測試）",
  one_day: "活動前 1 天提醒（測試）",
  two_hours: "活動前 2 小時提醒（測試）",
};

function matchesSecret(supplied: string, expected: string) {
  if (!expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function POST(request: Request) {
  const config = lineConfig();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!matchesSecret(supplied, config.reminderTestSecret)) {
    return Response.json({ error: "未授權" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { reminderType?: unknown } | null;
  const reminderType = typeof body?.reminderType === "string" ? body.reminderType : "";
  const label = labels[reminderType];
  if (!label) return Response.json({ error: "不支援的測試提醒" }, { status: 400 });
  if (!config.reminderTestEventId || !config.reminderTestGroupId) {
    return Response.json({ error: "測試入口尚未設定" }, { status: 503 });
  }

  await ensureSchema();
  const db = getDb();
  const [event] = await db.select().from(events).where(and(
    eq(events.id, config.reminderTestEventId),
    eq(events.status, "active"),
  )).limit(1);
  const [binding] = await db.select().from(lineBindings)
    .where(eq(lineBindings.eventId, config.reminderTestEventId)).limit(1);
  if (!event || !binding || binding.groupId !== config.reminderTestGroupId) {
    return Response.json({ error: "測試活動或指定群組不符" }, { status: 409 });
  }

  const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
    eq(rsvps.eventId, event.id), eq(rsvps.response, "attending"),
  ));
  const attendingPeople = attending.reduce((sum, item) => sum + item.partySize, 0);
  await pushText(binding.groupId, eventMessage({ ...event, attendingPeople }, label));
  return Response.json({ ok: true, reminderType });
}
