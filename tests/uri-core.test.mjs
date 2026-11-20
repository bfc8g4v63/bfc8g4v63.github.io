import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {entryView,taipeiDate,validDate,monthDays,changeDatePart,shiftCalendarMonth,firstWeekday} from "../lib/uri/core.ts";
import proxy from "../cloudflare/gooddays-proxy-worker.mjs";
import {readPreference,writePreference,splitPreferenceTitles} from "../lib/uri/preferences.ts";

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

test("the couple space uses a neutral motif and keeps its preference action centered",async()=>{
  const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
  assert.doesNotMatch(page,/Y\s*(?:&|＆|<i>&<\/i>)\s*N|<span>[YN]<\/span>/);
  assert.doesNotMatch(page,/className="together-art"/);
  assert.match(css,/\.together \.outline-button,\.settings-card \.outline-button\{[^}]*margin-left:auto;margin-right:auto/);
  assert.match(css,/\.together>div\{width:100%\}/);
});

test("preferences preserve their subject, legacy author and individual list entries",()=>{
  assert.equal(writePreference("yandy","不喜歡"),"pref:yandy:不喜歡");
  assert.deepEqual(readPreference("pref:yandy:不喜歡","owner"),{person:"yandy",category:"不喜歡"});
  assert.deepEqual(readPreference("喜歡","owner"),{person:"nelson",category:"喜歡"});
  assert.deepEqual(readPreference("不太喜歡","member"),{person:"yandy",category:"不太喜歡"});
  assert.equal(writePreference("unknown","喜歡"),null);
  assert.deepEqual(splitPreferenceTitles("甲、乙，丙,甲"),["甲","乙","丙"]);
  assert.equal(splitPreferenceTitles(Array(32).fill("x").map((x,i)=>x+i).join(",")),null);
});
test("preference controls stay within padded, responsive cards",async()=>{
  const css=await readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8");
  assert.match(css,/\.preference-person\{padding:28px/);
  assert.match(css,/@media\(max-width:700px\)\{\.preference-people\{grid-template-columns:1fr\}\.preference-person\{padding:23px/);
  assert.match(css,/\.primary-button,\.outline-button\{[^}]*align-items:center;justify-content:center/);
});

test("tilted cards retain centered actions and respect reduced motion",async()=>{
  const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
  assert.match(page,/className="keepsake"/);
  assert.match(page,/coverEntries\.map/);
  assert.match(page,/\/api\/uri\/photos\/\$\{entry\.coverPhotoId/);
  assert.match(css,/\.keepsake-stack:focus-visible\{/);
  assert.doesNotMatch(page,/className="orbit"/);
  assert.match(css,/@media\(max-width:700px\)\{\.uri-hero\{min-height:650px\}\.keepsake\{width:155px;right:0;top:auto;bottom:52px/);
  assert.match(css,/\.feature-plan\{transform:rotate\(-1deg\)\}/);
  assert.match(css,/\.feature-memory\{transform:rotate\(1deg\)\}/);
  assert.match(css,/\.feature-card\{align-items:center;text-align:center\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.feature-plan[^}]*transform:none/);
});

test("date selection uses real four-digit dates and handles leap years",()=>{
  assert.equal(validDate("202613-10-31"),false);
  assert.equal(monthDays(2028,2),29); assert.equal(monthDays(2100,2),28);
  assert.equal(changeDatePart("2028-01-31","month","02","2026-11-20"),"2028-02-29");
  assert.equal(changeDatePart("2028-02-29","year","2027","2026-11-20"),"2027-02-28");
  assert.equal(changeDatePart("","month","03","2026-11-20"),"2026-03-20");
  assert.equal(changeDatePart("2026-11-20","year","202613","2026-11-20"),"2026-11-20");
  assert.equal(changeDatePart("2026-11-20","year","","2026-11-20"),"");
});
test("responsive date selectors replace free-form dates without crowding controls",async()=>{
  const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
  assert.doesNotMatch(page,/type="date"/);
  assert.match(page,/startDate:kind==="memory"\?taipeiDate\(\):""/);
  assert.match(page,/aria-label=\{`\$\{label\} 年`\}/);
  assert.match(css,/\.date-picker-row\{display:grid;grid-template-columns:1\.25fr 1fr 1fr;gap:8px\}/);
  assert.match(css,/\.date-fields\{grid-template-columns:1fr\}/);
});

test("photo controls support centered cover selection and binary uploads",async()=>{
  const [page,css,api]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8"),readFile(new URL("../app/api/uri/[...path]/route.ts",import.meta.url),"utf8")]);
  assert.match(page,/type="file" multiple/);
  assert.match(page,/aria-pressed=\{coverChoice/);
  assert.match(page,/method:"POST",body:blob/);
  assert.match(api,/p\.entry_id=e\.id WHERE e\.id=\? AND p\.id=\?/);
  assert.match(css,/\.uri-app \.photo-option\{[^}]*align-items:center;justify-content:center/);
  assert.match(css,/@media\(max-width:700px\)\{\.entry-media\{padding:16px 16px 0\}/);
});

test("calendar navigation handles month boundaries and year rollover",()=>{
 assert.equal(shiftCalendarMonth("2028-01-31",1),"2028-02-29");
 assert.equal(shiftCalendarMonth("2026-12-31",1),"2027-01-31");
 assert.equal(shiftCalendarMonth("2027-01-31",-1),"2026-12-31");
 assert.equal(shiftCalendarMonth("2024-02-29",-2),"2023-12-29");
 assert.equal(firstWeekday(2026,11),0);
});
test("calendar buttons remain centered, visible and accessible",async()=>{
 const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 assert.match(page,/開啟日曆選日期/);assert.match(page,/aria-expanded=\{expanded\}/);
 assert.match(page,/addEventListener\("wheel",wheel,\{passive:false\}\)/);
 assert.match(page,/setCalendarView\(shiftCalendarMonth\(current,-1\)\)/);
 assert.match(css,/\.calendar-toggle-row\{display:flex;justify-content:center/);
 assert.match(css,/\.uri-app \.calendar-toggle\{display:inline-flex;align-items:center;justify-content:center/);
 assert.match(css,/\.calendar-actions\{display:flex;justify-content:center/);
});
