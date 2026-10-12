import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryFamilyMembers } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";
import { memoryRole } from "../../../families";

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params;
  const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
  if (!("membership" in access)) return Response.json({ error: access.error }, { status: access.status });
  const members = await getDb().select({
    id: memoryFamilyMembers.id, displayName: memoryFamilyMembers.displayName, avatarUrl: memoryFamilyMembers.avatarUrl,
    role: memoryFamilyMembers.role, isActive: memoryFamilyMembers.isActive, joinedAt: memoryFamilyMembers.joinedAt,
  }).from(memoryFamilyMembers).where(eq(memoryFamilyMembers.familyId, familyId));
  return Response.json({ members }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner"]);
    if (!("membership" in access)) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const memberId = clean(body.memberId, 80);
    if (!memberId || memberId === access.membership.id) return Response.json({ error: "不能以此操作修改自己的擁有者權限" }, { status: 400 });
    const [member] = await getDb().select().from(memoryFamilyMembers).where(and(
      eq(memoryFamilyMembers.id, memberId), eq(memoryFamilyMembers.familyId, familyId),
    )).limit(1);
    if (!member) return Response.json({ error: "找不到此家族成員" }, { status: 404 });
    if (member.role === "owner") return Response.json({ error: "請先由另一位擁有者接手，才能停用或變更此帳號" }, { status: 400 });
    const patch: { role?: string; isActive?: boolean; updatedAt: string } = { updatedAt: new Date().toISOString() };
    if (body.role !== undefined) patch.role = memoryRole(body.role);
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    await getDb().update(memoryFamilyMembers).set(patch).where(eq(memoryFamilyMembers.id, memberId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新成員" }, { status: 400 });
  }
}
