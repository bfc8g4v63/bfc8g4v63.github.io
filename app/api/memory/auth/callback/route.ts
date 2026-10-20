import { clearMemoryCookie, consumeOAuthState, createSessionCookie, exchangeLineCode, MEMORY_STATE_COOKIE, publicUrl } from "../../auth";
import { acceptMemoryInvite, refreshMemoryMemberProfile } from "../../families";

function finish(request: Request, destination: string, cookies: string[]) {
  // A comma-joined Set-Cookie value is not reliably parsed as two cookies by
  // browsers. Append each header so the LINE session survives the redirect.
  const headers = new Headers({ location: publicUrl(request, destination), "cache-control": "no-store" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const state = await consumeOAuthState(request, url.searchParams.get("state"));
    if (!state || url.searchParams.get("error")) return finish(request, "/memory-capsule?login=expired", [clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
    const code = url.searchParams.get("code");
    if (!code) return finish(request, "/memory-capsule?login=failed", [clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
    const identity = await exchangeLineCode(request, code, state.nonce);
    if (state.inviteCodeHash) await acceptMemoryInvite(identity, state.inviteCodeHash);
    await refreshMemoryMemberProfile(identity);
    return finish(request, state.returnTo, [await createSessionCookie(identity, request), clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
  } catch (error) {
    // Keep the browser response deliberately generic, but retain a bounded
    // server-side diagnostic. This is especially important when the public
    // entry is served through an edge gateway: LINE's token exchange error
    // must not be mistaken for a missing browser state cookie.
    console.error("Memory capsule LINE callback failed", error instanceof Error ? {
      name: error.name,
      message: error.message,
    } : { message: "Unknown callback error" });
    return finish(request, "/memory-capsule?login=failed", [clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
  }
}
