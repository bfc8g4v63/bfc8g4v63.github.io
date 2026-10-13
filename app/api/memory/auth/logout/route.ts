import { clearMemoryCookie, MEMORY_SESSION_COOKIE, MEMORY_STATE_COOKIE } from "../../auth";

export async function POST(request: Request) {
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearMemoryCookie(MEMORY_SESSION_COOKIE, request));
  headers.append("set-cookie", clearMemoryCookie(MEMORY_STATE_COOKIE, request));
  return Response.json({ ok: true }, { headers });
}
