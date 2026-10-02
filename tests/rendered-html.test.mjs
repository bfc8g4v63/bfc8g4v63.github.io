import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeLineCommand } from "../app/api/line/commands.ts";
import { arrangementNameKey } from "../lib/arrangement.ts";

test("legacy host renders the GitHub Pages handoff", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /好日子｜相聚｜免註冊活動\/聚會\/座位管理與安排/);
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

test("venues, addresses, map navigation and weekdays stay consistent across surfaces", async () => {
  const [schema, init, eventsRoute, accessRoute, homeClient, eventClient, lineLib, imageRoute] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/access/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/arrangement-image/route.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /address: text\("address"\)\.notNull\(\)\.default\(""\)/);
  assert.match(init, /ALTER TABLE events ADD COLUMN address/);
  assert.match(eventsRoute, /const address = clean\(body\.address, 200\)/);
  assert.match(accessRoute, /address: event\.address/);
  assert.match(homeClient, /"location", event\?\.location, 'required type="text"[\s\S]*data-1p-ignore/);
  assert.match(homeClient, /"eventAddress", event\?\.address/);
  assert.match(homeClient, /placeholder="例如：台北 101"/);
  assert.match(homeClient, /placeholder="例如：臺北市信義區西村里市府路45號"/);
  assert.match(homeClient, /"eventAddress", event\?\.address, 'type="text"[\s\S]*data-1p-ignore/);
  assert.match(homeClient, /www\.google\.com\/maps\/search/);
  assert.match(eventClient, /在 Google 地圖開啟/);
  assert.match(homeClient, /function formatShortDate/);
  assert.match(lineLib, /export function lineDateLabel/);
  assert.match(lineLib, /日期｜\$\{lineDateLabel\(event\.eventDate\)\}/);
  assert.match(imageRoute, /日期｜\{dateWithWeekday\(event\.eventDate\)\}/);
});

test("LINE webhook verifies signatures and reminder workflow uses a secret", async () => {
  const [webhook, ingress, workflow, reminders, scheduler, lineLib] = await Promise.all([
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/ingress/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/line-reminders.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scheduler-worker/src/index.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /verifyLineSignature/);
  assert.match(webhook, /x-goodday-line-relay/);
  assert.match(webhook, /isTrustedRelay/);
  assert.match(ingress, /verifyLineSignature/);
  assert.match(ingress, /getRequestExecutionContext/);
  assert.match(ingress, /api\/line\/webhook/);
  assert.match(webhook, /x-line-signature|signature/i);
  assert.doesNotMatch(webhook, /getRequestExecutionContext/);
  assert.doesNotMatch(webhook, /context\.waitUntil\(processing\)/);
  assert.match(webhook, /await processWebhookEvents\(payload\.events \|\| \[\], request\.url\)/);
  assert.match(webhook, /「管理綁定」只能在你與好日子小幫手的一對一私訊使用/);
  assert.match(webhook, /也不會推送到活動群組/);
  assert.match(workflow, /secrets\.REMINDER_SECRET/);
  assert.match(workflow, /Authorization: Bearer/);
  assert.match(lineLib, /SCHEDULER_SECRET/);
  assert.match(reminders, /matchesSecret/);
  assert.match(scheduler, /ctx\.waitUntil\(runDueReminders\(env\)\)/);
  assert.match(scheduler, /Reminder service returned/);
});

test("fairy station is retired without deleting its legacy notification data", async () => {
  const [fairyRoute, fairyReactionRoute, webhook, lineLib, schemaInit, page] = await Promise.all([
    readFile(new URL("../app/api/fairy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/fairy/reaction/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/fairy/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(fairyRoute, /仙女補給站已結束服務/);
  assert.match(fairyRoute, /}, 410\)/);
  assert.match(fairyReactionRoute, /仙女補給站已結束服務/);
  assert.match(fairyReactionRoute, /}, 410\)/);
  assert.doesNotMatch(fairyRoute, /pushText|fairyNotificationTargets|rateLimit/);
  assert.doesNotMatch(fairyReactionRoute, /pushText|fairyNotificationTargets|rateLimit/);
  assert.doesNotMatch(lineLib, /FAIRY_PAIRING_CODE|fairyPairingCode/);
  assert.doesNotMatch(webhook, /仙女綁定|fairyNotificationTargets|fairyPairingCode/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS fairy_notification_targets/);
  assert.match(page, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(page, /仙女已回歸仙界/);
  assert.match(page, /href="\/"/);
  assert.doesNotMatch(page, /fairy\.js|fairy\.css|name="coffee"|access-password/);
});

test("privacy controls protect group broadcasts and expire operational data", async () => {
  const [webhook, lineAdmin, reminders, rsvp, guide] = await Promise.all([
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /includeDiet/);
  assert.match(webhook, /includeNote/);
  assert.match(lineAdmin, /includeDiet/);
  assert.match(lineAdmin, /includeNote/);
  assert.match(reminders, /90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(rsvp, /export async function DELETE/);
  assert.match(guide, /3 個月後自動永久刪除/);
});

test("LINE roster broadcasts can disclose diet and notes independently", async () => {
  const [summary, schemaInit, client, guide] = await Promise.all([
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(summary, /includeDiet = false, includeNote = false/);
  assert.match(summary, /includeDiet \? `飲食：/);
  assert.match(summary, /includeNote \? `備註：/);
  assert.match(schemaInit, /include_diet/);
  assert.match(schemaInit, /include_note/);
  assert.match(client, /name="includeDiet"/);
  assert.match(client, /name="includeNote"/);
  assert.match(guide, /分別選擇是否包含/);
});

test("calendar reminders keep a small late-delivery tolerance while the two-hour reminder stays relative", async () => {
  const [reminders, lineLib, adminLine, workflow] = await Promise.all([
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/line-reminders.yml", import.meta.url), "utf8"),
  ]);
  assert.match(reminders, /T18:00:00\+08:00/);
  assert.match(reminders, /taipeiEvening\(eventDate, 7\)/);
  assert.match(reminders, /taipeiEvening\(eventDate, 1\)/);
  assert.match(reminders, /const allowedLateMinutes = 20/);
  assert.match(reminders, /key: "seven_days"[\s\S]*?window: allowedLateMinutes/);
  assert.match(reminders, /key: "one_day"[\s\S]*?window: allowedLateMinutes/);
  assert.match(reminders, /key: "two_hours"[\s\S]*?window: allowedLateMinutes/);
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(reminders, /eventTime - 120 \* 60 \* 1000/);
  assert.match(adminLine, /seven_days: "活動前 7 天提醒（測試）"/);
  assert.match(adminLine, /one_day: "活動前 1 天提醒（測試）"/);
  assert.match(adminLine, /two_hours: "活動前 2 小時提醒（測試）"/);
  assert.match(adminLine, /活動前 2 小時提醒（測試）/);
  assert.match(await readFile(new URL("../docs/app.js", import.meta.url), "utf8"), /id="line-seven-day-test"/);
  assert.match(await readFile(new URL("../docs/app.js", import.meta.url), "utf8"), /id="line-one-day-test"/);
  assert.match(await readFile(new URL("../docs/app.js", import.meta.url), "utf8"), /id="line-two-hour-test"/);
  assert.match(reminders, /shareCode: events\.shareCode/);
  assert.match(lineLib, /shareCode: string/);
  assert.match(lineLib, /eventShareUrl\(event\.shareCode, event\.shareToken\)/);
  assert.doesNotMatch(lineLib, /github\.io\/\?event=/);
  assert.match(adminLine, /eventCard\(\{[\s\S]*?\.\.\.access\.event/);
  assert.match(lineLib, /type: "flex"/);
  assert.match(lineLib, /label: "查看／回覆"/);
});

test("activity arrangements keep allocation private and validate split family assignments", async () => {
  const [admin, rsvp, schema, schemaInit, client, styles, migration] = await Promise.all([
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_neat_harpoon.sql", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const mealTables/);
  assert.match(schema, /export const mealAssignments/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS meal_tables/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS meal_assignments/);
  assert.match(migration, /CREATE TABLE `meal_tables`/);
  assert.match(migration, /CREATE TABLE `meal_assignments`/);
  assert.match(admin, /action === "save_meal_seating"/);
  assert.match(admin, /totalForRsvp > \(attending\.get\(rsvpId\) \|\| 0\)/);
  assert.match(admin, /totalForTable > table\.capacity/);
  assert.match(admin, /totalTableCapacity > eventCapacity/);
  assert.match(admin, /mealSeating:/);
  assert.match(rsvp, /db\.delete\(mealAssignments\)/);
  assert.match(client, /function initMealSeating/);
  assert.match(client, /活動總人數/);
  assert.match(client, /安排區總容量不可超過此人數/);
  assert.match(client, /已達活動總人數/);
  assert.match(client, /swapAllocations/);
  assert.match(client, /<h3>活動安排<\/h3>/);
  assert.match(client, /尚有 \$\{unassignedPeople\} 人未安排/);
  assert.match(client, /id="jump-to-arrangements"/);
  assert.match(client, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(client, /桌遊、滑雪等活動/);
  assert.match(client, /同一筆報名超過空位時/);
  assert.match(client, /function enableTouchPartyDrag/);
  assert.match(client, /touchDropTableAt\(pointerEvent\.clientX, pointerEvent\.clientY\)/);
  assert.match(client, /enableTouchPartyDrag\(card, card\.dataset\.seatSelect\)/);
  assert.match(styles, /\.meal-table-grid/);
  assert.match(styles, /\.meal-table-card\.touch-drop-target/);
  assert.match(styles, /\.arrangement-status\.pending/);
  assert.doesNotMatch(await readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"), /mealTables/);
});

test("activity arrangements require unique names within an activity", async () => {
  const [admin, schema, schemaInit, client, migration] = await Promise.all([
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_ambiguous_trauma.sql", import.meta.url), "utf8"),
  ]);
  assert.equal(arrangementNameKey("第 5 桌"), arrangementNameKey("第5桌"));
  assert.equal(arrangementNameKey("紅　隊"), arrangementNameKey("紅隊"));
  assert.match(admin, /arrangementNameKey/);
  assert.match(admin, /安排區名稱「\$\{name\}」/);
  assert.match(schema, /nameKey: text\("name_key"\)/);
  assert.match(schema, /meal_tables_event_name_key_unique/);
  assert.match(schemaInit, /meal_tables_event_name_key_unique/);
  assert.match(schemaInit, /legacy-\$\{table\.id\}/);
  assert.match(client, /function tableNameErrors/);
  assert.match(client, /與「\$\{name\}」名稱重複/);
  assert.match(client, /新安排區 \$\{index\}/);
  assert.match(migration, /runtime schema initializer/);
  assert.doesNotMatch(migration, /ALTER TABLE/);
});

test("paid activities calculate fixed per-person fees without exposing payment records publicly", async () => {
  const [eventsRoute, accessRoute, rsvpRoute, adminRoute, schema, schemaInit, migration, homeClient, eventClient] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/access/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_brown_tyger_tiger.sql", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /feePerPerson: integer\("fee_per_person"\)/);
  assert.match(schema, /paymentStatus: text\("payment_status"\)/);
  assert.match(schemaInit, /fee_per_person INTEGER NOT NULL DEFAULT 0/);
  assert.match(schemaInit, /payment_status TEXT NOT NULL DEFAULT 'not_applicable'/);
  assert.match(migration, /ADD `fee_per_person`/);
  assert.match(migration, /ADD `payment_status`/);
  assert.match(eventsRoute, /MAX_FEE_PER_PERSON/);
  assert.match(eventsRoute, /feePerPerson: fee/);
  assert.match(accessRoute, /feePerPerson: event\.feePerPerson/);
  assert.match(rsvpRoute, /paymentStatus = response !== "attending"/);
  assert.match(adminRoute, /action === "update_payment"/);
  assert.match(adminRoute, /paidAmount/);
  assert.match(homeClient, /name="feeMode" value="paid"/);
  assert.match(homeClient, /收款管理/);
  assert.match(homeClient, /data-rsvp-payment/);
  assert.doesNotMatch(homeClient, /下載 CSV 名單|exportRsvps|text\/csv/);
  assert.match(eventClient, /本戶應收：/);
  assert.doesNotMatch(accessRoute, /paymentStatus/);
});

test("LINE roster command accepts both 啟動 and 啓動", () => {
  assert.equal(normalizeLineCommand("原神啟動"), "原神啟動");
  assert.equal(normalizeLineCommand(" 原神　啓動 "), "原神啟動");
  assert.equal(normalizeLineCommand("「安排。」"), "安排");
  assert.equal(normalizeLineCommand("安\u200B排！"), "安排");
  assert.equal(normalizeLineCommand("安排!測試"), "安排測試");
});

test("bound LINE groups can show a privacy-safe current activity arrangement image", async () => {
  const [webhook, lineLib, imageRoute, client, guide] = await Promise.all([
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/arrangement-image/route.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.equal(normalizeLineCommand(" 安 排 "), "安排");
  assert.match(webhook, /command\.startsWith\("安排"\)/);
  assert.match(webhook, /mealTables/);
  assert.match(webhook, /activityArrangementImageUrl/);
  assert.match(webhook, /await replyMessages\(event\.replyToken, messages\)/);
  assert.doesNotMatch(webhook, /pushArrangement/);
  assert.match(lineLib, /X-Line-Retry-Key/);
  assert.match(webhook, /lineCommandLogs/);
  assert.match(webhook, /webhookEventId/);
  assert.match(webhook, /lineWebhookDeliveries/);
  assert.match(webhook, /claimWebhookEvent/);
  assert.match(webhook, /Date\.now\(\) - 15_000/);
  assert.match(webhook, /stale in-progress claim must not suppress/);
  assert.match(webhook, /fallback_sent/);
  assert.match(lineLib, /export async function activityArrangementImageUrl/);
  assert.match(lineLib, /export async function pushMessages/);
  assert.match(lineLib, /verifyActivityArrangementImage/);
  assert.match(lineLib, /LINE fetches image URLs again when a conversation is reopened/);
  assert.doesNotMatch(lineLib, /slot !== currentSlot/);
  assert.match(lineLib, /crypto\.randomUUID\(\)/);
  assert.match(imageRoute, /new ImageResponse/);
  assert.match(imageRoute, /Content-Type|Cache-Control/);
  assert.match(imageRoute, /NotoSansTC-Regular\.otf/);
  assert.match(imageRoute, /PAGE_SIZE = 6/);
  assert.match(imageRoute, /CARD_BASE_HEIGHT = 270/);
  assert.match(imageRoute, /CARD_ENTRY_HEIGHT = 52/);
  assert.match(imageRoute, /card\.table\.note \? CARD_TABLE_NOTE_HEIGHT/);
  assert.match(imageRoute, /boxSizing: "border-box"/);
  assert.match(imageRoute, /\+ 80/);
  assert.doesNotMatch(imageRoute, /rsvps\.diet|rsvps\.note/);
  assert.match(client, /輸入「安排」會顯示安排圖卡/);
  assert.match(client, /小幫手最近紀錄/);
  assert.match(client, /copy-binding-code/);
  assert.match(client, /綁定指令已複製/);
  assert.match(guide, /<dt>安排<\/dt>/);
  assert.match(guide, /圖卡/);
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
  assert.match(auth, /credentialIterations = 100_000/);
  assert.match(auth, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.doesNotMatch(auth, /210_000/);
  assert.match(lineAdmin, /body\.managerToken/);
  assert.match(client, /managerAuthFromLink/);
  assert.match(client, /設定 LINE 小幫手/);
  assert.match(client, /請保存管理連結/);
  assert.match(client, /管理我的活動/);
  assert.match(client, /type="text" name="editCode" data-secret[\s\S]*autocomplete="off"/);
  assert.doesNotMatch(client, /new-password|type="password"/);
  assert.match(client, /\["copy", "cut", "dragstart"\]/);
  assert.match(client, /儲存在這台裝置/);
  assert.match(client, /good-days-manager-return-links/);
  assert.match(client, /這台裝置已保存的管理入口/);
});

test("LINE manager alerts pair an account with an event instead of trusting a creator name", async () => {
  const [schema, schemaInit, webhook, lineAdmin, recovery, rsvp, lineLib, lineManagerLink, auth, adminEvent, client, guide] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/creator-recovery/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line-manager-link.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /lineManagerBindCodes/);
  assert.match(schema, /lineManagerBatchBindCodes/);
  assert.match(schema, /lineManagerTargets/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS line_manager_bind_codes/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS line_manager_batch_bind_codes/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS line_manager_targets/);
  assert.match(lineAdmin, /create_manager_binding_code/);
  assert.match(lineAdmin, /clear_manager_targets/);
  assert.match(webhook, /管理綁定/);
  assert.match(webhook, /pairManagerAlert/);
  assert.match(webhook, /lineManagerBatchBindCodes/);
  assert.match(webhook, /sourceType === "user"/);
  assert.match(rsvp, /notifyPairedManagers/);
  assert.match(rsvp, /getRequestExecutionContext/);
  assert.match(rsvp, /lineManagerUrl\(input\.eventId, target\.id\)/);
  assert.match(lineLib, /managerRsvpMessage/);
  assert.match(lineLib, /管理活動：\$\{input\.managerUrl\}/);
  assert.match(lineManagerLink, /line-manager-link:/);
  assert.match(lineManagerLink, /lineManagerTargets\.eventId/);
  assert.match(auth, /verifyLineManagerToken/);
  assert.match(adminEvent, /managerTargetCount/);
  assert.match(adminEvent, /管理者代為新增報名/);
  assert.match(adminEvent, /queueManagerNotification/);
  assert.match(client, /管理者私訊提醒/);
  assert.match(client, /manager-alert-code/);
  assert.match(client, /批次啟用管理者私訊提醒/);
  assert.match(client, /create_manager_batch_binding_code/);
  assert.match(recovery, /create_manager_batch_binding_code/);
  assert.match(recovery, /lineManagerBatchBindCodes/);
  assert.match(recovery, /if \(selected\.length === 1\)[\s\S]*lineManagerBindCodes/);
  assert.match(recovery, /const \[\[single\], \[batch\]\] = await Promise\.all/);
  assert.match(guide, /管理綁定 925843/);
  assert.match(guide, /管理活動連結/);
});

test("an activity invitation provides a verified route to the full management dashboard", async () => {
  const [homeClient, eventClient] = await Promise.all([
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(eventClient, /管理這場活動/);
  assert.match(eventClient, /開啟完整管理後台/);
  assert.match(eventClient, /good-days-manager-code:/);
  assert.match(eventClient, /destination\.searchParams\.set\("manage", currentEvent\.id\)/);
  assert.doesNotMatch(eventClient, /function renderManager/);
  assert.match(homeClient, /sessionStorage\.getItem\(`good-days-manager-code:\$\{eventId\}`\)/);
  assert.match(homeClient, /return editCode \? \{ type: "code", value: editCode, eventId \} : null/);
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
  assert.match(recovery, /orderBy\(desc\(events\.createdAt\)\)/);
  assert.match(recovery, /capacity: events\.capacity/);
  assert.match(recovery, /attendingPeople/);
  assert.match(recovery, /remainingCapacity/);
  assert.match(recovery, /lineGroupName/);
  assert.match(recovery, /managerTargetCount/);
  assert.match(recovery, /unassignedPeople/);
  assert.match(access, /viewerTokenHash/);
  assert.match(access, /attendanceVisibility !== "count"/);
  assert.match(rsvp, /shareName/);
  assert.match(client, /管理我的活動/);
  assert.match(client, /剩餘 \$\{remaining\} 名額/);
  assert.match(client, /已額滿/);
  assert.match(client, /function recoveryOperationalStatus/);
  assert.match(client, /批次啟用管理者私訊提醒/);
  assert.match(client, /這只會設定「有人報名時私訊通知我」/);
  assert.match(client, /群組內公開通知/);
  assert.match(client, /recovery-unlock-form.*minlength="4"/);
  assert.doesNotMatch(client, /recovery-search-form/);
  assert.match(eventClient, /公開我的顯示名稱給同場參加者/);
});

test("ended and cancelled activities are retained only for the recovery window", async () => {
  const [eventsRoute, reminders] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(eventsRoute, /cancelledAt/);
  assert.match(reminders, /status = 'cancelled'/);
  assert.match(reminders, /event_date < \$\{expiry\}/);
});

test("visitor count has its own footer row", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /class="visitor-count" id="visitor-count"/);
  assert.match(page, /id="visitor-count-value"/);
  assert.match(page, /© 2026 NELSON HSIEH · v1\.2\.85/);
  assert.doesNotMatch(page, /footer-social-link/);
  assert.doesNotMatch(page, /footer-portfolio-link/);
  assert.match(styles, /grid-template-areas:"visitor visitor visitor" "owner tagline top"/);
  assert.match(styles, /grid-template-areas:"visitor" "owner" "tagline" "top"/);
});

test("visitor count retains its baseline and counts each anonymized IP once per rolling day", async () => {
  const [route, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/site-stats/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_chubby_nemesis.sql", import.meta.url), "utf8"),
  ]);
  assert.match(route, /24 \* 60 \* 60 \* 1000/);
  assert.match(route, /HMAC/);
  assert.match(route, /INSERT OR IGNORE INTO site_visit_windows/);
  assert.match(route, /DELETE FROM site_visit_windows WHERE expires_at <= \?/);
  assert.match(schema, /siteVisitWindows/);
  assert.doesNotMatch(schema, /ip_address|client_ip/i);
  assert.match(migration, /site_visit_windows_increment_homepage_views/);
  assert.match(migration, /views` = `views` \+ 1/);
});

test("the service worker replaces cached management assets when a frontend release ships", async () => {
  const [page, eventPage, worker] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\/app\.js\?v=1\.2\.85/);
  assert.match(eventPage, /\/e\/app\.js\?v=1\.2\.85/);
  assert.match(worker, /good-days-github-v85/);
  assert.match(worker, /self\.skipWaiting\(\)/);
});

test("activity date and time controls support direct editing, desktop wheel and touch adjustment", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /class="time-wheel" data-time-wheel=/);
  assert.match(client, /type="tel" class="time-wheel-input" data-time-input="\$\{name\}" inputmode="numeric"/);
  assert.match(client, /placeholder="--" value="\$\{esc\(selected\[name\]\)\}"/);
  assert.match(client, /class="time-wheel-unit"/);
  assert.match(client, /function updateEditableTimeInput/);
  assert.match(client, /number >= 0 && number <= 23/);
  assert.match(client, /number === 0 \? "am" : "pm"/);
  assert.match(client, /convertedHour = number === 0 \? 12 : number - 12/);
  assert.match(client, /輸入 13 到 23 會自動轉為下午/);
  assert.match(client, /function enableTimeWheels/);
  assert.match(client, /function enableDateWheels/);
  assert.match(client, /data-date-wheel/);
  assert.match(client, /function dateWheelSegment/);
  assert.match(client, /function updateDateWheel/);
  assert.match(client, /segment === "month"/);
  assert.match(client, /segment === "day"/);
  assert.match(client, /addEventListener\("wheel"/);
  assert.match(client, /addEventListener\("touchstart"/);
  assert.match(client, /addEventListener\("touchend"/);
  assert.doesNotMatch(client, /<select name="time/);
  assert.match(client, /class="time-picker-required">必填/);
  assert.match(styles, /\.time-picker \{[^}]*grid-template-rows:auto auto 68px/);
  assert.match(styles, /\.time-wheel \{[^}]*height:68px/);
  assert.match(styles, /input\[type="date"\]\) > input \{ min-height:68px; height:68px/);
  assert.match(styles, /grid-template-columns:minmax\(128px,1\.25fr\) minmax\(90px,\.85fr\) minmax\(90px,\.85fr\)/);
  assert.match(styles, /\.form-row:has\(\.time-picker\) \{ grid-template-columns:minmax\(230px,1fr\) minmax\(340px,1\.25fr\)/);
  assert.match(styles, /\.time-wheel-input \{[^}]*height:100%/);
  assert.match(styles, /\.time-wheel-input \{[^}]*padding:0 1\.25em 0 0/);
  assert.match(styles, /\.time-wheel-input-wrap \{[^}]*position:relative/);
  assert.match(client, /editable\.addEventListener\("focus", \(\) => editable\.select\(\)\)/);
  assert.match(client, /const normalized = name === "minute" \? String\(number\)\.padStart\(2, "0"\)/);
  assert.match(styles, /\.time-wheel-unit \{[^}]*position:absolute/);
  assert.doesNotMatch(styles, /\.time-wheel-value \{[^}]*text-overflow:ellipsis/);
});

test("a full activity keeps its RSVP button and explanation in separate rows", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /class="rsvp-full-state"/);
  assert.match(styles, /\.rsvp-full-state \{[^}]*gap:18px/);
});

test("modal backdrops stay open until an explicit close action", async () => {
  const [homeClient, eventClient] = await Promise.all([
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(homeClient, /if \(close\) return requestModalClose\(\);/);
  assert.match(homeClient, /keyEvent\.key !== "Escape"/);
  assert.doesNotMatch(homeClient, /clickEvent\.target\.classList\.contains\("modal-backdrop"\)/);
  assert.match(eventClient, /event\.target\.closest\("\[data-close\]"\)/);
  assert.match(eventClient, /event\.key === "Escape"/);
  assert.doesNotMatch(eventClient, /event\.target\.classList\.contains\("modal-backdrop"\)/);
});

test("public pages provide crawl discovery while individual event pages remain private", async () => {
  const [page, guide, eventPage, robots, sitemap] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../docs/sitemap.xml", import.meta.url), "utf8"),
  ]);
  assert.match(page, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(page, /rel="canonical" href="https:\/\/bfc8g4v63\.github\.io\/"/);
  assert.match(page, /property="og:site_name" content="好日子"/);
  assert.match(page, /"@type":"WebSite","name":"好日子"/);
  assert.match(page, /"alternateName":\["相聚","好日子活動"\]/);
  assert.match(page, /name="description" content="讓家人朋友輕鬆相聚的活動管理系統"/);
  assert.match(page, /<title>好日子｜相聚活動管理、聚會安排與 LINE 提醒<\/title>/);
  assert.match(page, /好日子，<br><em>讓相聚簡單成行。<\/em>/);
  assert.match(page, /WebApplication/);
  assert.match(guide, /rel="canonical" href="https:\/\/bfc8g4v63\.github\.io\/line-bot-guide\.html"/);
  assert.match(eventPage, /name="robots" content="noindex,nofollow"/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/bfc8g4v63\.github\.io\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/bfc8g4v63\.github\.io\/<\/loc>/);
  assert.match(sitemap, /line-bot-guide\.html/);
  assert.doesNotMatch(sitemap, /\/e\//);
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
  assert.match(guide, /更新或取消自己的回覆/);
  assert.match(guide, /取消整場活動/);
  assert.match(guide, /管理我的活動/);
  assert.match(guide, /管理者名稱/);
  assert.match(guide, /\?activities=1/);
  assert.doesNotMatch(guide, /回好日子首頁/);
  assert.match(homepageClient, /params\.get\("activities"\) === "1"/);
});

test("creators can add several relatives from the recovered management dashboard without sharing a browser token", async () => {
  const [adminRoute, rsvpRoute, homepageClient, eventClient] = await Promise.all([
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminRoute, /action === "create_rsvp"/);
  assert.match(adminRoute, /viewerTokenHash: await hashCode\(crypto\.randomUUID\(\)\)/);
  assert.match(adminRoute, /rateLimit\(request, "admin-event", 60/);
  assert.match(homepageClient, /id="create-rsvp"/);
  assert.match(homepageClient, /openManagedRsvpEditor\(null, event, managerAuth, returnToAdmin\)/);
  assert.match(homepageClient, /action: isNew \? "create_rsvp" : "update_rsvp"/);
  assert.match(homepageClient, /function rsvpStorageKey\(shareToken, name\)/);
  assert.match(eventClient, /function attendeeTokenFor\(name\)/);
  assert.match(eventClient, /body\.attendeeToken = attendeeTokenFor\(name\)/);
  assert.match(eventClient, /good-days-rsvp:\$\{shareToken\}:active/);
  assert.match(rsvpRoute, /name: existingByToken\?\.name \|\| name/);
});

test("home action buttons use the shared primary style while recovery remains available", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<nav class="project-links" aria-label="其他作品">/);
  assert.match(page, /class="project-card" aria-hidden="true">/);
  assert.match(page, /class="project-card-thumb project-card-thumb-social"/);
  assert.match(page, /class="project-card-thumb project-card-thumb-portfolio"/);
  assert.match(page, /個人作品集/);
  assert.match(page, /互動小測驗/);
  assert.match(page, /找回剛剛好的社交節奏/);
  assert.match(page, /Nelson Hsieh 的數位作品/);
  assert.match(page, /class="header-actions"><button class="primary small" data-manage-activities>管理我的活動<\/button><button class="primary small" data-create>＋ 建立活動/);
  assert.match(page, /<a class="primary" href="#activities">看看近期公開活動<\/a>/);
  assert.doesNotMatch(page, /建立第一個活動/);
  assert.doesNotMatch(page, /＋ 新活動/);
  assert.equal((page.match(/data-manage-activities/g) || []).length, 1);
  assert.match(client, /params\.get\("activities"\) === "1"/);
});

test("mobile visitors can open the other projects from compact cards", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /class="mobile-project-links" aria-label="其他作品"/);
  assert.match(page, /https:\/\/nelson-portfolio\.pages\.dev\//);
  assert.match(page, /https:\/\/social-battery-bureau\.vercel\.app\/#top/);
  assert.match(page, /個人作品集[\s\S]*?Nelson Portfolio/);
  assert.match(page, /互動小測驗[\s\S]*?社交電量局/);
  assert.match(page, /target="_blank" rel="noopener"/);
  assert.match(styles, /@media \(max-width:900px\) \{ \.mobile-project-links/);
  assert.match(styles, /\.mobile-project-card/);
});

test("verified creators can cancel or permanently delete a single RSVP", async () => {
  const [adminRoute, client] = await Promise.all([
    readFile(new URL("../app/api/admin/event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminRoute, /requireEventManager\(body\.eventId, body\.editCode, body\.managerToken\)/);
  assert.match(adminRoute, /action === "cancel_rsvp"/);
  assert.match(adminRoute, /action === "delete_rsvp"/);
  assert.match(adminRoute, /action === "update_rsvp"/);
  assert.match(adminRoute, /eq\(rsvps\.name, name\)/);
  assert.match(adminRoute, /name,/);
  assert.match(adminRoute, /seatingChanged/);
  assert.match(adminRoute, /db\.delete\(mealAssignments\)/);
  assert.match(adminRoute, /eq\(rsvps\.eventId, access\.event\.id\)/);
  assert.match(client, /data-rsvp-edit/);
  assert.match(client, /function openManagedRsvpEditor/);
  assert.match(client, /field\("姓名", "name", initial\.name/);
  assert.match(client, /action: isNew \? "create_rsvp" : "update_rsvp"/);
  assert.match(client, /修改回覆/);
  assert.match(client, /data-rsvp-cancel/);
  assert.match(client, /data-rsvp-delete/);
  assert.match(client, /取消參加/);
  assert.match(client, /永久刪除/);
});

test("attendee tokens keep working after a creator corrects the displayed name", async () => {
  const rsvp = await readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8");
  assert.match(rsvp, /existingByToken/);
  assert.match(rsvp, /eq\(rsvps\.viewerTokenHash, attendeeTokenHash\)/);
  assert.match(rsvp, /name: existingByToken\?\.name \|\| name/);
});

test("同行卡 stays event-bound, opt-in, and never opens a direct-message channel", async () => {
  const [route, schema, schemaInit, rsvp, eventClient, styles] = await Promise.all([
    readFile(new URL("../app/api/companions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rsvps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/e/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const companionCards/);
  assert.match(schema, /export const companionRequests/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS companion_cards/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS companion_requests/);
  assert.match(route, /eq\(rsvps\.response, "attending"\)/);
  assert.match(route, /event\.status !== "active"/);
  assert.match(route, /rateLimit\(request, "companions", 10/);
  assert.match(route, /每場活動最多送出 5 個同行邀請/);
  assert.match(route, /team: "想同隊"/);
  assert.doesNotMatch(route, /\/messages|direct_message/i);
  assert.match(route, /containsContactDetail/);
  assert.match(rsvp, /db\.delete\(companionCards\)/);
  assert.match(rsvp, /db\.delete\(companionRequests\)/);
  assert.match(eventClient, /同行卡/);
  assert.match(eventClient, /沒有私訊、電話或 LINE ID/);
  assert.match(eventClient, /action: "send_request"/);
  assert.match(eventClient, /action: "respond_request"/);
  assert.match(styles, /\.companions-section/);
});

test("one LINE group can serve several upcoming activities without sending ended activity data", async () => {
  const [schema, schemaInit, migration, adminLine, webhook, client, guide] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0013_loud_shotgun.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const lineGroups/);
  assert.match(schema, /ownerCredentialHash/);
  assert.match(schema, /line_bindings_group_event/);
  assert.doesNotMatch(schema, /line_bindings_group_unique/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS line_groups/);
  assert.match(schemaInit, /DROP INDEX IF EXISTS line_bindings_group_unique/);
  assert.match(migration, /DROP INDEX `line_bindings_group_unique`/);
  assert.match(migration, /owner_credential_hash/);
  assert.match(adminLine, /action === "list_groups"/);
  assert.match(adminLine, /action === "auto_reuse_group"/);
  assert.match(adminLine, /action === "use_existing_group"/);
  assert.match(adminLine, /reuseGroupForUnboundUpcomingEvents/);
  assert.match(adminLine, /!Number\.isFinite\(startsAt\) \|\| startsAt <= now/);
  assert.match(adminLine, /action === "publish_events"/);
  assert.match(adminLine, /只能發布尚未開始的活動/);
  assert.match(webhook, /upcomingGroupEvents/);
  assert.match(webhook, /eventStartsAt\(event\) > now/);
  assert.match(webhook, /totalPages > 5/);
  assert.match(webhook, /安排 20260930/);
  assert.match(client, /選擇既有通知群組/);
  assert.match(client, /autoReuseLineGroup/);
  assert.match(client, /合併發布近期活動/);
  assert.match(guide, /群組庫/);
  assert.match(guide, /安排 20260930/);
  assert.match(guide, /活動數量不設上限/);
  assert.match(guide, /剩餘名額/);
  assert.match(guide, /參加連結只提供報名/);
});

test("events can deliberately publish to several saved LINE groups while keeping test groups guarded", async () => {
  const [schema, schemaInit, migration, adminLine, webhook, reminders, client, lineLib] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/init.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0015_parched_toro.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/line/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/lib.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const activityLineGroups/);
  assert.match(schema, /isTest: integer\("is_test"/);
  assert.match(schemaInit, /CREATE TABLE IF NOT EXISTS activity_line_groups/);
  assert.match(migration, /activity_line_groups/);
  assert.match(migration, /is_test/);
  assert.match(adminLine, /action === "set_event_groups"/);
  assert.match(adminLine, /allowTestGroups/);
  assert.match(adminLine, /action === "save_group_profile"/);
  assert.match(adminLine, /saveEventGroups/);
  assert.match(webhook, /activityLineGroups/);
  assert.match(reminders, /eventNotificationGroups/);
  assert.match(client, /publish-created-event/);
  assert.match(client, /測試群組/);
  assert.match(client, /set_event_groups/);
  assert.match(lineLib, /目前 \$\{event\.attendingPeople\} 人參加/);
  assert.match(lineLib, /在 Google 地圖開啟/);
});

test("admin child panels return to the active dashboard and past reminders are skipped", async () => {
  const [client, reminders] = await Promise.all([
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/run-reminders/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function refreshAdminDashboard/);
  assert.match(client, /openEventForm\(event, managerAuth, returnToAdmin\)/);
  assert.match(client, /openSharePanel\(event, returnToAdmin\)/);
  assert.match(client, /openManagedRsvpEditor\(null, event, managerAuth, returnToAdmin\)/);
  assert.match(client, /openLineGroupPicker\(event, managerAuth, returnToAdmin\)/);
  assert.match(client, /openLinePublish\(event, managerAuth, returnToAdmin\)/);
  assert.match(client, /activeModalClose = returnTo \|\| closeModal/);
  assert.match(reminders, /!Number\.isFinite\(eventTime\) \|\| eventTime <= now/);
});

test("management UX keeps advanced choices and operational shortcuts easy to reach", async () => {
  const [client, styles, webhook, guide] = await Promise.all([
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/line/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/line-bot-guide.html", import.meta.url), "utf8"),
  ]);
  assert.match(client, /class="advanced-settings"/);
  assert.match(client, /<form id="event-form" autocomplete="off">/);
  assert.match(client, /活動名稱[\s\S]*"eventTitle"[\s\S]*type="text"[\s\S]*data-form-type="other"/);
  assert.match(client, /body\.title = String\(body\.eventTitle \|\| ""\)/);
  assert.match(client, /地址[\s\S]*"eventAddress"[\s\S]*type="text"[\s\S]*data-form-type="other"/);
  assert.match(client, /body\.address = String\(body\.eventAddress \|\| ""\)/);
  assert.match(client, /公開方式、名單、名額與費用/);
  assert.match(client, /class="admin-quick-nav"/);
  assert.match(client, /data-dashboard-jump="participant-list"/);
  assert.match(client, /id="payment-management"/);
  assert.match(client, /id="line-notifications"/);
  assert.match(client, /class="line-command-card"/);
  assert.match(client, /已結束／已取消活動/);
  assert.match(styles, /\.advanced-settings/);
  assert.match(styles, /\.admin-quick-nav/);
  assert.match(styles, /\.line-command-card/);
  assert.match(webhook, /activityListCard/);
  assert.match(webhook, /原神啟動 20260930/);
  assert.match(guide, /進階設定/);
  assert.match(guide, /儲存在這台裝置/);
});
