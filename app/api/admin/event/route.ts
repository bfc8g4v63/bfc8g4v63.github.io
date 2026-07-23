import { and, eq } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { lineBindings, lineReminderSettings, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { clean, requireEventManager } from "../auth";
import { lineConfig } from "../../line/lib";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.eventId, body.editCode, body.managerToken);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const db = getDb();
    const action = clean(body.action, 40);
    if (action === "cancel_rsvp" || action === "delete_rsvp") {
      const rsvpId = clean(body.rsvpId, 80);
      if (!rsvpId) return json(request, { error: "找不到要管理的回覆" }, 400);
      const [rsvp] = await db.select({ id: rsvps.id, name: rsvps.name }).from(rsvps).where(and(
        eq(rsvps.id, rsvpId),
        eq(rsvps.eventId, access.event.id),
      )).limit(1);
      if (!rsvp) return json(request, { error: "找不到這筆回覆" }, 404);
      if (action === "cancel_rsvp") {
        await db.update(rsvps).set({
          response: "not_attending",
          shareName: false,
          updatedAt: new Date().toISOString(),
        }).where(eq(rsvps.id, rsvp.id));
        return json(request, { ok: true, message: `已取消「${rsvp.name}」的參加` });
      }
      await db.delete(rsvps).where(eq(rsvps.id, rsvp.id));
      return json(request, { ok: true, message: `已刪除「${rsvp.name}」的回覆` });
    }
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
      event: {
        ...access.event,
        editCodeHash: undefined,
        managerTokenHash: undefined,
        participantCodeHash: undefined,
        shareUrl: `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(access.event.shareToken)}`,
      },
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
