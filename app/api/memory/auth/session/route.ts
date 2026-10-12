import { activeMembershipFor, getMemorySession } from "../../auth";

export async function GET(request: Request) {
  try {
    const session = await getMemorySession(request);
    if (!session) return Response.json({ signedIn: false }, { headers: { "cache-control": "no-store" } });
    const memberships = await activeMembershipFor(session);
    return Response.json({ signedIn: true, profile: { displayName: session.displayName, avatarUrl: session.avatarUrl }, memberships }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ signedIn: false, setupRequired: true }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
