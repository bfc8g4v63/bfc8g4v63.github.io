import { createOAuthStateCookie, lineLoginConfig, safeReturnTo } from "../../auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { channelId } = lineLoginConfig();
    const { state, nonce, header } = await createOAuthStateCookie(url.searchParams.get("invite") || "", safeReturnTo(url.searchParams.get("returnTo")), request);
    const callback = new URL("/api/memory/auth/callback", request.url).toString();
    const line = new URL("https://access.line.me/oauth2/v2.1/authorize");
    line.search = new URLSearchParams({ response_type: "code", client_id: channelId, redirect_uri: callback, state, scope: "openid profile", nonce }).toString();
    return new Response(null, { status: 302, headers: { location: line.toString(), "set-cookie": header, "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法啟動 LINE 登入" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
