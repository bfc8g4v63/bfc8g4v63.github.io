import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {entryView,taipeiDate,validDate,monthDays,changeDatePart,shiftCalendarMonth,firstWeekday,dateWheelIndex,slowDateWheel} from "../lib/uri/core.ts";
import proxy from "../cloudflare/gooddays-proxy-worker.mjs";
import {albumSwipe,orderAlbumPhotos,stepAlbumIndex} from "../lib/uri/album.ts";
import {uploadPhoto} from "../lib/uri/photo-upload.ts";
import {createPendingPhotos} from "../lib/uri/photo-selection.ts";
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
  assert.match(page,/label=\{`\$\{label\} 年`\}/);
  assert.match(css,/\.date-picker-row\{display:grid;grid-template-columns:1\.25fr 1fr 1fr;gap:8px\}/);
  assert.match(css,/\.date-fields\{grid-template-columns:1fr\}/);
});

test("photo controls support centered cover selection and binary uploads",async()=>{
  const [page,css,api]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8"),readFile(new URL("../app/api/uri/[...path]/route.ts",import.meta.url),"utf8")]);
  assert.match(page,/type="file" multiple/);
  assert.match(page,/aria-pressed=\{coverChoice/);
  assert.match(page,/uploadPhoto\(id,blob/);
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
 assert.match(page,/role="spinbutton"/);
 assert.match(css,/scroll-snap-type:y mandatory/);
 assert.match(page,/setCalendarView\(shiftCalendarMonth\(current,-1\)\)/);
 assert.match(css,/\.calendar-toggle-row\{display:flex;justify-content:center/);
 assert.match(css,/\.uri-app \.calendar-toggle\{display:inline-flex;align-items:center;justify-content:center/);
 assert.match(css,/\.calendar-actions\{display:flex;justify-content:center/);
});

test("wheel selection clamps offsets to available dates",()=>{
 assert.equal(dateWheelIndex(-50,12),0);assert.equal(dateWheelIndex(44*4+23,12),5);assert.equal(dateWheelIndex(99999,12),11);
});
test("date wheels are keyboard accessible and keep their contents centered",async()=>{
 const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 assert.doesNotMatch(page,/<select ref=\{yearRef\}/);assert.match(page,/aria-valuetext=/);assert.match(page,/event\.key==="ArrowDown"/);assert.match(page,/syncTarget/);
 assert.match(css,/\.date-wheel-option\{[^}]*align-items:center;justify-content:center/);
 assert.match(css,/\.date-wheel-frame::after\{[^}]*left:4px;right:4px;top:44px;height:44px/);
});

test("mouse wheel advances at most one date per notch",()=>{
 assert.deepEqual(slowDateWheel(0,120,0),{step:1,carry:59});
 assert.deepEqual(slowDateWheel(0,-120,0),{step:-1,carry:-59});
 assert.deepEqual(slowDateWheel(0,20,0),{step:0,carry:20});
 assert.deepEqual(slowDateWheel(20,40,0),{step:1,carry:0});
});

test("photo uploads report actual bytes and surface rejection",async()=>{
 const updates=[];let fake;const create=()=>fake={upload:{},open(method,url){this.method=method;this.url=url;},setRequestHeader(k,v){this.header=[k,v];},send(){this.upload.onprogress({loaded:2,total:4,lengthComputable:true});this.upload.onprogress({loaded:4,total:4,lengthComputable:true});this.status=201;this.response={id:"photo-id"};this.onload();}};
 const result=await uploadPhoto("entry-id",new Blob(["1234"],{type:"image/jpeg"}),n=>updates.push(n),create);
 assert.deepEqual(updates,[.5,1]);assert.equal(result.id,"photo-id");assert.equal(fake.method,"POST");assert.equal(fake.url,"/api/uri/photos/entry-id");
 const denied=()=>({upload:{},open(){},setRequestHeader(){},send(){this.status=403;this.response=null;this.onload();}});
 await assert.rejects(uploadPhoto("entry-id",new Blob(["1"]),()=>{},denied),/請求遭拒/);
});
test("photo selection has no fixed item cap and previews are bounded",async()=>{
 const [page,css,layout,icon]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8"),readFile(new URL("../app/uri/layout.tsx",import.meta.url),"utf8"),readFile(new URL("../public/uri-cats.svg",import.meta.url),"utf8")]);
 assert.doesNotMatch(page,/photos\.length\s*\+\s*chosen\.length\s*>/);assert.match(page,/photos\.slice\(0,photoPreviewLimit\)/);
 assert.match(page,/<progress max=\{uploadProgress\.total\}/);assert.match(page,/className="uri-edit-fields" disabled=\{busy\} inert=/);assert.match(layout,/uri-cats\.svg/);assert.match(icon,/<svg/);
 assert.match(css,/\.uri-app \.show-more-photos\{display:flex;align-items:center;justify-content:center/);
});

test("more than twenty photos remain independently queued",()=>{
 let index=0;const files=Array.from({length:73},(_,i)=>({name:`photo-${i}`}));const queued=createPendingPhotos(files,()=>`id-${index++}`);
 assert.equal(queued.length,73);assert.equal(queued[0].file,files[0]);assert.equal(queued[72].file,files[72]);assert.equal(new Set(queued.map(p=>p.id)).size,73);
});

test("album captions lead the fixed photo area and navigation stays centered",async()=>{
 const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 const card=page.slice(page.indexOf("function EntryCard("));
 assert.ok(card.indexOf('className="entry-body"')<card.indexOf('className="entry-media"'));
 assert.match(card,/aria-label="上一張照片"/);assert.match(card,/aria-label="下一張照片"/);
 assert.match(css,/\.album-controls\{display:flex;align-items:center;justify-content:center;gap:18px;margin:13px auto 0/);
 assert.match(css,/\.uri-app \.album-controls button\{display:flex;align-items:center;justify-content:center;width:40px;height:40px/);
 assert.match(css,/@media\(max-width:700px\)\{\.uri-app \.entry-media\{padding:0 16px 16px\}\.album-controls\{gap:16px;margin-top:12px\}/);
});

test("Uri cards remain centered and free of decorative sparkle glyphs",async()=>{
 const [page,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 assert.doesNotMatch(page,/[✳✦✧✴❇✨🌟💫⭐★☆❋✵✶✷✸✹]/u);
 assert.doesNotMatch(page,/className="card-icon"/);
 assert.match(css,/\.uri-app \.feature-card\{min-height:220px;padding:28px 30px;align-items:center;text-align:center\}/);
 assert.match(css,/\.uri-app \.feature-card \.card-foot\{justify-content:center;gap:20px\}/);
 assert.match(css,/@media\(max-width:700px\)\{\.uri-app \.feature-card\{min-height:190px;padding:24px\}\}/);
});

test("aurora cursor respects touch, motion preferences and text inputs",async()=>{
 const [page,css,pointer,active]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8"),readFile(new URL("../public/uri-cursor.svg",import.meta.url),"utf8"),readFile(new URL("../public/uri-cursor-active.svg",import.meta.url),"utf8")]);
 assert.match(page,/\(hover: hover\) and \(pointer: fine\) and \(prefers-reduced-motion: no-preference\)/);
 assert.match(page,/event\.pointerType!=="mouse"/);assert.match(page,/target\.closest\("input:not/);
 assert.match(page,/cancelAnimationFrame\(frame\)/);assert.match(page,/window\.removeEventListener\("pointermove",move\)/);
 assert.match(css,/\.uri-cursor\{display:none\}/);assert.match(css,/\.uri-cursor\{display:block;position:fixed;[^}]*pointer-events:none/);
 assert.match(css,/\[contenteditable=true\]\{cursor:text\}/);assert.match(pointer,/<svg/);assert.match(active,/<svg/);
});

test("Uri share metadata and login error stay specific to Uri",async()=>{
 const [layout,page]=await Promise.all([readFile(new URL("../app/uri/layout.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8")]);
 assert.match(layout,/applicationName: "우리"/);assert.match(layout,/openGraph: \{ title: "우리"/);assert.match(page,/LINE 登入已中斷或逾時/);
});


test("album navigation orders the cover and distinguishes swipes from vertical scrolls",()=>{
 assert.deepEqual(orderAlbumPhotos(["a","b","c"],"b"),["b","a","c"]);
 assert.deepEqual(orderAlbumPhotos(["a","b"],"missing"),["a","b"]);assert.deepEqual(orderAlbumPhotos([],null),[]);
 assert.equal(stepAlbumIndex(0,-1,3),2);assert.equal(stepAlbumIndex(2,1,3),0);assert.equal(stepAlbumIndex(0,1,0),0);
 assert.equal(albumSwipe(-90,10),1);assert.equal(albumSwipe(90,10),-1);assert.equal(albumSwipe(20,0),0);assert.equal(albumSwipe(70,80),0);
});
test("album actions stay centered with responsive thumbnail layouts",async()=>{
 const [page,album,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/AlbumDialog.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 assert.match(page,/className="album-open"/);assert.match(album,/photos\.slice\(0,limit\)/);assert.match(album,/loading=\{large\?"eager":"lazy"\}/);
 assert.match(album,/ArrowLeft/);assert.match(album,/ArrowRight/);assert.match(album,/onTouchStart/);assert.match(album,/onTouchEnd/);
 assert.match(css,/\.uri-app \.album-open\{display:flex;align-items:center;justify-content:center;[^}]*margin:14px auto/);
 assert.match(css,/\.uri-app \.album-more\{display:flex;align-items:center;justify-content:center;[^}]*margin:24px auto/);
 assert.match(css,/\.album-grid\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/\.album-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("navigation and close icons use centered vector paths across responsive controls",async()=>{
 const [page,album,icons,css]=await Promise.all([readFile(new URL("../app/uri/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/AlbumDialog.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/Icons.tsx",import.meta.url),"utf8"),readFile(new URL("../app/uri/uri.css",import.meta.url),"utf8")]);
 assert.doesNotMatch(page,/>[‹›←→×]<\/button>/);assert.doesNotMatch(album,/>[‹›×]<\/button>/);
 assert.match(icons,/viewBox="0 0 24 24"/);assert.match(icons,/M15\.5 5L8\.5 12l7 7/);assert.match(icons,/M19 12H5 M11 6l-6 6 6 6/);assert.match(icons,/aria-hidden="true"/);
 assert.match(css,/\.uri-app \.uri-icon\{display:block;flex:none;width:20px;height:20px/);
 assert.match(css,/\.uri-app \.viewer-arrow \.uri-icon\{width:22px;height:22px\}/);
 assert.match(css,/\.uri-app \.calendar-nav\{display:grid;place-items:center;width:40px;height:40px/);
 assert.match(css,/\.uri-app \.album-controls button\{display:flex;align-items:center;justify-content:center/);
 assert.match(css,/\.uri-app \.album-close,\.uri-app \.viewer-arrow\{flex:none;display:flex;align-items:center;justify-content:center/);
});
