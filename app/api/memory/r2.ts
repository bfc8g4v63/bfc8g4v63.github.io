import { env } from "cloudflare:workers";

type R2Runtime = {
  MEMORY_R2_ACCESS_KEY_ID?: string;
  MEMORY_R2_SECRET_ACCESS_KEY?: string;
  MEMORY_R2_BUCKET?: string;
  MEMORY_R2_ENDPOINT?: string;
  MEMORY_R2_REGION?: string;
};

type R2Config = { accessKeyId: string; secretAccessKey: string; bucket: string; endpoint: URL; region: string };

function required(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`回憶膠囊尚未完成 ${name} 設定`);
  return trimmed;
}

function config(): R2Config {
  const runtime = env as unknown as R2Runtime;
  return {
    accessKeyId: required(runtime.MEMORY_R2_ACCESS_KEY_ID, "MEMORY_R2_ACCESS_KEY_ID"),
    secretAccessKey: required(runtime.MEMORY_R2_SECRET_ACCESS_KEY, "MEMORY_R2_SECRET_ACCESS_KEY"),
    bucket: required(runtime.MEMORY_R2_BUCKET, "MEMORY_R2_BUCKET"),
    endpoint: new URL(required(runtime.MEMORY_R2_ENDPOINT, "MEMORY_R2_ENDPOINT")),
    region: runtime.MEMORY_R2_REGION?.trim() || "auto",
  };
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(key: ArrayBuffer | Uint8Array | string, value: string) {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

function timestamp(now: Date) {
  const compact = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { amzDate: compact, date: compact.slice(0, 8) };
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalKey(key: string) {
  return key.split("/").map(rfc3986).join("/");
}

/** Produces a short-lived, single-object S3-compatible URL for the private R2 bucket. */
export async function signedR2Url(method: "GET" | "HEAD" | "PUT", objectKey: string, options: { contentType?: string; expiresIn?: number } = {}) {
  const { accessKeyId, secretAccessKey, bucket, endpoint, region } = config();
  const { amzDate, date } = timestamp(new Date());
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const url = new URL(endpoint);
  url.pathname = `/${rfc3986(bucket)}/${canonicalKey(objectKey)}`;
  const signedHeaders = options.contentType ? "content-type;host" : "host";
  const entries: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(Math.min(Math.max(options.expiresIn ?? 300, 30), 900))],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQuery = entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&");
  const canonicalHeaders = `${options.contentType ? `content-type:${options.contentType.trim()}\n` : ""}host:${url.host}\n`;
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await digest(canonicalRequest)].join("\n");
  const dateKey = await hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export function safeObjectFilename(filename: string) {
  const extension = filename.toLowerCase().match(/\.(?:jpe?g|png|webp|heic|heif)$/)?.[0] || ".jpg";
  return `photo${extension}`;
}
