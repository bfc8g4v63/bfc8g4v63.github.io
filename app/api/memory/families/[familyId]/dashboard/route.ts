import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryFamilies, memoryFamilyMembers, memoryMedia } from "../../../../../../db/schema";
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
      id: memoryMedia.id, capsuleId: memoryMedia.capsuleId, originalFilename: memoryMedia.originalFilename,
      mimeType: memoryMedia.mimeType, byteSize: memoryMedia.byteSize, title: memoryMedia.title,
      description: memoryMedia.description, createdAt: memoryMedia.createdAt, objectKey: memoryMedia.objectKey,
      authorName: memoryFamilyMembers.displayName, authorAvatar: memoryFamilyMembers.avatarUrl,
    }).from(memoryMedia).innerJoin(memoryFamilyMembers, eq(memoryMedia.authorMemberId, memoryFamilyMembers.id))
      .where(and(eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt)))
      .orderBy(desc(memoryMedia.createdAt)).limit(36);
    const media = await Promise.all(rows.map(async (row) => ({ ...row, url: await signedR2Url("GET", row.objectKey, { expiresIn: 300 }) })));
    const [usage] = await db.select({ usedBytes: sql<number>`coalesce(sum(${memoryMedia.byteSize}), 0)` }).from(memoryMedia).where(and(
      eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt),
    ));
    const counts = new Map<string, number>();
    for (const item of rows) counts.set(item.capsuleId, (counts.get(item.capsuleId) || 0) + 1);
    return Response.json({
      family: { id: family.id, displayName: family.displayName }, storage: { usedBytes: Number(usage?.usedBytes || 0), quotaBytes: Number(family.storageQuotaBytes) },
      membership: access.membership, capsules: capsules.map((capsule) => ({ ...capsule, mediaCount: counts.get(capsule.id) || 0 })), media,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法載入家族回憶" }, { status: 500 });
  }
}
