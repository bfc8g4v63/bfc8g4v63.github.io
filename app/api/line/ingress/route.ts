import { env } from "cloudflare:workers";
import { getRequestExecutionContext } from "vinext/shims/request-context";

type LineBindings = {
  LINE_CHANNEL_SECRET?: string;
  REMINDER_SECRET?: string;
};

function sameValue(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyLineSignature(body: string, signature: string) {
  const { LINE_CHANNEL_SECRET: secret = "" } = env as unknown as LineBindings;
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return sameValue(btoa(String.fromCharCode(...new Uint8Array(signed))), signature);
}

// This route is intentionally tiny. LINE only needs a verified 2xx here;
// the full command handler can then run outside LINE's two-second deadline.
export async function POST(request: Request) {
  const body = await request.text();
  if (!await verifyLineSignature(body, request.headers.get("x-line-signature") || "")) {
    return Response.json({ error: "Invalid LINE signature" }, { status: 401 });
  }
  const { REMINDER_SECRET: relaySecret = "" } = env as unknown as LineBindings;
  if (!relaySecret) return Response.json({ error: "Relay is unavailable" }, { status: 503 });

  const processorUrl = new URL("/api/line/webhook", request.url);
  // Yield once before starting the heavier processor. This keeps its cold
  // start out of LINE's acknowledgement path while waitUntil keeps it alive.
  const processing = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => fetch(processorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goodday-line-relay": relaySecret },
    body,
  })).then((response) => {
    if (!response.ok) throw new Error(`LINE relay failed (${response.status})`);
  }).catch((error) => console.error("LINE relay failed", error));
  const context = getRequestExecutionContext();
  if (context) context.waitUntil(processing);
  else void processing;
  return Response.json({ ok: true });
}
