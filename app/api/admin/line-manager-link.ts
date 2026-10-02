import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { lineManagerTargets } from "../../../db/schema";
import { lineConfig } from "../line/lib";

const LINK_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function signature(eventId: string, targetId: string, expiresAt: number) {
  const { channelSecret } = lineConfig();
  if (!channelSecret) throw new Error("LINE 小幫手尚未設定驗證金鑰");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const payload = new TextEncoder().encode(`line-manager-link:${eventId}:${targetId}:${expiresAt}`);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, payload)));
}

/** A bearer link issued only to an already paired LINE management account. */
export async function lineManagerUrl(eventId: string, targetId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS;
  const proof = await signature(eventId, targetId, expiresAt);
  const token = `lm.${targetId}.${expiresAt}.${proof}`;
  return `https://bfc8g4v63.github.io/?manage=${encodeURIComponent(eventId)}#token=${encodeURIComponent(token)}`;
}

export async function verifyLineManagerToken(eventId: string, token: string) {
  const [kind, targetId, expiresText, proof, ...rest] = token.split(".");
  const expiresAt = Number(expiresText);
  if (kind !== "lm" || rest.length || !targetId || !proof || !Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = await signature(eventId, targetId, expiresAt).catch(() => "");
  if (!expected || !sameValue(proof, expected)) return false;
  const [target] = await getDb().select({ id: lineManagerTargets.id }).from(lineManagerTargets).where(and(
    eq(lineManagerTargets.id, targetId), eq(lineManagerTargets.eventId, eventId),
  )).limit(1);
  return Boolean(target);
}
