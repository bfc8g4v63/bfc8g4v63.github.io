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
const APP_ORIGIN = "https://bfc8g4v63.github.io";

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

function addApiCorsHeaders(request, headers) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/") || request.headers.get("origin") !== APP_ORIGIN) return;
  headers.set("Access-Control-Allow-Origin", APP_ORIGIN);
  // Keep the transition compatible with the previous cached frontend, which
  // used the browser's default credential mode. The gateway never forwards or
  // exposes cookies, and the allowed origin remains a single fixed site.
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  headers.append("Vary", "Origin");
}

function upstreamHeaders(request) {
  const headers = new Headers(request.headers);
  // A browser's client-hint, navigation, cookie and edge headers describe the
  // public page rather than this fixed API gateway. Passing them upstream can
  // trigger browser-specific bot checks, even though the same API request is
  // valid. Keep only API-relevant request metadata.
  for (const name of [
    "host", "cookie", "origin", "referer", "user-agent",
    "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
    "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site",
    "cf-connecting-ip", "cf-ipcountry", "cf-ray", "x-forwarded-for",
  ]) headers.delete(name);
  return headers;
}

function apiGatewayError(request) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  addApiCorsHeaders(request, headers);
  return new Response(JSON.stringify({ error: "活動服務暫時無法連線，請稍後再試。" }), { status: 502, headers });
}

export default {
  async fetch(request) {
    const upstream = upstreamUrl(request);
    if (request.method === "OPTIONS" && new URL(request.url).pathname.startsWith("/api/")) {
      const headers = new Headers();
      addApiCorsHeaders(request, headers);
      return new Response(null, { status: 204, headers });
    }
    let response;
    try {
      response = await fetch(new Request(upstream, {
        method: request.method,
        headers: upstreamHeaders(request),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      }));
    } catch {
      return apiGatewayError(request);
    }

    const responseHeaders = new Headers(response.headers);
    const location = responseHeaders.get("location");
    if (location) responseHeaders.set("location", rewriteInternalLocation(location));
    // This gateway is stateless.  An upstream anti-bot cookie belongs to a
    // different host and must never be offered to a browser using the public
    // cross-origin API; some browsers otherwise reject the fetch outright.
    responseHeaders.delete("set-cookie");
    // Upstream error responses do not consistently include CORS headers. Add
    // them at the public gateway so browser clients can receive the real
    // validation or server error instead of an opaque "Failed to fetch".
    addApiCorsHeaders(request, responseHeaders);
    responseHeaders.set("x-gooddays-entry", "cloudflare-worker");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  },
};
