import { env } from "cloudflare:workers";

type LineBindings = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  REMINDER_SECRET?: string;
};

export function lineConfig() {
  const values = env as unknown as LineBindings;
  return {
    token: values.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "",
    channelSecret: values.LINE_CHANNEL_SECRET?.trim() || "",
    reminderSecret: values.REMINDER_SECRET?.trim() || "",
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
  await lineRequest("/v2/bot/message/push", {
    method: "POST",
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
  });
}

export async function replyText(replyToken: string, text: string) {
  await lineRequest("/v2/bot/message/reply", {
    method: "POST",
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
  });
}

type RsvpSummaryItem = {
  name: string;
  partySize: number;
  diet: string;
  note: string;
};

export function rsvpSummaryMessage(eventTitle: string, rsvps: RsvpSummaryItem[]) {
  const people = rsvps.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
  const header = `${eventTitle}｜報名人數\n共 ${people} 人・${rsvps.length} 筆報名`;
  if (!rsvps.length) return `${header}\n\n目前尚無參加者。`;

  const lines = [header];
  for (let index = 0; index < rsvps.length; index += 1) {
    const rsvp = rsvps[index];
    const entry = `${index + 1}. 姓名：${rsvp.name}\n人數：${rsvp.partySize}\n飲食：${rsvp.diet || "—"}\n備註：${rsvp.note || "—"}`;
    if (`${lines.join("\n\n")}\n\n${entry}`.length > 4800) {
      return `${lines.join("\n\n")}\n\n其餘 ${rsvps.length - index} 筆請至活動管理後台查看。`;
    }
    lines.push(entry);
  }
  return lines.join("\n\n");
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
  location: string; attendingPeople?: number;
}, label = "活動提醒") {
  const people = event.attendingPeople === undefined ? "" : `\n目前 ${event.attendingPeople} 人參加`;
  return `【${label}】\n${event.title}\n日期：${event.eventDate}\n時間：${event.startTime}\n地點：${event.location}${people}\n查看／回覆：https://bfc8g4v63.github.io/?event=${encodeURIComponent(event.id)}`;
}
