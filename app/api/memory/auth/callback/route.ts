import { clearMemoryCookie, consumeOAuthState, createSessionCookie, exchangeLineCode, MEMORY_STATE_COOKIE } from "../../auth";
import { acceptMemoryInvite } from "../../families";

function finish(request: Request, destination: string, cookies: string[]) {
  return new Response(null, { status: 302, headers: { location: new URL(destination, request.url).toString(), "set-cookie": cookies.join(", "), "cache-control": "no-store" } });
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
    return finish(request, state.returnTo, [await createSessionCookie(identity, request), clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
  } catch {
    return finish(request, "/memory-capsule?login=failed", [clearMemoryCookie(MEMORY_STATE_COOKIE, request)]);
  }
}
