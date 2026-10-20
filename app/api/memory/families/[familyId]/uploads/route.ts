import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryFamilies, memoryMedia } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";
import { safeObjectFilename, signedR2Url } from "../../../r2";

const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

async function reservedStorageBytes(familyId: string) {
  const now = new Date().toISOString();
  const [usage] = await getDb().select({ usedBytes: sql<number>`coalesce(sum(${memoryMedia.byteSize}), 0)` }).from(memoryMedia).where(and(
    eq(memoryMedia.familyId, familyId), isNull(memoryMedia.deletedAt),
    or(eq(memoryMedia.uploadState, "complete"), and(eq(memoryMedia.uploadState, "pending"), gt(memoryMedia.uploadExpiresAt, now))),
  ));
  return Number(usage?.usedBytes || 0);
}

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const capsuleId = clean(body.capsuleId, 80);
    const filename = clean(body.filename, 180);
    const mimeType = clean(body.mimeType, 80).toLowerCase();
    const byteSize = Number(body.byteSize);
    const wantsThumbnail = body.thumbnail === true;
    const isPhoto = PHOTO_MIME_TYPES.has(mimeType);
    const isVideo = VIDEO_MIME_TYPES.has(mimeType);
    const perFileLimit = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
    if (!capsuleId || !filename || (!isPhoto && !isVideo) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > perFileLimit) {
      return Response.json({ error: "請選擇 JPG、PNG、WebP、HEIC／HEIF 相片（單張上限 20 MB），或 MP4／MOV 影片（單支上限 1 GB）" }, { status: 400 });
    }
    const [capsule] = await getDb().select({ id: memoryCapsules.id }).from(memoryCapsules).where(and(
      eq(memoryCapsules.id, capsuleId), eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false),
    )).limit(1);
    if (!capsule) return Response.json({ error: "找不到可上傳的回憶膠囊" }, { status: 404 });
    const [family] = await getDb().select({ storageQuotaBytes: memoryFamilies.storageQuotaBytes }).from(memoryFamilies).where(eq(memoryFamilies.id, familyId)).limit(1);
    const quotaBytes = Number(family?.storageQuotaBytes || 20 * 1024 * 1024 * 1024);
    const usedBytes = await reservedStorageBytes(familyId);
    if (usedBytes + byteSize > quotaBytes) {
      return Response.json({ error: "家族儲存空間已達設定上限；請由管理者整理內容或提高容量後再上傳", usedBytes, quotaBytes }, { status: 413 });
    }
    const mediaId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const objectKey = `families/${familyId}/media/${mediaId}/original/${safeObjectFilename(filename, isVideo ? ".mp4" : ".jpg")}`;
    const thumbnailKey = `families/${familyId}/media/${mediaId}/thumb.webp`;
    await getDb().insert(memoryMedia).values({
      id: mediaId, familyId, capsuleId, authorMemberId: access.membership.id, objectKey,
      originalFilename: filename, mimeType, byteSize, title: clean(body.title, 120), description: clean(body.description, 1000),
      uploadState: "pending", uploadExpiresAt: expiresAt,
    });
    return Response.json({
      mediaId,
      uploadUrl: await signedR2Url("PUT", objectKey, { contentType: mimeType, expiresIn: 600 }),
      // The browser only receives this scoped URL when it successfully made a
      // local preview. The thumbnail uses the same private, short-lived path
      // as the original and can never be listed or read anonymously.
      thumbnailUploadUrl: wantsThumbnail ? await signedR2Url("PUT", thumbnailKey, { contentType: "image/webp", expiresIn: 600 }) : "",
      expiresAt,
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法準備相片上傳" }, { status: 500 });
  }
}
