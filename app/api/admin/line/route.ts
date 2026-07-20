import { and, eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { lineBindCodes, lineBindings, lineReminderSettings, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { requireEventManager } from "../auth";
import { eventMessage, lineConfig, pushText } from "../../line/lib";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function boolean(value: unknown) {
  return value === true;
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
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.eventId, body.editCode);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const db = getDb();
    const action = body.action;

    if (action === "create_binding_code") {
      if (!lineConfig().token || !lineConfig().channelSecret) {
        return json(request, { error: "請先完成 LINE Channel access token 與 Channel secret 設定" }, 503);
      }
      await db.delete(lineBindCodes).where(eq(lineBindCodes.eventId, access.event.id));
      const code = await createUniqueCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await db.insert(lineBindCodes).values({ code, eventId: access.event.id, expiresAt });
      return json(request, { ok: true, code, expiresAt });
    }

    if (action === "save_settings") {
      const values = {
        eventId: access.event.id,
        sevenDays: boolean(body.sevenDays),
        oneDay: boolean(body.oneDay),
        twoHours: boolean(body.twoHours),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(lineReminderSettings).values(values).onConflictDoUpdate({
        target: lineReminderSettings.eventId,
        set: values,
      });
      return json(request, { ok: true });
    }

    if (action === "send_test") {
      const [binding] = await db.select().from(lineBindings)
        .where(eq(lineBindings.eventId, access.event.id)).limit(1);
      if (!binding) return json(request, { error: "這個活動尚未綁定 LINE 群組" }, 400);
      const attending = await db.select({ partySize: rsvps.partySize }).from(rsvps).where(and(
        eq(rsvps.eventId, access.event.id), eq(rsvps.response, "attending"),
      ));
      await pushText(binding.groupId, eventMessage({
        ...access.event,
        attendingPeople: attending.reduce((sum, item) => sum + item.partySize, 0),
      }, "測試提醒"));
      return json(request, { ok: true });
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
