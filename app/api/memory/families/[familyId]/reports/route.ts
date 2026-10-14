import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryAuditLogs, memoryComments, memoryFamilyMembers, memoryMedia, memoryReports } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";

type Target = typeof memoryMedia | typeof memoryComments;
function tableFor(kind: string): Target | null { return kind === "media" ? memoryMedia : kind === "comment" ? memoryComments : null; }
async function audit(familyId: string, actorMemberId: string, action: string, targetType: string, targetId: string) {
  await getDb().insert(memoryAuditLogs).values({ id: crypto.randomUUID(), familyId, actorMemberId, action, targetType, targetId });
}
async function findTarget(familyId: string, targetType: string, targetId: string) {
  const table = tableFor(targetType); if (!table) return null;
  const [target] = await getDb().select({ id: table.id, hiddenAt: table.hiddenAt, deletedAt: table.deletedAt }).from(table).where(and(eq(table.id, targetId), eq(table.familyId, familyId))).limit(1);
  return target;
}

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params; const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  const db = getDb();
  const reports = await db.select({ id: memoryReports.id, targetType: memoryReports.targetType, targetId: memoryReports.targetId, reason: memoryReports.reason, status: memoryReports.status, createdAt: memoryReports.createdAt, reporterName: memoryFamilyMembers.displayName }).from(memoryReports).innerJoin(memoryFamilyMembers, eq(memoryReports.reporterMemberId, memoryFamilyMembers.id)).where(eq(memoryReports.familyId, familyId)).orderBy(desc(memoryReports.createdAt)).limit(30);
  const result = await Promise.all(reports.map(async (report) => ({ ...report, target: await findTarget(familyId, report.targetType, report.targetId) })));
  const audits = await db.select({ action: memoryAuditLogs.action, targetType: memoryAuditLogs.targetType, createdAt: memoryAuditLogs.createdAt, actorName: memoryFamilyMembers.displayName }).from(memoryAuditLogs).leftJoin(memoryFamilyMembers, eq(memoryAuditLogs.actorMemberId, memoryFamilyMembers.id)).where(eq(memoryAuditLogs.familyId, familyId)).orderBy(desc(memoryAuditLogs.createdAt)).limit(12);
  return Response.json({ reports: result, audits }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params; const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json() as Record<string, unknown>; const targetType = clean(body.targetType, 16); const targetId = clean(body.targetId, 80); const reason = clean(body.reason, 500);
  const target = await findTarget(familyId, targetType, targetId);
  if (!target || target.deletedAt) return Response.json({ error: "找不到可回報的內容" }, { status: 404 });
  if (!reason) return Response.json({ error: "請簡短說明回報原因" }, { status: 400 });
  await getDb().insert(memoryReports).values({ id: crypto.randomUUID(), familyId, reporterMemberId: access.membership.id, targetType, targetId, reason });
  await audit(familyId, access.membership.id, "report_created", targetType, targetId);
  return Response.json({ reported: true }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params; const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json() as Record<string, unknown>; const reportId = clean(body.reportId, 80); const action = clean(body.action, 16);
  const [report] = await getDb().select().from(memoryReports).where(and(eq(memoryReports.id, reportId), eq(memoryReports.familyId, familyId))).limit(1);
  if (!report) return Response.json({ error: "找不到這筆回報" }, { status: 404 });
  const target = await findTarget(familyId, report.targetType, report.targetId); const table = tableFor(report.targetType);
  if (!target || !table || target.deletedAt) return Response.json({ error: "這份內容已不存在" }, { status: 404 });
  if (action === "hide" || action === "restore") await getDb().update(table).set({ hiddenAt: action === "hide" ? new Date().toISOString() : null }).where(eq(table.id, report.targetId));
  else if (action !== "dismiss") return Response.json({ error: "不支援的處理方式" }, { status: 400 });
  await getDb().update(memoryReports).set({ status: action === "hide" ? "hidden" : action === "restore" ? "restored" : "dismissed", resolvedAt: new Date().toISOString(), resolvedByMemberId: access.membership.id }).where(eq(memoryReports.id, report.id));
  await audit(familyId, access.membership.id, `report_${action}`, report.targetType, report.targetId);
  return Response.json({ updated: true });
}
