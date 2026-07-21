import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy host renders the GitHub Pages handoff", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /好日子｜相聚/);
  assert.match(page, /正在前往好日子相聚/);
  assert.match(page, /https:\/\/bfc8g4v63\.github\.io/);
});

test("public activity response is summary-only", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(route, /name:\s*rsvps\.name/);
  assert.doesNotMatch(route, /diet:\s*rsvps\.diet/);
  assert.doesNotMatch(route, /contactPhone:\s*events\.contactPhone/);
  assert.match(route, /attendingPeople/);
  assert.doesNotMatch(client, /tel:/);
  assert.match(client, /聯絡電話、姓名與飲食備註僅活動管理者可查看/);
  assert.match(client, /\/admin\/event/);
});

test("LINE webhook verifies signatures and reminder workflow uses a secret", async () => {
  const [webhook, workflow] = await Promise.all([
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/line-reminders.yml", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /verifyLineSignature/);
  assert.match(webhook, /x-line-signature|signature/i);
  assert.match(workflow, /secrets\.REMINDER_SECRET/);
  assert.match(workflow, /Authorization: Bearer/);
});

test("creators can manage activities with an independent management link without exposing admin rights to guests", async () => {
  const [eventsRoute, auth, lineAdmin, client] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(eventsRoute, /managerToken = crypto\.randomUUID\(\)/);
  assert.match(eventsRoute, /managerTokenHash/);
  assert.match(eventsRoute, /#token=/);
  assert.match(auth, /managerToken/);
  assert.match(lineAdmin, /body\.managerToken/);
  assert.match(client, /managerAuthFromLink/);
  assert.match(client, /現在綁定 LINE 小幫手/);
  assert.match(client, /請保存建立者管理連結/);
  assert.match(client, /管理碼可用於遺失管理連結後找回活動/);
});

test("creator recovery and attendee-roster privacy stay gated", async () => {
  const [recovery, access, rsvp, client, eventClient] = await Promise.all([
    readFile(new URL("../app/api/creator-recovery/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/access/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(recovery, /action === "search"/);
  assert.match(recovery, /creatorName: match\.creatorName/);
  assert.match(recovery, /editCodeHash/);
  assert.match(access, /viewerTokenHash/);
  assert.match(access, /attendanceVisibility !== "count"/);
  assert.match(rsvp, /shareName/);
  assert.match(client, /找回我的活動/);
  assert.match(eventClient, /公開我的顯示名稱給同場參加者/);
});

test("cancelled activities remain recoverable because scheduled deletion is disabled", async () => {
  const [eventsRoute, workflow] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/line-reminders.yml", import.meta.url), "utf8"),
  ]);
  assert.match(eventsRoute, /cancelledAt/);
  assert.doesNotMatch(workflow, /maintenance\/purge/);
  assert.doesNotMatch(workflow, /MAINTENANCE_SECRET/);
});

test("only a verified creator can cancel or permanently delete an activity", async () => {
  const [eventsRoute, client] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(eventsRoute, /export async function DELETE/);
  assert.match(eventsRoute, /requireEventManager\(body\.id, body\.editCode, body\.managerToken\)/);
  assert.match(eventsRoute, /eq\(events\.status, "active"\)/);
  assert.match(client, /永久刪除/);
  assert.match(client, /活動已取消/);
});
