import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryComments, memoryMedia } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const mediaId = clean(body.mediaId, 80);
    const capsuleId = clean(body.capsuleId, 80);
    const content = clean(body.body, 1200);
    const kind = body.kind === "memory" ? "memory" : "comment";
    if (!content || Boolean(mediaId) === Boolean(capsuleId)) return Response.json({ error: "請選擇一個回憶位置並寫下內容" }, { status: 400 });
    if (mediaId) {
      const [media] = await getDb().select({ id: memoryMedia.id }).from(memoryMedia).where(and(
        eq(memoryMedia.id, mediaId), eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt),
      )).limit(1);
      if (!media) return Response.json({ error: "這份回憶已不存在" }, { status: 404 });
    } else {
      const [capsule] = await getDb().select({ id: memoryCapsules.id }).from(memoryCapsules).where(and(
        eq(memoryCapsules.id, capsuleId), eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false),
      )).limit(1);
      if (!capsule) return Response.json({ error: "這顆回憶膠囊已不存在" }, { status: 404 });
    }
    const comment = {
      id: crypto.randomUUID(), familyId, mediaId: mediaId || null, capsuleId: capsuleId || null,
      authorMemberId: access.membership.id, body: content, displayAs: clean(body.displayAs, 80), kind,
    };
    await getDb().insert(memoryComments).values(comment);
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法留下這段回憶" }, { status: 500 });
  }
}
