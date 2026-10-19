import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryAuditLogs, memoryComments, memoryMedia, memoryReactions } from "../../../../../../db/schema";
import { requireFamilyRole } from "../../../auth";
import { signedR2Url } from "../../../r2";

const RETENTION_DAYS = 30;
const MAX_PURGE_PER_REQUEST = 100;

function cutoff() {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function expiredRows(familyId: string) {
  const before = cutoff();
  const db = getDb();
  const [media, comments] = await Promise.all([
    db.select({ id: memoryMedia.id, objectKey: memoryMedia.objectKey, deletedAt: memoryMedia.deletedAt }).from(memoryMedia).where(and(
      eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNotNull(memoryMedia.deletedAt), lte(memoryMedia.deletedAt, before),
    )).limit(MAX_PURGE_PER_REQUEST),
    db.select({ id: memoryComments.id, deletedAt: memoryComments.deletedAt }).from(memoryComments).where(and(
      eq(memoryComments.familyId, familyId), isNotNull(memoryComments.deletedAt), lte(memoryComments.deletedAt, before),
    )).limit(MAX_PURGE_PER_REQUEST),
  ]);
  return { media, comments, before };
}

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const { media, comments, before } = await expiredRows(familyId);
    return Response.json({ mediaCount: media.length, commentCount: comments.length, retentionDays: RETENTION_DAYS, eligibleBefore: before });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法讀取保留區" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const { media, comments } = await expiredRows(familyId);
    const removedMediaIds: string[] = [];
    for (const item of media) {
      const result = await fetch(await signedR2Url("DELETE", item.objectKey, { expiresIn: 120 }));
      if (!result.ok && result.status !== 404) throw new Error("私有儲存空間暫時無法清理，請稍後再試");
      removedMediaIds.push(item.id);
    }
    const db = getDb();
    if (removedMediaIds.length) {
      await db.delete(memoryReactions).where(and(eq(memoryReactions.familyId, familyId), eq(memoryReactions.targetType, "media"), inArray(memoryReactions.targetId, removedMediaIds)));
      await db.delete(memoryComments).where(and(eq(memoryComments.familyId, familyId), inArray(memoryComments.mediaId, removedMediaIds)));
      await db.delete(memoryMedia).where(and(eq(memoryMedia.familyId, familyId), inArray(memoryMedia.id, removedMediaIds)));
    }
    const removedCommentIds = comments.map((item) => item.id);
    if (removedCommentIds.length) await db.delete(memoryComments).where(and(eq(memoryComments.familyId, familyId), inArray(memoryComments.id, removedCommentIds)));
    if (removedMediaIds.length || removedCommentIds.length) await db.insert(memoryAuditLogs).values({
      id: crypto.randomUUID(), familyId, actorMemberId: access.membership.id, action: "retention_purged", targetType: "retention", targetId: "batch",
      metadata: JSON.stringify({ purgedMedia: removedMediaIds.length, purgedComments: removedCommentIds.length }),
    });
    return Response.json({ purgedMedia: removedMediaIds.length, purgedComments: removedCommentIds.length, retentionDays: RETENTION_DAYS });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法永久清理保留內容" }, { status: 500 });
  }
}
