import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { memoryComments } from "../../../../../db/schema";
import { clean } from "../../../admin/auth";
import { requireFamilyRole } from "../../auth";

async function permitted(request: Request, commentId: string) {
  const [comment] = await getDb().select().from(memoryComments).where(and(eq(memoryComments.id, commentId), isNull(memoryComments.deletedAt))).limit(1);
  if (!comment) return { error: "找不到這則留言", status: 404 as const };
  const access = await requireFamilyRole(request, comment.familyId, ["owner", "admin", "member"]);
  if ("error" in access) return access;
  if (comment.authorMemberId !== access.membership.id && !["owner", "admin"].includes(access.membership.role)) return { error: "只能修改自己的留言", status: 403 as const };
  return { comment, access };
}

export async function PATCH(request: Request, context: { params: Promise<{ commentId: string }> }) {
  try {
    const { commentId } = await context.params;
    const result = await permitted(request, commentId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    const body = await request.json() as Record<string, unknown>;
    const text = clean(body.body, 1200);
    if (!text) return Response.json({ error: "留言不能空白" }, { status: 400 });
    await getDb().update(memoryComments).set({ body: text, displayAs: clean(body.displayAs, 80) }).where(eq(memoryComments.id, result.comment.id));
    return Response.json({ updated: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法修改留言" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ commentId: string }> }) {
  try {
    const { commentId } = await context.params;
    const result = await permitted(request, commentId);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    await getDb().update(memoryComments).set({ deletedAt: new Date().toISOString() }).where(eq(memoryComments.id, result.comment.id));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法刪除留言" }, { status: 500 });
  }
}
