import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { events } from "../../../db/schema";

export function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function hashCode(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const credentialPrefix = "pbkdf2";
// The hosted Worker runtime caps Web Crypto PBKDF2 at 100,000 iterations.
// Keep this deliberately slow while staying within the portable limit.
const credentialIterations = 100_000;

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/** New credentials use a random salt and a deliberately slow KDF. */
export async function hashCredential(value: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: credentialIterations }, key, 256);
  return `${credentialPrefix}$${credentialIterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

/** Legacy SHA-256 records remain valid and are upgraded on their next reset. */
export async function verifyCredential(value: string, stored: string) {
  const [prefix, iterationsText, saltText, digestText] = stored.split("$");
  if (prefix !== credentialPrefix || !iterationsText || !saltText || !digestText) return sameValue(await hashCode(value), stored);
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > credentialIterations) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltText), iterations }, key, 256);
  return sameValue(bytesToBase64(new Uint8Array(bits)), digestText);
}

export async function requireEventManager(eventId: unknown, editCode: unknown, managerToken?: unknown) {
  const id = clean(eventId, 80);
  const token = clean(managerToken, 160);
  const code = clean(editCode, 80);
  const credential = token || code;
  if (!id || !credential) return { error: "請輸入活動管理碼或開啟建立者管理連結", status: 400 } as const;
  const [event] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return { error: "找不到這個活動", status: 404 } as const;
  // Legacy passwordless activities stored their management-link token in
  // edit_code_hash. New activities keep that high-entropy token separate
  // from the creator's recoverable management code.
  const expectedHash = token
    ? (event.managerTokenHash || event.editCodeHash)
    : event.editCodeHash;
  if (!await verifyCredential(credential, expectedHash)) {
    return { error: "建立者驗證失敗", status: 403 } as const;
  }
  return { event } as const;
}
