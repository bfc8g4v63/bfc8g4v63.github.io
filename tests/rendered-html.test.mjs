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
  assert.match(recovery, /editCode\.length < 4/);
  assert.match(recovery, /editCodeHash/);
  assert.match(access, /viewerTokenHash/);
  assert.match(access, /attendanceVisibility !== "count"/);
  assert.match(rsvp, /shareName/);
  assert.match(client, /找回我的活動/);
  assert.match(client, /recovery-unlock-form.*minlength="4"/);
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

test("visitor count has its own footer row", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /class="visitor-count" id="visitor-count"/);
  assert.match(page, /id="visitor-count-value"/);
  assert.match(page, /© 2026 NELSON HSIEH · v1\.2\.8/);
  assert.match(styles, /grid-template-areas:"visitor visitor visitor" "owner tagline top"/);
  assert.match(styles, /grid-template-areas:"visitor" "owner" "tagline" "top"/);
});

test("the service worker replaces cached management assets when a frontend release ships", async () => {
  const [page, eventPage, worker] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\/app\.js\?v=1\.2\.8/);
  assert.match(eventPage, /\/e\/app\.js\?v=1\.2\.8/);
  assert.match(worker, /good-days-github-v10/);
  assert.match(worker, /self\.skipWaiting\(\)/);
});

test("RSVP capacity is enforced atomically while existing attendees can reduce their reply", async () => {
  const [rsvp, schemaInit, eventClient] = await Promise.all([
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(schemaInit, /rsvps_capacity_before_insert/);
  assert.match(schemaInit, /rsvps_capacity_before_update/);
  assert.match(schemaInit, /RAISE\(ABORT, 'capacity_exceeded'\)/);
  assert.match(rsvp, /function errorMessages/);
  assert.match(rsvp, /message\.includes\("capacity_exceeded"\)/);
  assert.match(rsvp, /這個活動已額滿/);
  assert.match(eventClient, /目前已額滿；已報名者仍可更新內容/);
});

test("only a verified creator can cancel or permanently delete an activity", async () => {
  const [eventsRoute, client] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(eventsRoute, /export async function DELETE/);
  assert.match(eventsRoute, /requireEventManager\(body\.id, body\.editCode, body\.managerToken\)/);
  assert.match(eventsRoute, /eq\(events\.status, "active"\)/);
  assert.match(client, /function eventManagerPayload/);
  assert.match(client, /Object\.assign\(body, eventManagerPayload\(event\.id, managerAuth\)\)/);
  assert.match(client, /\.\.\.eventManagerPayload\(event\.id, managerAuth\), status/);
  assert.match(client, /JSON\.stringify\(eventManagerPayload\(event\.id, managerAuth\)\)/);
  assert.match(client, /永久刪除/);
  assert.match(client, /活動已取消/);
});

test("only the attendee's saved token can update or cancel an existing RSVP", async () => {
  const [rsvp, homepageClient, eventClient, guide] = await Promise.all([
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(rsvp, /suppliedAttendeeToken/);
  assert.match(rsvp, /viewerTokenHash/);
  assert.match(rsvp, /為保護您的回覆/);
  assert.match(homepageClient, /body\.attendeeToken = localStorage\.getItem/);
  assert.match(eventClient, /attendeeToken = data\.attendeeToken/);
  assert.match(guide, /取消自己的報名/);
  assert.match(guide, /取消整場活動/);
  assert.match(guide, /找回我的活動/);
  assert.match(guide, /建立者姓名/);
  assert.match(guide, /\?recover=1/);
  assert.doesNotMatch(guide, /回好日子首頁/);
  assert.match(homepageClient, /get\("recover"\) === "1"/);
});

test("home action buttons use the shared primary style while recovery remains available", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /class="header-actions"><button class="primary small" data-recover>找回我的活動<\/button><button class="primary small" data-create>＋ 建立活動/);
  assert.match(page, /<a class="primary" href="#activities">看看近期公開活動<\/a>/);
  assert.doesNotMatch(page, /建立第一個活動/);
  assert.doesNotMatch(page, /＋ 新活動/);
  assert.equal((page.match(/data-recover/g) || []).length, 1);
  assert.match(client, /get\("recover"\) === "1"/);
});
