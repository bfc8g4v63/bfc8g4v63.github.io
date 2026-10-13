import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryComments, memoryFamilies, memoryFamilyMembers, memoryMedia, memoryReactions } from "../../../../../../db/schema";
import { requireFamilyRole } from "../../../auth";
import { signedR2Url } from "../../../r2";

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const db = getDb();
    const [family] = await db.select({ id: memoryFamilies.id, displayName: memoryFamilies.displayName, storageQuotaBytes: memoryFamilies.storageQuotaBytes }).from(memoryFamilies)
      .where(and(eq(memoryFamilies.id, familyId), eq(memoryFamilies.isActive, true))).limit(1);
    if (!family) return Response.json({ error: "找不到可使用的家族" }, { status: 404 });
    const capsules = await db.select().from(memoryCapsules).where(and(eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false)))
      .orderBy(memoryCapsules.sortOrder, desc(memoryCapsules.createdAt));
    const rows = await db.select({
      id: memoryMedia.id, capsuleId: memoryMedia.capsuleId, authorMemberId: memoryMedia.authorMemberId, originalFilename: memoryMedia.originalFilename,
      mimeType: memoryMedia.mimeType, byteSize: memoryMedia.byteSize, title: memoryMedia.title,
      description: memoryMedia.description, capturedAt: memoryMedia.capturedAt, createdAt: memoryMedia.createdAt, objectKey: memoryMedia.objectKey,
      authorName: memoryFamilyMembers.displayName, authorAvatar: memoryFamilyMembers.avatarUrl,
    }).from(memoryMedia).innerJoin(memoryFamilyMembers, eq(memoryMedia.authorMemberId, memoryFamilyMembers.id))
      .where(and(eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt)))
      .orderBy(desc(memoryMedia.createdAt)).limit(36);
    const [commentRows, reactionRows] = await Promise.all([
      db.select({
        id: memoryComments.id, mediaId: memoryComments.mediaId, capsuleId: memoryComments.capsuleId, body: memoryComments.body,
        displayAs: memoryComments.displayAs, kind: memoryComments.kind, createdAt: memoryComments.createdAt, authorMemberId: memoryComments.authorMemberId,
        authorName: memoryFamilyMembers.displayName, authorAvatar: memoryFamilyMembers.avatarUrl,
      }).from(memoryComments).innerJoin(memoryFamilyMembers, eq(memoryComments.authorMemberId, memoryFamilyMembers.id)).where(and(
        eq(memoryComments.familyId, familyId), isNull(memoryComments.deletedAt),
      )).orderBy(desc(memoryComments.createdAt)).limit(120),
      db.select({ targetId: memoryReactions.targetId, memberId: memoryReactions.memberId }).from(memoryReactions).where(and(
        eq(memoryReactions.familyId, familyId), eq(memoryReactions.targetType, "media"), eq(memoryReactions.reaction, "heart"),
      )),
    ]);
    const commentsByMedia = new Map<string, typeof commentRows>();
    const commentsByCapsule = new Map<string, typeof commentRows>();
    for (const comment of commentRows) {
      if (comment.mediaId) commentsByMedia.set(comment.mediaId, [...(commentsByMedia.get(comment.mediaId) || []), comment]);
      if (comment.capsuleId) commentsByCapsule.set(comment.capsuleId, [...(commentsByCapsule.get(comment.capsuleId) || []), comment]);
    }
    const heartsByMedia = new Map<string, { count: number; mine: boolean }>();
    for (const reaction of reactionRows) {
      const current = heartsByMedia.get(reaction.targetId) || { count: 0, mine: false };
      heartsByMedia.set(reaction.targetId, { count: current.count + 1, mine: current.mine || reaction.memberId === access.membership.id });
    }
    const media = await Promise.all(rows.map(async (row) => ({
      ...row, url: await signedR2Url("GET", row.objectKey, { expiresIn: 300 }), comments: commentsByMedia.get(row.id) || [],
      heartCount: heartsByMedia.get(row.id)?.count || 0, heartedByMe: heartsByMedia.get(row.id)?.mine || false,
    })));
    const [usage] = await db.select({ usedBytes: sql<number>`coalesce(sum(${memoryMedia.byteSize}), 0)` }).from(memoryMedia).where(and(
      eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt),
    ));
    const counts = new Map<string, number>();
    for (const item of rows) counts.set(item.capsuleId, (counts.get(item.capsuleId) || 0) + 1);
    return Response.json({
      family: { id: family.id, displayName: family.displayName }, storage: { usedBytes: Number(usage?.usedBytes || 0), quotaBytes: Number(family.storageQuotaBytes) },
      membership: access.membership, capsules: capsules.map((capsule) => ({
        ...capsule, mediaCount: counts.get(capsule.id) || 0, coverUrl: media.find((item) => item.id === capsule.coverMediaId)?.url || "",
        comments: commentsByCapsule.get(capsule.id) || [],
      })), media,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法載入家族回憶" }, { status: 500 });
  }
}
