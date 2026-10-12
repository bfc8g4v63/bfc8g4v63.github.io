import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../../db";
import { memoryMedia } from "../../../../../../../../db/schema";
import { requireFamilyRole } from "../../../../../auth";
import { signedR2Url } from "../../../../../r2";

export async function POST(request: Request, context: { params: Promise<{ familyId: string; mediaId: string }> }) {
  try {
    const { familyId, mediaId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const [media] = await getDb().select().from(memoryMedia).where(and(
      eq(memoryMedia.id, mediaId), eq(memoryMedia.familyId, familyId), eq(memoryMedia.authorMemberId, access.membership.id), eq(memoryMedia.uploadState, "pending"),
    )).limit(1);
    if (!media || new Date(media.uploadExpiresAt).getTime() < Date.now()) return Response.json({ error: "此上傳已過期，請重新選擇相片" }, { status: 410 });
    const check = await fetch(await signedR2Url("HEAD", media.objectKey, { expiresIn: 120 }));
    const actualSize = Number(check.headers.get("content-length"));
    const actualType = check.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (!check.ok || actualSize !== media.byteSize || actualType !== media.mimeType) return Response.json({ error: "R2 未確認相片檔案，請重新上傳" }, { status: 400 });
    await getDb().update(memoryMedia).set({ uploadState: "complete" }).where(eq(memoryMedia.id, media.id));
    return Response.json({ media: { id: media.id, url: await signedR2Url("GET", media.objectKey, { expiresIn: 300 }) } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法完成相片上傳" }, { status: 500 });
  }
}
