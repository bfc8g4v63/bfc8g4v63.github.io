import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryMedia, memoryReactions } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";

async function targetMedia(familyId: string, targetId: string) {
  const [media] = await getDb().select({ id: memoryMedia.id }).from(memoryMedia).where(and(
    eq(memoryMedia.id, targetId), eq(memoryMedia.familyId, familyId), eq(memoryMedia.uploadState, "complete"), isNull(memoryMedia.deletedAt),
  )).limit(1);
  return media;
}

export async function PUT(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const targetId = clean(body.targetId, 80);
    if (body.targetType !== "media" || !targetId || !await targetMedia(familyId, targetId)) return Response.json({ error: "找不到要按愛心的回憶" }, { status: 404 });
    await getDb().insert(memoryReactions).values({ id: crypto.randomUUID(), familyId, memberId: access.membership.id, targetType: "media", targetId, reaction: "heart" }).onConflictDoNothing();
    return Response.json({ active: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法送出愛心" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin", "member"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const url = new URL(request.url);
    const targetId = clean(url.searchParams.get("targetId"), 80);
    await getDb().delete(memoryReactions).where(and(
      eq(memoryReactions.familyId, familyId), eq(memoryReactions.memberId, access.membership.id), eq(memoryReactions.targetType, "media"), eq(memoryReactions.targetId, targetId), eq(memoryReactions.reaction, "heart"),
    ));
    return Response.json({ active: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法收回愛心" }, { status: 500 });
  }
}
