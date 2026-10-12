import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryMedia } from "../../../../../../db/schema";
import { requireFamilyRole } from "../../../auth";
import { signedR2Url } from "../../../r2";

export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const [media] = await getDb().select().from(memoryMedia).where(and(eq(memoryMedia.id, mediaId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt))).limit(1);
    if (!media) return Response.json({ error: "找不到相片" }, { status: 404 });
    const access = await requireFamilyRole(request, media.familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    return Response.json({ url: await signedR2Url("GET", media.objectKey, { expiresIn: 300 }), expiresInSeconds: 300 }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法取得相片" }, { status: 500 });
  }
}
