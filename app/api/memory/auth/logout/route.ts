import { clearMemoryCookie, MEMORY_SESSION_COOKIE, MEMORY_STATE_COOKIE } from "../../auth";

export async function POST(request: Request) {
  return Response.json({ ok: true }, { headers: { "set-cookie": `${clearMemoryCookie(MEMORY_SESSION_COOKIE, request)}, ${clearMemoryCookie(MEMORY_STATE_COOKIE, request)}`, "cache-control": "no-store" } });
}
