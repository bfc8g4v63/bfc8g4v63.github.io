import { eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { lineBindings, lineReminderSettings, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { requireEventManager } from "../auth";
import { lineConfig } from "../../line/lib";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.eventId, body.editCode);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const db = getDb();
    const [responses, bindingRows, settingRows] = await Promise.all([
      db.select({
        id: rsvps.id, name: rsvps.name, response: rsvps.response,
        partySize: rsvps.partySize, diet: rsvps.diet, note: rsvps.note,
        createdAt: rsvps.createdAt, updatedAt: rsvps.updatedAt,
      }).from(rsvps).where(eq(rsvps.eventId, access.event.id)),
      db.select().from(lineBindings).where(eq(lineBindings.eventId, access.event.id)).limit(1),
      db.select().from(lineReminderSettings).where(eq(lineReminderSettings.eventId, access.event.id)).limit(1),
    ]);
    const attending = responses.filter((item) => item.response === "attending");
    const settings = settingRows[0] || { sevenDays: true, oneDay: true, twoHours: false };
    return json(request, {
      event: { ...access.event, editCodeHash: undefined },
      rsvps: responses,
      summary: {
        attendingPeople: attending.reduce((sum, item) => sum + item.partySize, 0),
        attendingReplies: attending.length,
        notAttendingReplies: responses.filter((item) => item.response === "not_attending").length,
      },
      line: {
        configured: Boolean(lineConfig().token && lineConfig().channelSecret),
        binding: bindingRows[0] || null,
        settings: {
          sevenDays: Boolean(settings.sevenDays),
          oneDay: Boolean(settings.oneDay),
          twoHours: Boolean(settings.twoHours),
        },
      },
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "無法開啟管理後台" }, 500);
  }
}
