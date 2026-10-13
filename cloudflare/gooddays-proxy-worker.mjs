/**
 * Free public entry for 好日子／水金呼吸 during the no-custom-domain phase.
 *
 * This Worker intentionally has no database credentials, LINE secrets, or R2
 * credentials. It is a fixed-origin edge gateway to the existing application,
 * keeping all authentication and media authorization on the application
 * server. When a paid custom domain is adopted, point it at this Worker first
 * and migrate the application runtime separately.
 */
const UPSTREAM_ORIGIN = "https://good-days-family-events.x0925234139.chatgpt.site";
const PUBLIC_ORIGIN = "https://gooddays.carewear.workers.dev";

function upstreamUrl(request) {
  const incoming = new URL(request.url);
  return new URL(`${incoming.pathname}${incoming.search}`, UPSTREAM_ORIGIN);
}

function rewriteInternalLocation(value) {
  const location = new URL(value, UPSTREAM_ORIGIN);
  if (location.origin !== UPSTREAM_ORIGIN) return value;
  const publicUrl = new URL(PUBLIC_ORIGIN);
  location.protocol = publicUrl.protocol;
  location.host = publicUrl.host;
  return location.toString();
}

export default {
  async fetch(request) {
    const upstream = upstreamUrl(request);
    const headers = new Headers(request.headers);
    // The upstream only receives requests addressed to its fixed host. It must
    // not accept an end-user supplied host or destination.
    headers.delete("host");

    const response = await fetch(new Request(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    }));

    const responseHeaders = new Headers(response.headers);
    const location = responseHeaders.get("location");
    if (location) responseHeaders.set("location", rewriteInternalLocation(location));
    responseHeaders.set("x-gooddays-entry", "cloudflare-worker");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  },
};
