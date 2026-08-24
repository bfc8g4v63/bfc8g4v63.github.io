import { env } from "cloudflare:workers";

type LineBindings = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  REMINDER_SECRET?: string;
  FAIRY_PAIRING_CODE?: string;
};

export function lineConfig() {
  const values = env as unknown as LineBindings;
  return {
    token: values.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "",
    channelSecret: values.LINE_CHANNEL_SECRET?.trim() || "",
    reminderSecret: values.REMINDER_SECRET?.trim() || "",
    fairyPairingCode: values.FAIRY_PAIRING_CODE?.trim() || "",
  };
}

async function lineRequest(path: string, init: RequestInit) {
  const { token } = lineConfig();
  if (!token) throw new Error("LINE 機器人尚未設定 Channel access token");
  const response = await fetch(`https://api.line.me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE 傳送失敗（${response.status}）${detail ? `：${detail.slice(0, 180)}` : ""}`);
  }
  return response;
}

export async function pushText(to: string, text: string) {
  await pushMessages(to, [{ type: "text", text: text.slice(0, 5000) }]);
}

export async function pushMessages(to: string, messages: LineReplyMessage[]) {
  await lineRequest("/v2/bot/message/push", {
    method: "POST",
    body: JSON.stringify({ to, messages }),
  });
}

export async function replyText(replyToken: string, text: string) {
  await replyMessages(replyToken, [{ type: "text", text: text.slice(0, 5000) }]);
}

export type LineReplyMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string };

export async function replyMessages(replyToken: string, messages: LineReplyMessage[]) {
  await lineRequest("/v2/bot/message/reply", {
    method: "POST",
    body: JSON.stringify({ replyToken, messages }),
  });
}

const arrangementImageSlotMs = 60 * 60 * 1000;

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function arrangementImageSignature(eventId: string, page: number, slot: number) {
  const { channelSecret } = lineConfig();
  if (!channelSecret) return "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const body = new TextEncoder().encode(`arrangement-image:${eventId}:${page}:${slot}`);
  const signature = await crypto.subtle.sign("HMAC", key, body);
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function activityArrangementImageUrl(requestUrl: string, eventId: string, page: number) {
  const slot = Math.floor(Date.now() / arrangementImageSlotMs);
  const signature = await arrangementImageSignature(eventId, page, slot);
  const url = new URL("/api/line/arrangement-image", requestUrl);
  url.searchParams.set("e", eventId);
  url.searchParams.set("p", String(page));
  url.searchParams.set("t", String(slot));
  url.searchParams.set("h", signature);
  url.searchParams.set("v", crypto.randomUUID());
  return url.toString();
}

export async function verifyActivityArrangementImage(eventId: string, page: number, slot: number, signature: string) {
  const currentSlot = Math.floor(Date.now() / arrangementImageSlotMs);
  if (!signature || (slot !== currentSlot && slot !== currentSlot - 1)) return false;
  return timingSafeEqual(await arrangementImageSignature(eventId, page, slot), signature);
}

type RsvpSummaryItem = {
  name: string;
  partySize: number;
  diet: string;
  note: string;
};

type ActivityArrangementTable = {
  id: string;
  name: string;
  capacity: number;
  isReserve: boolean;
  note: string;
};

type ActivityArrangementAssignment = {
  tableId: string;
  rsvpId: string;
  people: number;
};

type ActivityArrangementRsvp = {
  id: string;
  name: string;
  partySize: number;
};

export function rsvpSummaryMessage(eventTitle: string, rsvps: RsvpSummaryItem[], includeDiet = false, includeNote = false) {
  const people = rsvps.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
  const header = `${eventTitle}｜報名人數\n共 ${people} 人・${rsvps.length} 筆報名`;
  if (!rsvps.length) return `${header}\n\n目前尚無參加者。`;

  const lines = [header];
  for (let index = 0; index < rsvps.length; index += 1) {
    const rsvp = rsvps[index];
    const details = [
      includeDiet ? `飲食：${rsvp.diet || "—"}` : "",
      includeNote ? `備註：${rsvp.note || "—"}` : "",
    ].filter(Boolean);
    const entry = [`${index + 1}. 姓名：${rsvp.name}`, `人數：${rsvp.partySize}`, ...details].join("\n");
    if (`${lines.join("\n\n")}\n\n${entry}`.length > 4800) {
      return `${lines.join("\n\n")}\n\n其餘 ${rsvps.length - index} 筆請至活動管理後台查看。`;
    }
    lines.push(entry);
  }
  return lines.join("\n\n");
}

export function activityArrangementMessage(
  eventTitle: string,
  tables: ActivityArrangementTable[],
  assignments: ActivityArrangementAssignment[],
  rsvps: ActivityArrangementRsvp[],
) {
  if (!tables.length) {
    return `「${eventTitle}」尚未建立活動安排，請由建立者到活動管理後台設定。`;
  }

  const attending = new Map(rsvps.map((rsvp) => [rsvp.id, rsvp]));
  const assignmentsByTable = new Map<string, ActivityArrangementAssignment[]>();
  const assignedByRsvp = new Map<string, number>();
  for (const assignment of assignments) {
    if (!attending.has(assignment.rsvpId)) continue;
    const tableAssignments = assignmentsByTable.get(assignment.tableId) || [];
    tableAssignments.push(assignment);
    assignmentsByTable.set(assignment.tableId, tableAssignments);
    assignedByRsvp.set(assignment.rsvpId, (assignedByRsvp.get(assignment.rsvpId) || 0) + assignment.people);
  }

  const totalPeople = rsvps.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
  const assignedPeople = [...assignedByRsvp.values()].reduce((sum, people) => sum + people, 0);
  const unassignedPeople = Math.max(0, totalPeople - assignedPeople);
  const lines = [`${eventTitle}｜活動安排`, `已安排 ${assignedPeople} 人・尚未安排 ${unassignedPeople} 人`];

  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index];
    const tableAssignments = assignmentsByTable.get(table.id) || [];
    const people = tableAssignments.reduce((sum, assignment) => sum + assignment.people, 0);
    const peopleList = tableAssignments.map((assignment) => {
      const rsvp = attending.get(assignment.rsvpId);
      return rsvp ? `${rsvp.name} ${assignment.people}人` : "";
    }).filter(Boolean).join("、") || "尚未安排";
    const tableLabel = `${table.name}${table.isReserve ? "（預備）" : ""}`;
    const details = [
      `${index + 1}. ${tableLabel}｜${people} / ${table.capacity} 人`,
      peopleList,
      table.note.trim() ? `位置／備註：${table.note.trim()}` : "",
    ].filter(Boolean).join("\n");
    if (`${lines.join("\n\n")}\n\n${details}`.length > 4800) {
      return `${lines.join("\n\n")}\n\n其餘安排請至活動管理後台查看。`;
    }
    lines.push(details);
  }
  return lines.join("\n\n");
}

export function activityShareMessage(event: {
  title: string;
  eventDate: string;
  startTime: string;
  location: string;
  description: string;
  shareUrl: string;
}) {
  const description = event.description.trim()
    ? `\n\n活動內容\n${event.description.trim()}`
    : "";
  return `〖${event.title}〗\n日期：${event.eventDate}\n時間：${event.startTime}\n餐廳／地點：${event.location}${description}\n\n活動連結\n${event.shareUrl}\n\n請掃描下方 QR Code，或點選連結查看與報名。`;
}

export async function getGroupName(groupId: string) {
  try {
    const response = await lineRequest(`/v2/bot/group/${encodeURIComponent(groupId)}/summary`, { method: "GET" });
    const data = await response.json() as { groupName?: string };
    return data.groupName?.trim() || "LINE 群組";
  } catch {
    return "LINE 群組";
  }
}

export async function verifyLineSignature(body: string, signature: string) {
  const { channelSecret } = lineConfig();
  if (!channelSecret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export function eventMessage(event: {
  id: string; title: string; eventDate: string; startTime: string;
  location: string; shareToken: string; attendingPeople?: number;
}, label = "活動提醒") {
  const people = event.attendingPeople === undefined ? "" : `\n目前 ${event.attendingPeople} 人參加`;
  const shareUrl = `https://bfc8g4v63.github.io/e/?s=${encodeURIComponent(event.shareToken)}`;
  return `【${label}】\n${event.title}\n日期：${event.eventDate}\n時間：${event.startTime}\n地點：${event.location}${people}\n查看／回覆：${shareUrl}`;
}
