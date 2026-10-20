import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("elder-friendly memory entry keeps media choices and QR sharing centered on desktop and mobile", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/memory-capsule/MemoryCapsuleApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /qrcode\(0, "M"\)/);
  assert.match(page, /家人邀請連結 QR Code/);
  assert.match(page, /＋ 新增照片/);
  assert.match(page, /＋ 新增影片/);
  assert.match(page, /媒體上傳進度/);
  assert.match(page, /重試這一份/);
  assert.match(page, /最近新增/);
  assert.match(page, /年份／活動/);
  assert.match(styles, /\.memory-upload-actions \{ display:flex; justify-content:center; align-items:center/);
  assert.match(styles, /\.memory-upload-actions \{ width:100%; display:grid; grid-template-columns:1fr; \}/);
  assert.match(styles, /\.memory-upload-actions \.memory-primary,.memory-upload-actions \.memory-secondary \{ width:100%; \}/);
  assert.match(styles, /\.memory-invite-qr \{ display:grid; grid-template-columns:112px minmax\(0,1fr\)/);
});
