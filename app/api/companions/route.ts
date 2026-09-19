import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/init";
import { companionCards, companionRequests, events, rsvps } from "../../../db/schema";
import { clean, hashCode } from "../admin/auth";
import { json, preflight } from "../cors";
import { rateLimit } from "../rate-limit";

const intentLabels = {
  team: "想同隊",
  table: "想同桌",
  arrive: "想一起到場",
  after: "活動後繼續交流",
} as const;

type Intent = keyof typeof intentLabels;

function values(value: unknown, allowed: readonly string[], max: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.includes(item)).slice(0, max))];
}

function interests(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => clean(item, 24))
    .filter(Boolean)
    .slice(0, 5))];
}

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function containsContactDetail(value: string) {
  return /(?:\d[\s-]*){7,}|line\s*(?:id)?\s*[:：]?\s*\S+/i.test(value);
}

async function attendee(eventId: string, attendeeToken: string) {
  if (!eventId || !attendeeToken) return null;
  const db = getDb();
  const [match] = await db.select({ id: rsvps.id, name: rsvps.name })
    .from(rsvps)
    .where(and(
      eq(rsvps.eventId, eventId),
      eq(rsvps.response, "attending"),
      eq(rsvps.viewerTokenHash, await hashCode(attendeeToken)),
    )).limit(1);
  return match || null;
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 32);
    const eventId = clean(body.eventId, 80);
    const attendeeToken = clean(body.attendeeToken, 160);
    if (!eventId || !attendeeToken) return json(request, { error: "請先使用原本報名的裝置開啟活動" }, 403);

    const db = getDb();
    const [event] = await db.select({ id: events.id, status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event || event.status !== "active") return json(request, { error: "此活動目前無法使用同行卡" }, 400);
    const viewer = await attendee(eventId, attendeeToken);
    if (!viewer) return json(request, { error: "同行卡只開放給已報名參加的同場來賓" }, 403);

    if (action === "read") {
      const [ownCard] = await db.select().from(companionCards).where(eq(companionCards.rsvpId, viewer.id)).limit(1);
      const cards = await db.select().from(companionCards).where(and(
        eq(companionCards.eventId, eventId), eq(companionCards.isVisible, true), ne(companionCards.rsvpId, viewer.id),
      )).orderBy(desc(companionCards.updatedAt));
      const requests = await db.select().from(companionRequests).where(and(
        eq(companionRequests.eventId, eventId),
        or(eq(companionRequests.fromRsvpId, viewer.id), eq(companionRequests.toRsvpId, viewer.id)),
      ));
      return json(request, {
        viewer: { rsvpId: viewer.id },
        ownCard: ownCard ? { ...ownCard, interests: parseList(ownCard.interests), intents: parseList(ownCard.intents) } : null,
        cards: cards.map((card) => ({ rsvpId: card.rsvpId, displayName: card.displayName, intro: card.intro, interests: parseList(card.interests), intents: parseList(card.intents) })),
        requests: requests.map((item) => ({ id: item.id, fromRsvpId: item.fromRsvpId, toRsvpId: item.toRsvpId, kind: item.kind, status: item.status })),
        intentLabels,
      });
    }

    const limit = await rateLimit(request, "companions", 10, 15 * 60 * 1000);
    if (!limit.allowed) return json(request, { error: `操作太頻繁，請 ${limit.retryAfterSeconds} 秒後再試` }, 429);

    if (action === "save_card") {
      const displayName = clean(body.displayName, 30);
      const intro = clean(body.intro, 140);
      const selectedInterests = interests(body.interests);
      const selectedIntents = values(body.intents, Object.keys(intentLabels), 4) as Intent[];
      if (!displayName) return json(request, { error: "請留下同行卡顯示名稱" }, 400);
      if (!selectedIntents.length) return json(request, { error: "請選擇至少一種願意一起的方式" }, 400);
      if (containsContactDetail([displayName, intro, ...selectedInterests].join("\n"))) {
        return json(request, { error: "同行卡不提供聯絡方式；請保留給活動現場或原群組相認" }, 400);
      }
      const now = new Date().toISOString();
      await db.insert(companionCards).values({
        rsvpId: viewer.id, eventId, displayName, intro,
        interests: JSON.stringify(selectedInterests), intents: JSON.stringify(selectedIntents), isVisible: true,
        createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({ target: companionCards.rsvpId, set: {
        displayName, intro, interests: JSON.stringify(selectedInterests), intents: JSON.stringify(selectedIntents), isVisible: true, updatedAt: now,
      } });
      return json(request, { ok: true });
    }

    if (action === "hide_card") {
      await db.delete(companionCards).where(eq(companionCards.rsvpId, viewer.id));
      await db.delete(companionRequests).where(and(eq(companionRequests.eventId, eventId), or(
        eq(companionRequests.fromRsvpId, viewer.id), eq(companionRequests.toRsvpId, viewer.id),
      )));
      return json(request, { ok: true });
    }

    if (action === "send_request") {
      const toRsvpId = clean(body.toRsvpId, 80);
      const kind = clean(body.kind, 24) as Intent;
      if (!toRsvpId || toRsvpId === viewer.id || !(kind in intentLabels)) return json(request, { error: "這個同行邀請無效" }, 400);
      const [target] = await db.select({ rsvpId: companionCards.rsvpId, intents: companionCards.intents }).from(companionCards).where(and(
        eq(companionCards.eventId, eventId), eq(companionCards.rsvpId, toRsvpId), eq(companionCards.isVisible, true),
      )).limit(1);
      if (!target || !parseList(target.intents).includes(kind)) return json(request, { error: "對方目前沒有開放這種同行邀請" }, 400);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(companionRequests).where(and(
        eq(companionRequests.eventId, eventId), eq(companionRequests.fromRsvpId, viewer.id),
      ));
      if (Number(count) >= 5) return json(request, { error: "每場活動最多送出 5 個同行邀請" }, 429);
      const now = new Date().toISOString();
      try {
        await db.insert(companionRequests).values({ id: crypto.randomUUID(), eventId, fromRsvpId: viewer.id, toRsvpId, kind, status: "pending", createdAt: now, updatedAt: now });
      } catch (error) {
        if (error instanceof Error && /unique/i.test(error.message)) return json(request, { error: "這個同行邀請已送出過" }, 409);
        throw error;
      }
      return json(request, { ok: true });
    }

    if (action === "respond_request") {
      const requestId = clean(body.requestId, 80);
      const response = body.response === "accepted" ? "accepted" : body.response === "declined" ? "declined" : "";
      if (!requestId || !response) return json(request, { error: "請選擇接受或婉拒" }, 400);
      const [item] = await db.select().from(companionRequests).where(and(
        eq(companionRequests.id, requestId), eq(companionRequests.eventId, eventId), eq(companionRequests.toRsvpId, viewer.id),
      )).limit(1);
      if (!item || item.status !== "pending") return json(request, { error: "這個邀請已無法處理" }, 400);
      await db.update(companionRequests).set({ status: response, updatedAt: new Date().toISOString() }).where(eq(companionRequests.id, item.id));
      return json(request, { ok: true });
    }

    return json(request, { error: "不支援的同行卡操作" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "同行卡暫時無法使用" }, 500);
  }
}
