import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryFamilyInvites } from "../../../../../../db/schema";
import { clean, hashCode } from "../../../../admin/auth";
import { requireFamilyRole } from "../../../auth";
import { memoryRole } from "../../../families";

function validExpiry(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const min = Date.now() + 60 * 60 * 1000;
  const max = Date.now() + 1000 * 60 * 60 * 24 * 90;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? new Date(parsed).toISOString() : null;
}

export async function GET(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params;
  const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
  if (!("membership" in access)) return Response.json({ error: access.error }, { status: access.status });
  const invites = await getDb().select({
    id: memoryFamilyInvites.id, role: memoryFamilyInvites.role, maxUses: memoryFamilyInvites.maxUses,
    useCount: memoryFamilyInvites.useCount, expiresAt: memoryFamilyInvites.expiresAt, revokedAt: memoryFamilyInvites.revokedAt,
    createdAt: memoryFamilyInvites.createdAt,
  }).from(memoryFamilyInvites).where(eq(memoryFamilyInvites.familyId, familyId));
  return Response.json({ invites }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
    if (!("membership" in access)) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const expiresAt = validExpiry(body.expiresAt);
    const maxUses = typeof body.maxUses === "number" && Number.isInteger(body.maxUses) && body.maxUses >= 1 && body.maxUses <= 100 ? body.maxUses : 1;
    if (!expiresAt) return Response.json({ error: "邀請有效期需介於 1 小時至 90 天" }, { status: 400 });
    const code = crypto.randomUUID().replaceAll("-", "");
    const invite = { id: crypto.randomUUID(), familyId, codeHash: await hashCode(code), role: memoryRole(body.role), maxUses, expiresAt, createdByMemberId: access.membership.id };
    await getDb().insert(memoryFamilyInvites).values(invite);
    const url = new URL("/api/memory/auth/start", request.url);
    url.searchParams.set("invite", code);
    url.searchParams.set("returnTo", "/memory-capsule");
    return Response.json({ invite: { ...invite, codeHash: undefined }, inviteUrl: url.toString() }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法建立邀請" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params;
  const access = await requireFamilyRole(request, familyId, ["owner", "admin"]);
  if (!("membership" in access)) return Response.json({ error: access.error }, { status: access.status });
  const inviteId = clean(new URL(request.url).searchParams.get("inviteId"), 80);
  if (!inviteId) return Response.json({ error: "請指定邀請" }, { status: 400 });
  await getDb().update(memoryFamilyInvites).set({ revokedAt: new Date().toISOString() }).where(and(
    eq(memoryFamilyInvites.id, inviteId), eq(memoryFamilyInvites.familyId, familyId),
  ));
  return Response.json({ ok: true });
}
