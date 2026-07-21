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

export async function requireEventManager(eventId: unknown, editCode: unknown, managerToken?: unknown) {
  const id = clean(eventId, 80);
  // managerToken is a high-entropy capability issued only once for a
  // passwordless unlisted activity. It intentionally remains separate from
  // the participant share token, which can safely be shared with guests.
  const credential = clean(managerToken, 160) || clean(editCode, 80);
  if (!id || !credential) return { error: "請輸入活動管理碼或開啟建立者管理連結", status: 400 } as const;
  const [event] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return { error: "找不到這個活動", status: 404 } as const;
  if (await hashCode(credential) !== event.editCodeHash) {
    return { error: "建立者驗證失敗", status: 403 } as const;
  }
  return { event } as const;
}
