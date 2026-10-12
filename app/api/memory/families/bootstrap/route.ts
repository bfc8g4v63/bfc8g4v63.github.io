import { bootstrapSecretMatches, requireMemorySession } from "../../auth";
import { createMemoryFamily } from "../../families";

export async function POST(request: Request) {
  try {
    const signedIn = await requireMemorySession(request);
    if ("error" in signedIn) return Response.json({ error: signedIn.error }, { status: signedIn.status });
    if (!bootstrapSecretMatches(request)) return Response.json({ error: "回憶膠囊尚未由管理者啟用" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const family = await createMemoryFamily(signedIn.session, body.displayName, body.slug);
    return Response.json({ family }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法建立家族" }, { status: 400 });
  }
}
