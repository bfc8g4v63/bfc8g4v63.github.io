import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy host renders the GitHub Pages handoff", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /好日子｜家庭活動/);
  assert.match(page, /正在前往好日子家庭活動/);
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
