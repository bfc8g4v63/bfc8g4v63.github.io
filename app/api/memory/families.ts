import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { memoryCapsules, memoryFamilyInvites, memoryFamilyMembers, memoryFamilies } from "../../../db/schema";
import { clean } from "../admin/auth";
import type { LineIdentity } from "./auth";

export const MEMORY_ROLES = ["owner", "admin", "member"] as const;
export type MemoryRole = typeof MEMORY_ROLES[number];

export function memoryRole(value: unknown, fallback: MemoryRole = "member") {
  return typeof value === "string" && (MEMORY_ROLES as readonly string[]).includes(value) ? value as MemoryRole : fallback;
}

export function familySlug(value: unknown) {
  return clean(value, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function acceptMemoryInvite(identity: LineIdentity, codeHash: string) {
  const now = new Date().toISOString();
  const db = getDb();
  const [invite] = await db.select().from(memoryFamilyInvites).where(and(
    eq(memoryFamilyInvites.codeHash, codeHash), isNull(memoryFamilyInvites.revokedAt), gt(memoryFamilyInvites.expiresAt, now),
  )).limit(1);
  if (!invite || invite.useCount >= invite.maxUses) throw new Error("此家族邀請已失效或使用完畢");

  const [existing] = await db.select().from(memoryFamilyMembers).where(and(
    eq(memoryFamilyMembers.familyId, invite.familyId), eq(memoryFamilyMembers.lineSubject, identity.subject),
  )).limit(1);
  if (existing) {
    await db.update(memoryFamilyMembers).set({ displayName: identity.displayName, avatarUrl: identity.avatarUrl, isActive: true, updatedAt: now }).where(eq(memoryFamilyMembers.id, existing.id));
    return { familyId: invite.familyId, joined: false };
  }

  const result = await db.update(memoryFamilyInvites).set({ useCount: invite.useCount + 1 }).where(and(
    eq(memoryFamilyInvites.id, invite.id), eq(memoryFamilyInvites.useCount, invite.useCount), isNull(memoryFamilyInvites.revokedAt), lt(memoryFamilyInvites.useCount, invite.maxUses),
  )).returning({ id: memoryFamilyInvites.id });
  if (!result.length) throw new Error("此家族邀請已被使用，請向管理者索取新連結");
  await db.insert(memoryFamilyMembers).values({
    id: crypto.randomUUID(), familyId: invite.familyId, lineSubject: identity.subject,
    displayName: identity.displayName, avatarUrl: identity.avatarUrl, role: invite.role,
  });
  return { familyId: invite.familyId, joined: true };
}

export async function createMemoryFamily(identity: LineIdentity, nameInput: unknown, slugInput: unknown) {
  const displayName = clean(nameInput, 100);
  const slug = familySlug(slugInput);
  if (!displayName || !slug) throw new Error("請提供家族名稱與英文家族代碼");
  const familyId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const db = getDb();
  await db.batch([
    db.insert(memoryFamilies).values({ id: familyId, displayName, slug }),
    db.insert(memoryFamilyMembers).values({
      id: memberId, familyId, lineSubject: identity.subject, displayName: identity.displayName,
      avatarUrl: identity.avatarUrl, role: "owner",
    }),
    db.insert(memoryCapsules).values({
      id: crypto.randomUUID(), familyId, createdByMemberId: memberId,
      title: "陳水金家族皇宴", eraLabel: "第一顆回憶膠囊", sortOrder: 0,
      introduction: "把皇宴相聚的笑聲、合照與想說的話，留給未來每一位家人。",
    }),
  ]);
  return { familyId, memberId, displayName, slug };
}
