import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { memoryFamilies } from "../../../../../../db/schema";
import { requireFamilyRole } from "../../../auth";

const GIGABYTE = 1024 * 1024 * 1024;

export async function PATCH(request: Request, context: { params: Promise<{ familyId: string }> }) {
  try {
    const { familyId } = await context.params;
    const access = await requireFamilyRole(request, familyId, ["owner"]);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as { storageQuotaBytes?: unknown };
    const quota = Number(body.storageQuotaBytes);
    if (!Number.isSafeInteger(quota) || quota < GIGABYTE || quota > 1024 * GIGABYTE) return Response.json({ error: "容量必須介於 1 GB 與 1 TB" }, { status: 400 });
    await getDb().update(memoryFamilies).set({ storageQuotaBytes: quota, updatedAt: new Date().toISOString() }).where(and(eq(memoryFamilies.id, familyId), eq(memoryFamilies.isActive, true)));
    return Response.json({ updated: true, storageQuotaBytes: quota });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新容量上限" }, { status: 500 });
  }
}
