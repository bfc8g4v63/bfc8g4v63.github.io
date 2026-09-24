import { and, asc, eq, sql } from "drizzle-orm";
import { ensureSchema } from "../../../../db/init";
import { getDb } from "../../../../db";
import { lineBindings, lineCommandLogs, lineReminderSettings, mealAssignments, mealTables, rsvps } from "../../../../db/schema";
import { json, preflight } from "../../cors";
import { clean, hashCode, requireEventManager } from "../auth";
import { lineConfig } from "../../line/lib";
import { rateLimit } from "../../rate-limit";
import { arrangementNameKey } from "../../../../lib/arrangement";

export function OPTIONS(request: Request) {
  return preflight(request);
}

function wholeNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

const paymentStatuses = new Set(["unpaid", "paid", "waived"]);

function paymentStatus(value: unknown) {
  return typeof value === "string" && paymentStatuses.has(value) ? value : "";
}

async function saveMealSeating(
  body: Record<string, unknown>,
  eventId: string,
  rows: Array<{ id: string; partySize: number; response: string }>,
) {
  const tableInput = Array.isArray(body.tables) ? body.tables : null;
  const assignmentInput = Array.isArray(body.assignments) ? body.assignments : null;
  if (!tableInput || !assignmentInput) throw new Error("餐桌安排資料不完整");
  if (tableInput.length > 24 || assignmentInput.length > 240) throw new Error("餐桌安排數量超過第一版上限");

  const tableIds = new Set<string>();
  const tableNames = new Map<string, string>();
  const tables = tableInput.map((item, index) => {
    const input = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const id = clean(input.id, 80);
    const capacity = wholeNumber(input.capacity, 1, 50);
    const name = clean(input.name, 40) || `第 ${index + 1} 桌`;
    const nameKey = arrangementNameKey(name);
    if (!id || !capacity || tableIds.has(id)) throw new Error("安排區資料不完整或重複");
    const duplicateName = tableNames.get(nameKey);
    if (!nameKey || duplicateName) throw new Error(`安排區名稱「${name}」與「${duplicateName || name}」重複，請改為不同名稱`);
    tableIds.add(id);
    tableNames.set(nameKey, name);
    return {
      id,
      eventId,
      name,
      nameKey,
      capacity,
      isReserve: input.isReserve === true,
      note: clean(input.note, 80),
      sortOrder: index,
      updatedAt: new Date().toISOString(),
    };
  });

  const attending = new Map(rows.filter((row) => row.response === "attending").map((row) => [row.id, row.partySize]));
  const peopleByRsvp = new Map<string, number>();
  const peopleByTable = new Map<string, number>();
  const assignments = assignmentInput.map((item) => {
    const input = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const tableId = clean(input.tableId, 80);
    const rsvpId = clean(input.rsvpId, 80);
    const people = wholeNumber(input.people, 1, 999);
    if (!tableIds.has(tableId) || !attending.has(rsvpId) || !people) throw new Error("餐桌分配包含無效的報名資料");
    const totalForRsvp = (peopleByRsvp.get(rsvpId) || 0) + people;
    const totalForTable = (peopleByTable.get(tableId) || 0) + people;
    if (totalForRsvp > (attending.get(rsvpId) || 0)) throw new Error("同一筆報名不能安排超過原本的人數");
    const table = tables.find((item) => item.id === tableId);
    if (!table || totalForTable > table.capacity) throw new Error(`「${table?.name || "這桌"}」超過人數上限`);
    peopleByRsvp.set(rsvpId, totalForRsvp);
    peopleByTable.set(tableId, totalForTable);
    return { id: crypto.randomUUID(), eventId, tableId, rsvpId, people, updatedAt: new Date().toISOString() };
  });

  const db = getDb();
  await db.delete(mealAssignments).where(eq(mealAssignments.eventId, eventId));
  await db.delete(mealTables).where(eq(mealTables.eventId, eventId));
  if (tables.length) await db.insert(mealTables).values(tables);
  if (assignments.length) await db.insert(mealAssignments).values(assignments);
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "admin-event", 60, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `管理操作過於頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const access = await requireEventManager(body.eventId, body.editCode, body.managerToken);
    if ("error" in access) return json(request, { error: access.error }, access.status);
    const db = getDb();
    const action = clean(body.action, 40);
    if (action === "save_meal_seating") {
      const rows = await db.select({ id: rsvps.id, partySize: rsvps.partySize, response: rsvps.response })
        .from(rsvps).where(eq(rsvps.eventId, access.event.id));
      await saveMealSeating(body, access.event.id, rows);
      return json(request, { ok: true, message: "餐桌安排已儲存" });
    }
    if (action === "create_rsvp") {
      const name = clean(body.name, 60);
      const response = body.response === "not_attending" ? "not_attending" : "attending";
      const partySize = wholeNumber(body.partySize, 1, 999);
      if (!name || (response === "attending" && !partySize)) {
        return json(request, { error: "請確認姓名、出席狀態與參加人數" }, 400);
      }
      const [duplicate] = await db.select({ id: rsvps.id }).from(rsvps).where(and(
        eq(rsvps.eventId, access.event.id), eq(rsvps.name, name),
      )).limit(1);
      if (duplicate) return json(request, { error: `「${name}」已有一筆回覆，請改用「修改回覆」` }, 409);
      await db.insert(rsvps).values({
        id: crypto.randomUUID(),
        eventId: access.event.id,
        name,
        response,
        partySize: response === "attending" ? partySize! : 0,
        paymentStatus: response === "attending" && access.event.feePerPerson > 0 ? "unpaid" : "not_applicable",
        diet: clean(body.diet, 120),
        note: clean(body.note, 300),
        shareName: false,
        // 由管理者代填的資料只可由管理後台修改，不會把更新權限交給
        // 任一輸入同名的人。
        viewerTokenHash: await hashCode(crypto.randomUUID()),
        updatedAt: new Date().toISOString(),
      });
      return json(request, { ok: true, message: `已代為新增「${name}」的回覆` });
    }
    if (action === "update_rsvp") {
      const rsvpId = clean(body.rsvpId, 80);
      const name = clean(body.name, 60);
      const response = body.response === "attending" ? "attending" : body.response === "not_attending" ? "not_attending" : "";
      const partySize = wholeNumber(body.partySize, 1, 999);
      if (!rsvpId || !name || !response || (response === "attending" && !partySize)) {
        return json(request, { error: "請確認姓名、出席狀態與參加人數" }, 400);
      }
      const [rsvp] = await db.select({ id: rsvps.id, name: rsvps.name, partySize: rsvps.partySize, response: rsvps.response, paymentStatus: rsvps.paymentStatus })
        .from(rsvps).where(and(eq(rsvps.id, rsvpId), eq(rsvps.eventId, access.event.id))).limit(1);
      if (!rsvp) return json(request, { error: "找不到這筆回覆" }, 404);
      const [duplicate] = await db.select({ id: rsvps.id }).from(rsvps).where(and(
        eq(rsvps.eventId, access.event.id), eq(rsvps.name, name),
      )).limit(1);
      if (duplicate && duplicate.id !== rsvp.id) return json(request, { error: `「${name}」已有一筆回覆，請先確認是否為同一人` }, 409);
      const nextPartySize = response === "attending" ? partySize : 0;
      const seatingChanged = rsvp.response !== response || rsvp.partySize !== nextPartySize;
      const nextPaymentStatus = response !== "attending" || access.event.feePerPerson <= 0
        ? "not_applicable"
        : seatingChanged || !["paid", "waived"].includes(rsvp.paymentStatus)
          ? "unpaid"
          : rsvp.paymentStatus;
      if (seatingChanged) await db.delete(mealAssignments).where(eq(mealAssignments.rsvpId, rsvp.id));
      await db.update(rsvps).set({
        name,
        response,
        paymentStatus: nextPaymentStatus,
        partySize: nextPartySize,
        diet: clean(body.diet, 120),
        note: clean(body.note, 300),
        ...(response === "not_attending" ? { shareName: false } : {}),
        updatedAt: new Date().toISOString(),
      }).where(eq(rsvps.id, rsvp.id));
      const paymentReset = seatingChanged && response === "attending" && access.event.feePerPerson > 0;
      return json(request, {
        ok: true,
        message: seatingChanged
          ? `已更新「${rsvp.name}」的回覆，原本的活動安排已清除${paymentReset ? "，收款狀態已改為待收" : ""}`
          : `已更新「${rsvp.name}」的回覆`,
      });
    }
    if (action === "update_payment") {
      const rsvpId = clean(body.rsvpId, 80);
      const nextPaymentStatus = paymentStatus(body.paymentStatus);
      if (!rsvpId || !nextPaymentStatus) return json(request, { error: "請選擇有效的收款狀態" }, 400);
      if (access.event.feePerPerson <= 0) return json(request, { error: "此活動未設定收費" }, 400);
      const [rsvp] = await db.select({ id: rsvps.id, name: rsvps.name, response: rsvps.response })
        .from(rsvps).where(and(eq(rsvps.id, rsvpId), eq(rsvps.eventId, access.event.id))).limit(1);
      if (!rsvp) return json(request, { error: "找不到這筆回覆" }, 404);
      if (rsvp.response !== "attending") return json(request, { error: "未參加者不需要收款" }, 400);
      await db.update(rsvps).set({ paymentStatus: nextPaymentStatus, updatedAt: new Date().toISOString() })
        .where(eq(rsvps.id, rsvp.id));
      return json(request, { ok: true, message: `已更新「${rsvp.name}」的收款狀態` });
    }
    if (action === "cancel_rsvp" || action === "delete_rsvp") {
      const rsvpId = clean(body.rsvpId, 80);
      if (!rsvpId) return json(request, { error: "找不到要管理的回覆" }, 400);
      const [rsvp] = await db.select({ id: rsvps.id, name: rsvps.name }).from(rsvps).where(and(
        eq(rsvps.id, rsvpId),
        eq(rsvps.eventId, access.event.id),
      )).limit(1);
      if (!rsvp) return json(request, { error: "找不到這筆回覆" }, 404);
      if (action === "cancel_rsvp") {
        await db.delete(mealAssignments).where(eq(mealAssignments.rsvpId, rsvp.id));
        await db.update(rsvps).set({
          response: "not_attending",
          paymentStatus: "not_applicable",
          shareName: false,
          updatedAt: new Date().toISOString(),
        }).where(eq(rsvps.id, rsvp.id));
        return json(request, { ok: true, message: `已取消「${rsvp.name}」的參加` });
      }
      await db.delete(mealAssignments).where(eq(mealAssignments.rsvpId, rsvp.id));
      await db.delete(rsvps).where(eq(rsvps.id, rsvp.id));
      return json(request, { ok: true, message: `已刪除「${rsvp.name}」的回覆` });
    }
    const [responses, bindingRows, settingRows, mealTableRows, mealAssignmentRows, commandLogs] = await Promise.all([
      db.select({
        id: rsvps.id, name: rsvps.name, response: rsvps.response,
        partySize: rsvps.partySize, diet: rsvps.diet, note: rsvps.note, paymentStatus: rsvps.paymentStatus,
        createdAt: rsvps.createdAt, updatedAt: rsvps.updatedAt,
      }).from(rsvps).where(eq(rsvps.eventId, access.event.id)),
      db.select().from(lineBindings).where(eq(lineBindings.eventId, access.event.id)).limit(1),
      db.select().from(lineReminderSettings).where(eq(lineReminderSettings.eventId, access.event.id)).limit(1),
      db.select().from(mealTables).where(eq(mealTables.eventId, access.event.id)).orderBy(asc(mealTables.sortOrder)),
      db.select().from(mealAssignments).where(eq(mealAssignments.eventId, access.event.id)),
      db.select({ command: lineCommandLogs.command, outcome: lineCommandLogs.outcome, detail: lineCommandLogs.detail, createdAt: lineCommandLogs.createdAt })
        .from(lineCommandLogs).where(eq(lineCommandLogs.eventId, access.event.id)).orderBy(sql`${lineCommandLogs.createdAt} desc`).limit(12),
    ]);
    const attending = responses.filter((item) => item.response === "attending");
    const feePerPerson = Math.max(0, access.event.feePerPerson || 0);
    const feeSummary = attending.reduce((summary, item) => {
      const amount = item.partySize * feePerPerson;
      summary.grossAmount += amount;
      if (item.paymentStatus === "paid") summary.paidAmount += amount;
      else if (item.paymentStatus === "waived") summary.waivedAmount += amount;
      else summary.unpaidAmount += amount;
      return summary;
    }, { feePerPerson, grossAmount: 0, paidAmount: 0, unpaidAmount: 0, waivedAmount: 0 });
    const settings = settingRows[0] || { sevenDays: true, oneDay: true, twoHours: false, includeDiet: false, includeNote: false };
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
        fee: feeSummary,
      },
      line: {
        configured: Boolean(lineConfig().token && lineConfig().channelSecret),
        binding: bindingRows[0] || null,
        settings: {
          sevenDays: Boolean(settings.sevenDays),
          oneDay: Boolean(settings.oneDay),
          twoHours: Boolean(settings.twoHours),
          includeDiet: Boolean(settings.includeDiet),
          includeNote: Boolean(settings.includeNote),
        },
        commandLogs,
      },
      mealSeating: {
        tables: mealTableRows.map((table) => ({
          id: table.id, name: table.name, capacity: table.capacity,
          isReserve: Boolean(table.isReserve), note: table.note, sortOrder: table.sortOrder,
        })),
        assignments: mealAssignmentRows.map((assignment) => ({
          id: assignment.id, tableId: assignment.tableId, rsvpId: assignment.rsvpId, people: assignment.people,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法開啟管理後台";
    if (message.includes("capacity_exceeded")) {
      return json(request, { error: "這個活動已額滿；請先調整既有回覆的人數或取消參加。" }, 409);
    }
    return json(request, { error: message }, 500);
  }
}
