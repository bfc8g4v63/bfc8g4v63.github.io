import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {entryView,taipeiDate,validDate} from "../lib/uri/core.ts";
import proxy from "../cloudflare/gooddays-proxy-worker.mjs";

test("plans move after the final Taipei day without claiming they happened",()=>{
  assert.equal(taipeiDate(new Date("2026-12-13T15:59:59Z")),"2026-12-13");
  assert.equal(taipeiDate(new Date("2026-12-13T16:00:00Z")),"2026-12-14");
  const p={kind:"plan",startDate:"2026-12-12",endDate:"2026-12-13",state:"active"};
  assert.equal(entryView(p,"2026-12-13"),"plan");
  assert.equal(entryView(p,"2026-12-14"),"past-plan");
  assert.equal(entryView({...p,startDate:"2026-12-20",endDate:null},"2026-12-14"),"plan");
  assert.equal(entryView({...p,state:"cancelled"},"2026-12-14"),"cancelled");
  assert.equal(entryView({...p,startDate:null,endDate:null},"2026-12-14"),"plan");
  assert.equal(entryView({...p,kind:"memory"},"2026-12-01"),"memory");
  assert.equal(validDate("2026-02-29"),false);assert.equal(validDate("2028-02-29"),true);
});
test("gateway forwards credentials only to private routes and preserves URI origin",async()=>{
  const original=globalThis.fetch;let forwarded;
  globalThis.fetch=async req=>{forwarded=req;return new Response("ok");};
  try {
    await proxy.fetch(new Request("https://gooddays.carewear.workers.dev/api/uri/entries",{headers:{cookie:"memory_capsule_session=fake",origin:"https://gooddays.carewear.workers.dev"}}));
    assert.equal(forwarded.headers.get("cookie"),"memory_capsule_session=fake");
    assert.equal(forwarded.headers.get("origin"),"https://gooddays.carewear.workers.dev");
    await proxy.fetch(new Request("https://gooddays.carewear.workers.dev/api/events",{headers:{cookie:"secret",origin:"https://gooddays.carewear.workers.dev"}}));
    assert.equal(forwarded.headers.get("cookie"),null);assert.equal(forwarded.headers.get("origin"),null);
  } finally {globalThis.fetch=original;}
});
test("private routes bypass the service-worker cache and actions have centered responsive styles",async()=>{
  const [sw,css,page]=await Promise.all([readFile(new URL("../public/sw.js",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8"),readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8")]);
  assert.match(sw,/path === "\/uri"/);assert.match(sw,/path\.startsWith\("\/api\/"\)/);
  assert.match(css,/\.primary-button,\.outline-button\{[^}]*align-items:center;justify-content:center/);
  assert.match(css,/\.uri-modal\{[^}]*padding:28px/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.section-head \.primary-button\{align-self:center\}/);
  assert.match(css,/\.feature-card\{align-items:center;text-align:center\}/);
  assert.match(css,/\.settings-card \.outline-button\{[^}]*margin-left:auto;margin-right:auto/);
  assert.match(css,/\.uri-app a\.primary-button\{color:#102725\}/);
  assert.match(page,/prefers-reduced-motion|uri-app/);
});


test("retired anonymous fairy submission cannot forward private messages",async()=>{
  for (const path of ["../app/api/fairy/route.ts","../app/api/fairy/reaction/route.ts"]) {
    const source=await readFile(new URL(path,import.meta.url),"utf8");
    assert.match(source, /410/); assert.doesNotMatch(source, /pushText|fairyNotificationTargets/);
  }
});


test("permanent deletion is owner-only and cannot race a restore",async()=>{
  const source=await readFile(new URL("../app/api/uri/[...path]/route.ts",import.meta.url),"utf8");
  assert.match(source,/if\(me\.role!=="owner"\) return json\(\{error:"需要管理權限"\},403\)/);
  assert.match(source,/state != 'purging'/);
  assert.match(source,/state='purging',version=version\+1/);
});
