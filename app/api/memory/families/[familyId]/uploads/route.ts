import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryMedia } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";
import { safeObjectFilename, signedR2Url } from "../../../r2";

const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

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
    if (!capsuleId || !filename || !PHOTO_MIME_TYPES.has(mimeType) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_PHOTO_BYTES) {
      return Response.json({ error: "請選擇 JPG、PNG、WebP 或 HEIC 相片（單張上限 20 MB）" }, { status: 400 });
    }
    const [capsule] = await getDb().select({ id: memoryCapsules.id }).from(memoryCapsules).where(and(
      eq(memoryCapsules.id, capsuleId), eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false),
    )).limit(1);
    if (!capsule) return Response.json({ error: "找不到可上傳的回憶膠囊" }, { status: 404 });
    const mediaId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const objectKey = `families/${familyId}/media/${mediaId}/original/${safeObjectFilename(filename)}`;
    await getDb().insert(memoryMedia).values({
      id: mediaId, familyId, capsuleId, authorMemberId: access.membership.id, objectKey,
      originalFilename: filename, mimeType, byteSize, title: clean(body.title, 120), description: clean(body.description, 1000),
      uploadState: "pending", uploadExpiresAt: expiresAt,
    });
    return Response.json({ mediaId, uploadUrl: await signedR2Url("PUT", objectKey, { contentType: mimeType, expiresIn: 600 }), expiresAt }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法準備相片上傳" }, { status: 500 });
  }
}
