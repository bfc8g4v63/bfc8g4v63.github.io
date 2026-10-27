import { env } from "cloudflare:workers";
import { eventShareUrl } from "../../../lib/event-share";

type LineBindings = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  REMINDER_SECRET?: string;
  SCHEDULER_SECRET?: string;
};

export function lineConfig() {
  const values = env as unknown as LineBindings;
  return {
    token: values.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "",
    channelSecret: values.LINE_CHANNEL_SECRET?.trim() || "",
    reminderSecret: values.REMINDER_SECRET?.trim() || "",
    schedulerSecret: values.SCHEDULER_SECRET?.trim() || "",
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

export async function pushMessages(to: string, messages: LineReplyMessage[], retryKey = "") {
  await lineRequest("/v2/bot/message/push", {
    method: "POST",
    headers: retryKey ? { "X-Line-Retry-Key": retryKey } : undefined,
    body: JSON.stringify({ to, messages }),
  });
}

export async function replyText(replyToken: string, text: string) {
  await replyMessages(replyToken, [{ type: "text", text: text.slice(0, 5000) }]);
}

export type LineReplyMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

export async function replyMessages(replyToken: string, messages: LineReplyMessage[]) {
  await lineRequest("/v2/bot/message/reply", {
    method: "POST",
    body: JSON.stringify({ replyToken, messages }),
  });
}

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
  // The slot is retained in the signed payload for URLs already sent to LINE.
  // LINE fetches image URLs again when a conversation is reopened, often days
  // later, so the signature itself must not expire with that cache refresh.
  const slot = Math.floor(Date.now() / (60 * 60 * 1000));
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
  if (!signature || !Number.isInteger(slot) || slot < 0) return false;
  return timingSafeEqual(await arrangementImageSignature(eventId, page, slot), signature);
}

type RsvpSummaryItem = {
  name: string;
  partySize: number;
  diet: string;
  note: string;
};

export const lineRosterPageSize = 8;

function rosterPageInfo(rsvps: RsvpSummaryItem[], requestedPage = 1) {
  const totalPages = Math.max(1, Math.ceil(rsvps.length / lineRosterPageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * lineRosterPageSize;
  return { page, totalPages, start, visible: rsvps.slice(start, start + lineRosterPageSize) };
}

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

export function rsvpSummaryMessage(eventTitle: string, rsvps: RsvpSummaryItem[], includeDiet = false, includeNote = false, requestedPage = 1) {
  const people = rsvps.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
  const { page, totalPages, start, visible } = rosterPageInfo(rsvps, requestedPage);
  const header = `${eventTitle}｜報名人數\n第 ${page} / ${totalPages} 頁・共 ${people} 人・${rsvps.length} 筆報名`;
  if (!rsvps.length) return `${header}\n\n目前尚無參加者。`;

  const lines = [header];
  for (let index = 0; index < visible.length; index += 1) {
    const rsvp = visible[index];
    const details = [
      includeDiet ? `飲食：${rsvp.diet || "—"}` : "",
      includeNote ? `備註：${rsvp.note || "—"}` : "",
    ].filter(Boolean);
    const entry = [`${start + index + 1}. 姓名：${rsvp.name}`, `人數：${rsvp.partySize}`, ...details].join("\n");
    if (`${lines.join("\n\n")}\n\n${entry}`.length > 4800) {
      return `${lines.join("\n\n")}\n\n本頁其餘 ${visible.length - index} 筆請至活動管理後台查看。`;
    }
    lines.push(entry);
  }
  return lines.join("\n\n");
}

/**
 * Keep the group-facing roster readable at a glance.  The text summary above
 * remains the fallback because LINE can reject a Flex payload, while this card
 * deliberately limits visible registrations so a long list never overflows a
 * bubble.
 */
export function rsvpSummaryCard(
  event: ActivityLinkEvent,
  rsvps: RsvpSummaryItem[],
  includeDiet = false,
  includeNote = false,
  requestedPage = 1,
): LineReplyMessage {
  const people = rsvps.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
  const { page, totalPages, start, visible } = rosterPageInfo(rsvps, requestedPage);
  const remaining = rsvps.length - visible.length;
  const detail = (value: string, maximum: number) => value.trim().slice(0, maximum) || "—";
  const shareUrl = eventShareUrl(event.shareCode, event.shareToken);
  return {
    type: "flex",
    altText: `【報名名單】${event.title}｜共 ${people} 人、${rsvps.length} 筆報名`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#F3EDFF", paddingAll: "16px",
        contents: [
          { type: "text", text: "報名名單 · 原神啟動", color: "#6A4A95", size: "sm", weight: "bold" },
          { type: "text", text: event.title.slice(0, 40), color: "#382052", size: "xl", weight: "bold", wrap: true, margin: "sm" },
          { type: "text", text: `${lineDateLabel(event.eventDate)}｜${event.startTime}｜第 ${page} / ${totalPages} 頁`, color: "#6A4A95", size: "sm", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          {
            type: "box", layout: "vertical", backgroundColor: "#F8F5FC", cornerRadius: "10px", paddingAll: "10px",
            contents: [{ type: "text", text: `第 ${page} / ${totalPages} 頁 · 共 ${people} 人 · ${rsvps.length} 筆報名`, color: "#4E386E", weight: "bold", wrap: true }],
          },
          ...(visible.length ? visible.flatMap((rsvp, index) => {
            const details = [
              includeDiet ? `飲食：${detail(rsvp.diet, 80)}` : "",
              includeNote ? `備註：${detail(rsvp.note, 100)}` : "",
            ].filter(Boolean).join(" · ");
            return [{
              type: "box", layout: "vertical", backgroundColor: "#FCFAFE", cornerRadius: "10px", paddingAll: "10px", margin: "sm",
              contents: [
                { type: "text", text: `${start + index + 1}. ${detail(rsvp.name, 60)}｜${rsvp.partySize} 人`, color: "#382052", weight: "bold", wrap: true },
                ...(details ? [{ type: "text", text: details, color: "#6A4A95", size: "sm", wrap: true, margin: "sm" }] : []),
              ],
            }];
          }) : [{ type: "text", text: "目前尚無參加者。", color: "#6A4A95", wrap: true, margin: "md" }]),
          ...(remaining > 0 ? [{ type: "text", text: `本頁外另有 ${remaining} 筆報名；輸入「原神啟動 ${event.eventDate.replaceAll("-", "")} ${page < totalPages ? page + 1 : page - 1}」切換頁面。`, color: "#6A4A95", size: "sm", wrap: true, margin: "md" }] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [{
          type: "button", style: "primary", color: "#68469A", height: "sm",
          action: { type: "uri", label: "查看活動與完整資訊", uri: shareUrl },
        }],
      },
    },
  };
}

type LineStatusTone = "success" | "notice" | "warning";

/** A compact, non-interactive response for normal command results in LINE. */
export function lineStatusCard(input: {
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  tone?: LineStatusTone;
}): LineReplyMessage {
  const tone = input.tone || "notice";
  const palette = {
    success: { background: "#EEF5EF", title: "#153F36", text: "#315C54", label: "#5B786D" },
    notice: { background: "#EAF4FF", title: "#173A5E", text: "#29485E", label: "#28649D" },
    warning: { background: "#FFF4D9", title: "#70531C", text: "#725D2A", label: "#A06B17" },
  }[tone];
  return {
    type: "flex",
    altText: `${input.title}｜${input.message}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: palette.background, paddingAll: "16px",
        contents: [
          { type: "text", text: (input.eyebrow || "活動狀態").slice(0, 60), color: palette.label, size: "sm", weight: "bold" },
          { type: "text", text: input.title.slice(0, 60), color: palette.title, size: "xl", weight: "bold", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: input.message.slice(0, 900), color: palette.text, wrap: true },
          ...(input.detail?.trim() ? [{ type: "text", text: input.detail.trim().slice(0, 900), color: palette.label, size: "sm", wrap: true, margin: "md" }] : []),
        ],
      },
    },
  };
}

export function managerRsvpCard(input: {
  eventTitle: string;
  change: string;
  name: string;
  partySize: number;
  attendingPeople: number;
  unassignedPeople: number;
  managerUrl?: string;
}): LineReplyMessage {
  const arrangement = input.unassignedPeople
    ? `尚有 ${input.unassignedPeople} 人未安排`
    : "所有參加者都已安排";
  return {
    type: "flex",
    altText: `【管理提醒】${input.eventTitle}｜${input.change}：${input.name}（${input.partySize} 人）`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#EEF5EF", paddingAll: "16px",
        contents: [
          { type: "text", text: "管理提醒", color: "#5B786D", size: "sm", weight: "bold" },
          { type: "text", text: input.eventTitle.slice(0, 40), color: "#153F36", size: "xl", weight: "bold", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: `${input.change}｜${input.name}（${input.partySize} 人）`, color: "#315C54", weight: "bold", wrap: true },
          { type: "text", text: `目前 ${input.attendingPeople} 人參加`, color: "#315C54", wrap: true },
          {
            type: "box", layout: "vertical", backgroundColor: input.unassignedPeople ? "#FFF0D4" : "#EDF6ED",
            cornerRadius: "10px", paddingAll: "10px", margin: "md",
            contents: [{ type: "text", text: arrangement, color: input.unassignedPeople ? "#8A611F" : "#176149", weight: "bold", wrap: true }],
          },
        ],
      },
      footer: input.managerUrl ? {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [{
          type: "button", style: "primary", color: "#2F6656", height: "sm",
          action: { type: "uri", label: "開啟管理", uri: input.managerUrl },
        }],
      } : undefined,
    },
  };
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
  address?: string;
  description: string;
  shareUrl: string;
}) {
  const description = event.description.trim()
    ? `\n\n活動內容\n${event.description.trim()}`
    : "";
  const address = event.address?.trim() ? `\n地址：${event.address.trim()}` : "";
  return `〖${event.title}〗\n日期：${lineDateLabel(event.eventDate)}\n時間：${event.startTime}\n地點：${event.location}${address}${description}\n\n活動連結\n${event.shareUrl}\n\n請掃描下方 QR Code，或點選連結查看與報名。`;
}

type ActivityAnnouncementEvent = Pick<ActivityLinkEvent, "title" | "eventDate" | "startTime" | "location" | "address" | "shareCode" | "shareToken">;

function announcementText(value: string, maximum: number) {
  const normalized = value.trim();
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(0, maximum - 1))}…` : normalized;
}

export function activityAnnouncementText(event: ActivityAnnouncementEvent, message: string, pretripInfo = "") {
  const shareUrl = eventShareUrl(event.shareCode, event.shareToken);
  return [
    `【${event.title}｜主辦公告】`,
    message.trim(),
    pretripInfo.trim() ? `行前資訊\n${pretripInfo.trim()}` : "",
    `日期：${lineDateLabel(event.eventDate)} ${event.startTime}\n地點：${event.location}${event.address?.trim() ? `\n地址：${event.address.trim()}` : ""}\n活動連結：${shareUrl}`,
  ].filter(Boolean).join("\n\n");
}

// This card is deliberately separate from the green response card: blue marks
// a read-only organiser update, while the single footer action opens the event.
export function activityAnnouncementCard(
  event: ActivityAnnouncementEvent,
  message: string,
  pretripInfo = "",
): LineReplyMessage {
  const shareUrl = eventShareUrl(event.shareCode, event.shareToken);
  const announcement = announcementText(message, 1_000);
  const pretrip = announcementText(pretripInfo, 1_000);
  const location = announcementText(event.location, 180);
  const address = announcementText(event.address || "", 180);
  return {
    type: "flex",
    altText: `【主辦公告】${event.title}｜${lineDateLabel(event.eventDate)} ${event.startTime}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#EAF4FF", paddingAll: "16px",
        contents: [
          { type: "text", text: "主辦公告 · 活動資訊更新", color: "#28649D", size: "sm", weight: "bold" },
          { type: "text", text: announcementText(event.title, 40), color: "#173A5E", size: "xl", weight: "bold", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          ...(announcement ? [
            { type: "text", text: "公告內容", color: "#5A7288", size: "sm", weight: "bold" },
            { type: "text", text: announcement, color: "#29485E", wrap: true, margin: "xs" },
            { type: "separator", margin: "md" },
          ] : []),
          { type: "text", text: `日期時間｜${lineDateLabel(event.eventDate)} ${event.startTime}`, color: "#29485E", wrap: true },
          { type: "text", text: `活動地點｜${location}`, color: "#29485E", wrap: true },
          ...(address ? [{ type: "text", text: `地址｜${address}`, color: "#5A7288", size: "sm", wrap: true }] : []),
          ...(pretrip ? [
            { type: "separator", margin: "md" },
            { type: "text", text: "行前資訊", color: "#5A7288", size: "sm", weight: "bold", margin: "md" },
            { type: "text", text: pretrip, color: "#29485E", size: "sm", wrap: true, margin: "xs" },
          ] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [{
          type: "button", style: "primary", color: "#2F6656", height: "sm",
          action: { type: "uri", label: "查看活動與最新安排", uri: shareUrl },
        }],
      },
    },
  };
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

type ActivityLinkEvent = {
  id: string; title: string; eventDate: string; startTime: string;
  location: string; address?: string; description?: string; shareToken: string; shareCode: string; attendingPeople?: number;
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export function lineDateLabel(eventDate: string) {
  const parsed = new Date(`${eventDate}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? eventDate : `${eventDate} (${weekdayLabels[parsed.getUTCDay()]})`;
}

function googleMapsUrl(address: string, location: string) {
  const query = address.trim() || location.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function activityBubble(event: ActivityLinkEvent, eyebrow: string) {
  const shareUrl = eventShareUrl(event.shareCode, event.shareToken);
  const mapUrl = googleMapsUrl(event.address || "", event.location);
  const people = event.attendingPeople === undefined ? "" : `目前 ${event.attendingPeople} 人參加`;
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box", layout: "vertical", backgroundColor: "#EEF5EF", paddingAll: "16px",
      contents: [
        { type: "text", text: eyebrow, color: "#5B786D", size: "sm", weight: "bold" },
        { type: "text", text: event.title.slice(0, 40), color: "#153F36", size: "xl", weight: "bold", wrap: true, margin: "sm" },
      ],
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
      contents: [
        { type: "text", text: `日期｜${lineDateLabel(event.eventDate)}`, color: "#315C54", wrap: true },
        { type: "text", text: `時間｜${event.startTime}`, color: "#315C54", wrap: true },
        { type: "text", text: `地點｜${event.location.slice(0, 180)}`, color: "#315C54", wrap: true },
        ...(event.address?.trim() ? [{ type: "text", text: `地址｜${event.address.trim().slice(0, 180)}`, color: "#315C54", wrap: true }] : []),
        ...(event.description?.trim() ? [{ type: "text", text: `行前資訊｜${event.description.trim().slice(0, 180)}`, color: "#315C54", wrap: true, margin: "md" }] : []),
        ...(people ? [{ type: "text", text: people, color: "#C65037", weight: "bold", margin: "md" }] : []),
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "12px", spacing: "sm",
      contents: [{
        type: "button", style: "primary", color: "#2F6656", height: "sm",
        action: { type: "uri", label: "查看／回覆", uri: shareUrl },
      }, ...(mapUrl ? [{
        type: "button", style: "secondary", height: "sm",
        action: { type: "uri", label: "在 Google 地圖開啟", uri: mapUrl },
      }] : [])],
    },
  };
}

type ManagerBindingEvent = Pick<ActivityLinkEvent, "title" | "eventDate" | "startTime">;

/** A compact confirmation card for a private manager-alert pairing. */
export function managerBindingCard(events: ManagerBindingEvent[]): LineReplyMessage {
  const visible = events.slice(0, 5);
  const remaining = events.length - visible.length;
  return {
    type: "flex",
    altText: `管理者私訊提醒已綁定 ${events.length} 場活動：${visible.map((event) => event.title).join("、")}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#EEF5EF", paddingAll: "16px",
        contents: [
          { type: "text", text: "管理者私訊提醒", color: "#5B786D", size: "sm", weight: "bold" },
          { type: "text", text: `已綁定 ${events.length} 場活動`, color: "#153F36", size: "xl", weight: "bold", margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "有人報名、取消或更動人數時，小幫手會在這個私訊通知你。", color: "#315C54", wrap: true },
          { type: "separator", margin: "md" },
          ...visible.map((event) => ({
            type: "box", layout: "vertical", backgroundColor: "#F5F8F4", cornerRadius: "10px", paddingAll: "10px", margin: "sm",
            contents: [
              { type: "text", text: event.title.slice(0, 40), color: "#153F36", weight: "bold", wrap: true },
              { type: "text", text: `${lineDateLabel(event.eventDate)}｜${event.startTime}`, color: "#5B786D", size: "sm", wrap: true, margin: "sm" },
            ],
          })),
          ...(remaining > 0 ? [{ type: "text", text: `另有 ${remaining} 場活動已綁定`, color: "#5B786D", size: "sm", margin: "sm" }] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [{ type: "text", text: "這只會啟用管理者私訊提醒；群組通知需在各 LINE 群組另行綁定。", color: "#5B786D", size: "xs", wrap: true }],
      },
    },
  };
}

export function eventCard(event: ActivityLinkEvent, label = "活動提醒"): LineReplyMessage {
  return {
    type: "flex",
    altText: `【${label}】${event.title}｜${lineDateLabel(event.eventDate)} ${event.startTime}`,
    contents: activityBubble(event, label),
  };
}

export function activityListCard(events: ActivityLinkEvent[]): LineReplyMessage {
  const visible = events.slice(0, 10);
  return {
    type: "flex",
    altText: `近期活動：${visible.map((event) => event.title).join("、")}`.slice(0, 400),
    contents: {
      type: "carousel",
      contents: visible.map((event) => activityBubble(event, "近期活動")),
    },
  };
}
