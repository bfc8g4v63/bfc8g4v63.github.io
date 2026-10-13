import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { memoryFamilyMembers, memoryFamilies } from "../../../db/schema";

export const MEMORY_SESSION_COOKIE = "memory_capsule_session";
export const MEMORY_STATE_COOKIE = "memory_capsule_state";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
const STATE_LIFETIME_SECONDS = 10 * 60;

type RuntimeEnv = {
  MEMORY_LINE_LOGIN_CHANNEL_ID?: string;
  MEMORY_LINE_LOGIN_CHANNEL_SECRET?: string;
  MEMORY_SESSION_SECRET?: string;
  MEMORY_BOOTSTRAP_SECRET?: string;
  /**
   * Optional canonical public origin. This is required when a trusted edge
   * Worker is the public entry point while the application runs elsewhere.
   */
  MEMORY_PUBLIC_ORIGIN?: string;
};

export type LineIdentity = {
  subject: string;
  displayName: string;
  avatarUrl: string;
};

export type MemorySession = LineIdentity & {
  expiresAt: number;
};

type MemoryAuthorizationFailure = { error: string; status: 401 | 403 };
type MemorySessionAccess = { session: MemorySession } | { error: string; status: 401 };
export type FamilyRoleAccess = {
  session: MemorySession;
  membership: {
    id: string;
    familyId: string;
    role: string;
    displayName: string;
    avatarUrl: string;
    familyName: string;
    familySlug: string;
    familyActive: boolean;
  };
} | MemoryAuthorizationFailure;

type OAuthState = {
  expiresAt: number;
  inviteCodeHash: string;
  nonce: string;
  returnTo: string;
};

export class MemoryConfigurationError extends Error {}

function runtime() {
  return env as unknown as RuntimeEnv;
}

function required(name: keyof RuntimeEnv) {
  const value = runtime()[name]?.trim();
  if (!value) throw new MemoryConfigurationError(`回憶膠囊尚未完成 ${name} 設定`);
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function safeJson<T>(encoded: string) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as T;
  } catch {
    return null;
  }
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(required("MEMORY_SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function signPayload(payload: object) {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded)}`;
}

async function readPayload<T>(value: string | undefined) {
  if (!value) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra || !sameValue(await hmac(encoded), signature)) return null;
  return safeJson<T>(encoded);
}

export function readCookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

function cookie(name: string, value: string, maxAge: number, request?: Request) {
  const secure = !request || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearMemoryCookie(name: string, request?: Request) {
  return cookie(name, "", 0, request);
}

export async function createSessionCookie(identity: LineIdentity, request?: Request) {
  return cookie(MEMORY_SESSION_COOKIE, await signPayload({ ...identity, expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS }), SESSION_LIFETIME_SECONDS, request);
}

export async function getMemorySession(request: Request): Promise<MemorySession | null> {
  const session = await readPayload<MemorySession>(readCookie(request, MEMORY_SESSION_COOKIE));
  return session && session.expiresAt > Math.floor(Date.now() / 1000) && session.subject ? session : null;
}

export async function requireMemorySession(request: Request): Promise<MemorySessionAccess> {
  const session = await getMemorySession(request);
  if (!session) return { error: "請先以 LINE 登入回憶膠囊", status: 401 };
  return { session };
}

export function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/memory-capsule";
}

export async function createOAuthStateCookie(inviteCode: string, returnTo: string, request?: Request) {
  const payload: OAuthState = {
    expiresAt: Math.floor(Date.now() / 1000) + STATE_LIFETIME_SECONDS,
    // OAuth state is sent to LINE. Keep only the one-way hash of the
    // invitation capability there; the original code never leaves this site.
    inviteCodeHash: inviteCode ? await sha256(inviteCode) : "",
    nonce: crypto.randomUUID(),
    returnTo: safeReturnTo(returnTo),
  };
  const state = await signPayload(payload);
  return { state, nonce: payload.nonce, header: cookie(MEMORY_STATE_COOKIE, state, STATE_LIFETIME_SECONDS, request) };
}

export async function consumeOAuthState(request: Request, receivedState: string | null) {
  const savedState = readCookie(request, MEMORY_STATE_COOKIE);
  if (!receivedState || !savedState || !sameValue(receivedState, savedState)) return null;
  const state = await readPayload<OAuthState>(savedState);
  return state && state.expiresAt > Math.floor(Date.now() / 1000) && state.nonce ? state : null;
}

export function lineLoginConfig() {
  return {
    channelId: required("MEMORY_LINE_LOGIN_CHANNEL_ID"),
    channelSecret: required("MEMORY_LINE_LOGIN_CHANNEL_SECRET"),
  };
}

export function callbackUrl(request: Request) {
  return publicUrl(request, "/api/memory/auth/callback");
}

export function publicOrigin(request: Request) {
  const configured = runtime().MEMORY_PUBLIC_ORIGIN?.trim();
  if (!configured) return new URL(request.url).origin;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new MemoryConfigurationError("MEMORY_PUBLIC_ORIGIN 必須是有效的 HTTPS 網址");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new MemoryConfigurationError("MEMORY_PUBLIC_ORIGIN 必須是純 HTTPS 網域來源");
  }
  return parsed.origin;
}

export function publicUrl(request: Request, path: string) {
  return new URL(path, publicOrigin(request)).toString();
}

export async function exchangeLineCode(request: Request, code: string, nonce: string): Promise<LineIdentity> {
  const { channelId, channelSecret } = lineLoginConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: callbackUrl(request), client_id: channelId, client_secret: channelSecret,
  });
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  if (!tokenResponse.ok) throw new Error("LINE 登入驗證失敗，請重新開啟邀請連結");
  const tokens = await tokenResponse.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error("LINE 未提供可驗證的登入身分");
  const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: channelId }),
  });
  if (!verifyResponse.ok) throw new Error("LINE 登入身分驗證失敗，請重新嘗試");
  const profile = await verifyResponse.json() as { sub?: string; name?: string; picture?: string; nonce?: string };
  if (!profile.sub || !profile.name || profile.nonce !== nonce) throw new Error("LINE 登入驗證資料不完整，請重新嘗試");
  return { subject: profile.sub, displayName: profile.name.slice(0, 100), avatarUrl: (profile.picture || "").slice(0, 1000) };
}

export async function activeMembershipFor(session: MemorySession, familyId?: string) {
  const conditions = [eq(memoryFamilyMembers.lineSubject, session.subject), eq(memoryFamilyMembers.isActive, true)];
  if (familyId) conditions.push(eq(memoryFamilyMembers.familyId, familyId));
  const rows = await getDb().select({
    id: memoryFamilyMembers.id, familyId: memoryFamilyMembers.familyId, role: memoryFamilyMembers.role,
    displayName: memoryFamilyMembers.displayName, avatarUrl: memoryFamilyMembers.avatarUrl,
    familyName: memoryFamilies.displayName, familySlug: memoryFamilies.slug, familyActive: memoryFamilies.isActive,
  }).from(memoryFamilyMembers).innerJoin(memoryFamilies, eq(memoryFamilies.id, memoryFamilyMembers.familyId)).where(and(...conditions));
  return rows.filter((row) => row.familyActive);
}

export async function requireFamilyRole(request: Request, familyId: string, allowedRoles: string[]): Promise<FamilyRoleAccess> {
  const signedIn = await requireMemorySession(request);
  if ("error" in signedIn) return { error: signedIn.error, status: signedIn.status };
  const [membership] = await activeMembershipFor(signedIn.session, familyId);
  if (!membership) return { error: "你不是此家族的有效成員", status: 403 } as const;
  if (!allowedRoles.includes(membership.role)) return { error: "此操作需要家族管理權限", status: 403 } as const;
  return { session: signedIn.session, membership } as const;
}

export function bootstrapSecretMatches(request: Request) {
  const configured = runtime().MEMORY_BOOTSTRAP_SECRET?.trim();
  const provided = request.headers.get("x-memory-bootstrap-secret")?.trim();
  return Boolean(configured && provided && sameValue(configured, provided));
}
