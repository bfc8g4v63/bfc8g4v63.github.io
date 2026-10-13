import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { memoryMedia } from "../../../../../db/schema";
import { clean } from "../../../admin/auth";
import { requireFamilyRole } from "../../auth";

function capturedAt(value: unknown) {
  const date = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const [media] = await getDb().select().from(memoryMedia).where(and(eq(memoryMedia.id, mediaId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt))).limit(1);
    if (!media) return Response.json({ error: "找不到這份回憶" }, { status: 404 });
    const access = await requireFamilyRole(request, media.familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    if (media.authorMemberId !== access.membership.id && !["owner", "admin"].includes(access.membership.role)) return Response.json({ error: "只能修改自己上傳的內容" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    await getDb().update(memoryMedia).set({
      title: clean(body.title, 120), description: clean(body.description, 1000), capturedAt: capturedAt(body.capturedAt),
    }).where(eq(memoryMedia.id, media.id));
    return Response.json({ updated: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新回憶資料" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const [media] = await getDb().select().from(memoryMedia).where(and(eq(memoryMedia.id, mediaId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt))).limit(1);
    if (!media) return Response.json({ error: "找不到這份回憶" }, { status: 404 });
    const access = await requireFamilyRole(request, media.familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    if (media.authorMemberId !== access.membership.id && !["owner", "admin"].includes(access.membership.role)) return Response.json({ error: "只能刪除自己上傳的內容" }, { status: 403 });
    await getDb().update(memoryMedia).set({ deletedAt: new Date().toISOString() }).where(eq(memoryMedia.id, media.id));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法刪除回憶" }, { status: 500 });
  }
}
