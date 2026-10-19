import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryAuditLogs, memoryCapsules, memoryComments, memoryFamilies, memoryFamilyMembers, memoryMedia, memoryReactions } from "../../../../../../db/schema";
import { requireFamilyRole } from "../../../auth";
import { signedR2Url } from "../../../r2";
import { streamZip, textStream } from "../../../zip";

// A direct Worker response is deliberately bounded. It never retains an
// export object, and keeps a browser download reliable on a phone. Larger
// families can export each capsule separately without bypassing R2 privacy.
const MAX_DIRECT_EXPORT_BYTES = 2 * 1024 * 1024 * 1024;

function archiveFilename(name: string, fallback: string) {
  const clean = name.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+$/, "").slice(0, 150);
  return clean || fallback;
}

function attachmentFilename(date: string) {
  return `attachment; filename="family-memory-${date}.zip"`;
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const requestUrl = new URL(request.url);
    const capsuleId = requestUrl.searchParams.get("capsuleId")?.trim() || "";
    const db = getDb();
    const [family] = await db.select({ id: memoryFamilies.id, displayName: memoryFamilies.displayName }).from(memoryFamilies).where(and(eq(memoryFamilies.id, familyId), eq(memoryFamilies.isActive, true))).limit(1);
    if (!family) return Response.json({ error: "找不到可備份的家族" }, { status: 404 });

    const allCapsules = await db.select().from(memoryCapsules).where(eq(memoryCapsules.familyId, familyId)).orderBy(memoryCapsules.sortOrder, desc(memoryCapsules.createdAt));
    const selectedCapsules = capsuleId ? allCapsules.filter((capsule) => capsule.id === capsuleId) : allCapsules;
    if (capsuleId && !selectedCapsules.length) return Response.json({ error: "找不到這顆回憶膠囊" }, { status: 404 });
    const selectedCapsuleIds = new Set(selectedCapsules.map((capsule) => capsule.id));
    const allMedia = await db.select({
      id: memoryMedia.id, capsuleId: memoryMedia.capsuleId, authorMemberId: memoryMedia.authorMemberId, originalFilename: memoryMedia.originalFilename,
      mimeType: memoryMedia.mimeType, byteSize: memoryMedia.byteSize, title: memoryMedia.title, description: memoryMedia.description,
      capturedAt: memoryMedia.capturedAt, uploadState: memoryMedia.uploadState, hiddenAt: memoryMedia.hiddenAt, deletedAt: memoryMedia.deletedAt,
      createdAt: memoryMedia.createdAt, objectKey: memoryMedia.objectKey,
      authorName: memoryFamilyMembers.displayName,
    }).from(memoryMedia).innerJoin(memoryFamilyMembers, eq(memoryMedia.authorMemberId, memoryFamilyMembers.id)).where(and(
      eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"),
    )).orderBy(memoryMedia.createdAt);
    const media = allMedia.filter((item) => selectedCapsuleIds.has(item.capsuleId));
    const totalBytes = media.reduce((total, item) => total + Number(item.byteSize), 0);
    if (totalBytes > MAX_DIRECT_EXPORT_BYTES) return Response.json({
      error: "這次備份超過 2 GB；請先在「備份範圍」選擇單一膠囊分批下載，私有資料不會因為超大 ZIP 留在伺服器。",
      totalBytes, maxBytes: MAX_DIRECT_EXPORT_BYTES,
    }, { status: 413 });
    if (requestUrl.searchParams.get("check") === "1") return Response.json({
      ready: true, totalBytes, maxBytes: MAX_DIRECT_EXPORT_BYTES, mediaCount: media.length, scope: capsuleId ? "capsule" : "family",
    }, { headers: { "cache-control": "no-store" } });

    const mediaIds = new Set(media.map((item) => item.id));
    const comments = (await db.select({
      id: memoryComments.id, capsuleId: memoryComments.capsuleId, mediaId: memoryComments.mediaId, authorMemberId: memoryComments.authorMemberId,
      body: memoryComments.body, displayAs: memoryComments.displayAs, kind: memoryComments.kind, hiddenAt: memoryComments.hiddenAt,
      deletedAt: memoryComments.deletedAt, createdAt: memoryComments.createdAt, authorName: memoryFamilyMembers.displayName,
    }).from(memoryComments).innerJoin(memoryFamilyMembers, eq(memoryComments.authorMemberId, memoryFamilyMembers.id)).where(eq(memoryComments.familyId, familyId)).orderBy(memoryComments.createdAt))
      .filter((item) => (item.capsuleId && selectedCapsuleIds.has(item.capsuleId)) || (item.mediaId && mediaIds.has(item.mediaId)));
    const reactions = (await db.select({ targetType: memoryReactions.targetType, targetId: memoryReactions.targetId, reaction: memoryReactions.reaction, createdAt: memoryReactions.createdAt, memberName: memoryFamilyMembers.displayName })
      .from(memoryReactions).innerJoin(memoryFamilyMembers, eq(memoryReactions.memberId, memoryFamilyMembers.id)).where(eq(memoryReactions.familyId, familyId)))
      .filter((item) => item.targetType === "media" && mediaIds.has(item.targetId));
    const metadata = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      scope: capsuleId ? "capsule" : "family",
      family: { id: family.id, displayName: family.displayName },
      capsules: selectedCapsules.map(({ id, title, introduction, eraLabel, coverMediaId, sortOrder, isArchived, createdAt, updatedAt }) => ({ id, title, introduction, eraLabel, coverMediaId, sortOrder, isArchived, createdAt, updatedAt })),
      media: media.map(({ objectKey: _objectKey, ...item }) => ({ ...item, archivePath: `media/${item.id}/${archiveFilename(item.originalFilename, "media")}` })),
      comments,
      reactions,
    };
    await db.insert(memoryAuditLogs).values({
      id: crypto.randomUUID(), familyId, actorMemberId: access.membership.id, action: "backup_export_started", targetType: capsuleId ? "capsule" : "family", targetId: capsuleId || familyId,
      metadata: JSON.stringify({ scope: capsuleId ? "capsule" : "family", mediaCount: media.length, totalBytes }),
    });

    const entries = [
      { name: "metadata.json", open: async () => textStream(json(metadata)) },
      ...media.map((item) => ({
        name: `media/${item.id}/${archiveFilename(item.originalFilename, "media")}`,
        modifiedAt: new Date(item.createdAt),
        open: async () => {
          const response = await fetch(await signedR2Url("GET", item.objectKey, { expiresIn: 900 }));
          if (!response.ok || !response.body) throw new Error(`無法讀取「${item.originalFilename}」，請稍後重新下載備份`);
          return response.body;
        },
      })),
    ];
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new Response(streamZip(entries), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": attachmentFilename(date),
        "cache-control": "no-store, private",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法建立私密備份" }, { status: 500 });
  }
}
