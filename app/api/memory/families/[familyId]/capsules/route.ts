import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryCapsules, memoryMedia } from "../../../../../../db/schema";
import { clean } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";

const MANAGERS = ["owner", "admin"];

function capsuleFields(body: Record<string, unknown>) {
  return {
    title: clean(body.title, 100),
    introduction: clean(body.introduction, 1200),
    eraLabel: clean(body.eraLabel, 80),
  };
}

async function verifiedCover(familyId: string, capsuleId: string, value: unknown) {
  const coverMediaId = clean(value, 80);
  if (!coverMediaId) return null;
  const [media] = await getDb().select({ id: memoryMedia.id }).from(memoryMedia).where(and(
    eq(memoryMedia.id, coverMediaId), eq(memoryMedia.familyId, familyId), eq(memoryMedia.capsuleId, capsuleId),
    eq(memoryMedia.uploadState, "complete"),
  )).limit(1);
  if (!media) throw new Error("封面必須是這顆膠囊中已完成的相片或影片");
  return media.id;
}

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, MANAGERS);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const fields = capsuleFields(body);
    if (!fields.title) return Response.json({ error: "請為新的回憶膠囊取一個名稱" }, { status: 400 });
    const [last] = await getDb().select({ sortOrder: memoryCapsules.sortOrder }).from(memoryCapsules)
      .where(and(eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false))).orderBy(desc(memoryCapsules.sortOrder)).limit(1);
    const capsule = { id: crypto.randomUUID(), familyId, createdByMemberId: access.membership.id, ...fields, sortOrder: Number(last?.sortOrder || 0) + 1 };
    await getDb().insert(memoryCapsules).values(capsule);
    return Response.json({ capsule }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法建立回憶膠囊" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, MANAGERS);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const capsuleId = clean(body.capsuleId, 80);
    const [capsule] = await getDb().select().from(memoryCapsules).where(and(
      eq(memoryCapsules.id, capsuleId), eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false),
    )).limit(1);
    if (!capsule) return Response.json({ error: "找不到這顆回憶膠囊" }, { status: 404 });
    const now = new Date().toISOString();
    if (body.action === "move") {
      const direction = body.direction === "down" ? 1 : -1;
      const all = await getDb().select().from(memoryCapsules).where(and(eq(memoryCapsules.familyId, familyId), eq(memoryCapsules.isArchived, false)))
        .orderBy(memoryCapsules.sortOrder, desc(memoryCapsules.createdAt));
      const index = all.findIndex((item) => item.id === capsule.id);
      const neighbour = all[index + direction];
      if (!neighbour) return Response.json({ capsule });
      await getDb().batch([
        getDb().update(memoryCapsules).set({ sortOrder: neighbour.sortOrder, updatedAt: now }).where(eq(memoryCapsules.id, capsule.id)),
        getDb().update(memoryCapsules).set({ sortOrder: capsule.sortOrder, updatedAt: now }).where(eq(memoryCapsules.id, neighbour.id)),
      ]);
      return Response.json({ moved: true });
    }
    const fields = capsuleFields(body);
    if (!fields.title) return Response.json({ error: "膠囊名稱不能空白" }, { status: 400 });
    const coverMediaId = await verifiedCover(familyId, capsule.id, body.coverMediaId);
    await getDb().update(memoryCapsules).set({ ...fields, coverMediaId, updatedAt: now }).where(eq(memoryCapsules.id, capsule.id));
    return Response.json({ updated: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新回憶膠囊" }, { status: 500 });
  }
}
