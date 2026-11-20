import { env } from "cloudflare:workers";
import { getMemorySession } from "../../memory/auth";
import { streamZip, textStream } from "../../memory/zip";
import { rateLimit } from "../../rate-limit";
import { entryView, taipeiDate, validDate } from "../../../../lib/uri/core";
import { readPreference, writePreference, splitPreferenceTitles } from "../../../../lib/uri/preferences";

type Bindings = { DB: D1Database; URI_BUCKET?: R2Bucket; URI_SETUP_CODE?: string; URI_SEED_JSON?: string; MEMORY_PUBLIC_ORIGIN?: string };
type Member = { id:string; role:string; display_name:string };
type Row = { id:string; author_id:string; kind:string; category:string; title:string; body:string; start_date:string|null; end_date:string|null; state:string; version:number; deleted_at:string|null; created_at:string; updated_at:string; display_name:string; author_role:string };
const runtime = env as unknown as Bindings;
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function json(data: unknown, status=200) { return Response.json(data,{status,headers:noStore}); }
function clean(v:unknown,max:number) { return typeof v === "string" ? v.trim().slice(0,max) : ""; }
async function digest(value:string) { const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function equal(a:string,b:string) { if(a.length!==b.length) return false; let n=0; for(let i=0;i<a.length;i++) n|=a.charCodeAt(i)^b.charCodeAt(i); return n===0; }
function originOK(request:Request) { const origin=request.headers.get("origin"); const configured=runtime.MEMORY_PUBLIC_ORIGIN?.trim(); return Boolean(origin && (origin===configured || (origin==="http://localhost:5173" && new URL(request.url).hostname==="localhost"))); }
async function identity(request:Request) { return getMemorySession(request); }
async function member(subject:string):Promise<Member|null> { return runtime.DB.prepare("SELECT id, role, display_name FROM uri_members WHERE subject = ? AND active = 1 LIMIT 1").bind(subject).first<Member>(); }
function output(row:Row,today:string) { const { author_id, start_date, end_date, deleted_at, created_at, updated_at, display_name, author_role, ...rest }=row; const preference = row.kind === "preference" ? readPreference(row.category,author_role) : null; return {...rest,...(preference?{category:preference.category,preferenceFor:preference.person}:{}),authorId:author_id,author:display_name,startDate:start_date,endDate:end_date,deletedAt:deleted_at,createdAt:created_at,updatedAt:updated_at,view:entryView({kind:row.kind,startDate:start_date,endDate:end_date,state:row.state},today)}; }
async function readBody(request:Request) { return await request.json() as Record<string,unknown>; }
function parseInput(body:Record<string,unknown>) {
  const kind=clean(body.kind,20),title=clean(body.title,120),text=clean(body.body,2000),category=clean(body.category,40),state=clean(body.state,20)||"active";
  const startDate=clean(body.startDate,10)||null,endDate=clean(body.endDate,10)||null;
  const preferenceCategory = kind === "preference" ? writePreference(body.preferenceFor,category) : category;
  if (preferenceCategory === null) return null;
  if(!["plan","memory","preference","note"].includes(kind)||!title||!["active","completed","cancelled"].includes(state)) return null;
  if((startDate && !validDate(startDate))||(endDate && !validDate(endDate))||(endDate && (!startDate || endDate<startDate))) return null;
  return {kind,title,body:text,category:preferenceCategory,state,startDate,endDate};
}
export async function GET(request:Request) {
 try {
  const path=new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  const session=await identity(request);
  if(path[0]==="session") { if(!session) return json({signedIn:false}); const m=await member(session.subject); return json({signedIn:true,member:m ? {id:m.id,role:m.role,name:m.display_name} : null}); }
  if(!session) return json({error:"請先登入"},401);
  const me=await member(session.subject); if(!me) return json({error:"此帳號尚未加入"},403);
  if(path[0]==="entries") {
   const deleted=new URL(request.url).searchParams.get("deleted")==="1";
   const rows=await runtime.DB.prepare(`SELECT e.*,m.display_name,m.role AS author_role FROM uri_entries e JOIN uri_members m ON m.id=e.author_id WHERE e.deleted_at IS ${deleted?"NOT NULL":"NULL"} ORDER BY e.created_at DESC LIMIT 500`).all<Row>();
   const photos=await runtime.DB.prepare("SELECT p.id,p.entry_id FROM uri_photos p JOIN uri_entries e ON p.entry_id=e.id WHERE e.deleted_at IS NULL").all<{id:string;entry_id:string}>();
   const today=taipeiDate(); return json({today,entries:(rows.results||[]).map(row=>({...output(row,today),photos:(photos.results||[]).filter(p=>p.entry_id===row.id).map(p=>p.id)}))});
  }
  if(path[0]==="photos" && path[1]) {
   const photo=await runtime.DB.prepare("SELECT p.object_key,p.mime_type FROM uri_photos p JOIN uri_entries e ON e.id=p.entry_id WHERE p.id=? AND e.deleted_at IS NULL").bind(path[1]).first<{object_key:string;mime_type:string}>();
   if(!photo || !runtime.URI_BUCKET) return json({error:"找不到相片"},404);
   const object=await runtime.URI_BUCKET.get(photo.object_key); if(!object) return json({error:"找不到相片"},404);
   return new Response(object.body,{headers:{...noStore,"Content-Type":photo.mime_type,"Content-Disposition":"inline","Content-Security-Policy":"default-src 'none'; sandbox"}});
  }
  if(path[0]==="export") {
   const rows=await runtime.DB.prepare("SELECT e.id,e.kind,e.category,e.title,e.body,e.start_date,e.end_date,e.state,e.created_at,e.updated_at,m.display_name,m.role AS author_role FROM uri_entries e JOIN uri_members m ON m.id=e.author_id WHERE e.deleted_at IS NULL ORDER BY e.created_at").all();
   const photos=await runtime.DB.prepare("SELECT p.id,p.object_key,p.mime_type,p.byte_size,p.entry_id FROM uri_photos p JOIN uri_entries e ON e.id=p.entry_id WHERE e.deleted_at IS NULL").all<{id:string;object_key:string;mime_type:string;byte_size:number;entry_id:string}>();
   const files=photos.results||[]; if(files.length&&!runtime.URI_BUCKET) return json({error:"照片儲存尚未連線"},503);
   if(files.reduce((n,p)=>n+p.byte_size,0)>2*1024*1024*1024) return json({error:"資料超過單次匯出上限，請聯繫管理者"},413);
   const archive=[{name:"memories.json",open:async()=>textStream(JSON.stringify({exportedAt:new Date().toISOString(),entries:(rows.results||[]).map((row:any)=>{const {author_role,...entry}=row;const pref=entry.kind==="preference"?readPreference(entry.category,author_role):null;return pref?{...entry,category:pref.category,preference_for:pref.person}:entry;}),photos:files.map(p=>({id:p.id,entryId:p.entry_id,mimeType:p.mime_type}))},null,2))},...files.map(p=>({name:`photos/${p.id}.${p.mime_type==="image/png"?"png":p.mime_type==="image/webp"?"webp":"jpg"}`,open:async()=>{const obj=await runtime.URI_BUCKET!.get(p.object_key);if(!obj)throw new Error("missing photo");return obj.body;}}))];
   return new Response(streamZip(archive),{headers:{...noStore,"Content-Type":"application/zip","Content-Disposition":"attachment; filename=uri-memories.zip"}});
  }
  return json({error:"找不到資料"},404);
 } catch {return json({error:"服務暫時無法使用，請稍後再試"},503);}
}
export async function POST(request:Request) {
 try {
  if(!originOK(request)) return json({error:"無法驗證請求來源"},403);
  const path=new URL(request.url).pathname.split("/").filter(Boolean).slice(2), session=await identity(request);
  if(!session) return json({error:"請先登入"},401);
  if(path[0]==="join") {
   const limit=await rateLimit(request,"uri-join",8,15*60*1000); if(!limit.allowed) return json({error:"嘗試次數過多，請稍後再試"},429);
   const data=await readBody(request),code=clean(data.code,200); if(!code) return json({error:"請輸入邀請碼"},400);
   const existing=await member(session.subject); if(existing) return json({ok:true});
   const now=new Date().toISOString(), owner=await runtime.DB.prepare("SELECT id FROM uri_members WHERE role='owner' AND active=1").first();
   if(!owner) {
    const configured=runtime.URI_SETUP_CODE?.trim()||""; if(!configured||!equal(await digest(code),await digest(configured))) return json({error:"邀請碼無效或已失效"},403);
    const ownerId=crypto.randomUUID();
    const raw=JSON.parse(runtime.URI_SEED_JSON || "[]") as Array<Record<string,unknown>>;
    const seeds=raw.slice(0,10).map(parseInput).filter((item):item is NonNullable<typeof item>=>Boolean(item));
    const operations=[runtime.DB.prepare("INSERT INTO uri_members (id,subject,display_name,role,active,created_at) VALUES (?,?,?,'owner',1,?) ON CONFLICT DO NOTHING").bind(ownerId,session.subject,session.displayName,now),...seeds.map((item,index)=>runtime.DB.prepare("INSERT OR IGNORE INTO uri_entries (id,author_id,kind,category,title,body,start_date,end_date,state,version,created_at,updated_at) SELECT ?,id,?,?,?,?,?,?,?,1,?,? FROM uri_members WHERE id=? AND subject=? AND active=1").bind(`uri-seed-${index}`,item.kind,item.category,item.title,item.body,item.startDate,item.endDate,item.state,now,now,ownerId,session.subject))];
    const results=await runtime.DB.batch(operations);
    if(!results[0].meta.changes) return json({error:"邀請碼無效或已失效"},403); return json({ok:true});
   }
   const hash=await digest(code);
   const inserted=await runtime.DB.prepare("INSERT INTO uri_members (id,subject,display_name,role,active,created_at) SELECT ?,?,?,'member',1,? FROM uri_invites WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? ON CONFLICT DO NOTHING").bind(crypto.randomUUID(),session.subject,session.displayName,now,hash,now).run();
   if(!inserted.meta.changes) return json({error:"邀請碼無效或已失效"},403);
   await runtime.DB.prepare("UPDATE uri_invites SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL").bind(now,hash).run(); return json({ok:true});
  }
  const me=await member(session.subject); if(!me) return json({error:"此帳號尚未加入"},403);
  if(path[0]==="invite") {
   if(me.role!=="owner") return json({error:"需要管理權限"},403);
   const memberExists=await runtime.DB.prepare("SELECT id FROM uri_members WHERE role='member' AND active=1").first(); if(memberExists) return json({error:"另一位成員已加入"},409);
   const bytes=crypto.getRandomValues(new Uint8Array(24)),code=[...bytes].map(n=>n.toString(16).padStart(2,"0")).join(""); const now=new Date();
   await runtime.DB.batch([runtime.DB.prepare("UPDATE uri_invites SET consumed_at=? WHERE consumed_at IS NULL").bind(now.toISOString()),runtime.DB.prepare("INSERT INTO uri_invites (id,token_hash,expires_at,created_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),await digest(code),new Date(now.getTime()+24*3600*1000).toISOString(),now.toISOString())]);
   return json({code,expiresHours:24});
  }
  if(path[0]==="entries") {
   const data=await readBody(request); const input=parseInput(data); if(!input) return json({error:"請檢查標題、對象與分類"},400);
   const titles=input.kind==="preference" ? splitPreferenceTitles(data.title) : [input.title];
   if(!titles) return json({error:"請輸入 1 到 30 個喜好，每項最多 120 字"},400);
   const ids=titles.map(()=>crypto.randomUUID()),now=new Date().toISOString();
   await runtime.DB.batch(titles.map((title,index)=>runtime.DB.prepare("INSERT INTO uri_entries (id,author_id,kind,category,title,body,start_date,end_date,state,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)").bind(ids[index],me.id,input.kind,input.category,title,input.body,input.startDate,input.endDate,input.state,now,now))); return json({id:ids[0],count:ids.length},201);
  }
  if(path[0]==="photos" && path[1]) {
   const entry=await runtime.DB.prepare("SELECT id FROM uri_entries WHERE id=? AND deleted_at IS NULL").bind(path[1]).first(); if(!entry) return json({error:"找不到內容"},404);
   if(!runtime.URI_BUCKET) return json({error:"照片儲存尚未設定"},503);
   if(Number(request.headers.get("content-length")||0)>9*1024*1024) return json({error:"照片檔案過大"},413);
   const form=await request.formData(),file=form.get("photo"); if(!(file instanceof File)||file.size<1||file.size>8*1024*1024) return json({error:"請選擇 8 MB 內的照片"},400);
   const bytes=new Uint8Array(await file.arrayBuffer()); let mime="";
   if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) mime="image/jpeg";
   else if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)) mime="image/png";
   else if(bytes.length>12&&new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP") mime="image/webp";
   if(!mime) return json({error:"請選擇 JPG、PNG 或 WebP 照片"},400);
   const id=crypto.randomUUID(),key=`uri/${id}`; await runtime.URI_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
   try { await runtime.DB.prepare("INSERT INTO uri_photos (id,entry_id,object_key,mime_type,byte_size,created_at) VALUES (?,?,?,?,?,?)").bind(id,path[1],key,mime,bytes.length,new Date().toISOString()).run(); } catch {await runtime.URI_BUCKET.delete(key);throw new Error("save failed");}
   return json({id},201);
  }
  return json({error:"找不到功能"},404);
 } catch {return json({error:"目前無法儲存，請稍後再試"},503);}
}
export async function PATCH(request:Request) {
 try {
  if(!originOK(request)) return json({error:"無法驗證請求來源"},403);
  const session=await identity(request); if(!session) return json({error:"請先登入"},401); const me=await member(session.subject); if(!me) return json({error:"此帳號尚未加入"},403);
  const path=new URL(request.url).pathname.split("/").filter(Boolean).slice(2); if(path[0]!=="entries"||!path[1]) return json({error:"找不到內容"},404);
  const data=await readBody(request),version=Number(data.version); if(!Number.isInteger(version)) return json({error:"請重新整理後再試"},400);
  const now=new Date().toISOString();
  if(data.action==="restore") {const result=await runtime.DB.prepare("UPDATE uri_entries SET deleted_at=NULL,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NOT NULL AND state != 'purging'").bind(now,path[1],version).run();return result.meta.changes?json({ok:true}):json({error:"內容已有變更，請重新整理"},409);}
  const input=parseInput(data); if(!input) return json({error:"請檢查標題與日期"},400);
  const original=await runtime.DB.prepare("SELECT e.author_id,e.kind,e.category,m.role AS author_role FROM uri_entries e JOIN uri_members m ON m.id=e.author_id WHERE e.id=? AND e.deleted_at IS NULL").bind(path[1]).first<{author_id:string;kind:string;category:string;author_role:string}>();
  if(!original) return json({error:"找不到內容"},404); if(original.kind!==input.kind) return json({error:"不能變更內容種類"},400);
  if(original.kind==="preference" && original.author_id!==me.id && me.role!=="owner" && readPreference(original.category,original.author_role).person!=="yandy") return json({error:"請由本人或記錄者修改喜好"},403);
  const result=await runtime.DB.prepare("UPDATE uri_entries SET kind=?,category=?,title=?,body=?,start_date=?,end_date=?,state=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NULL").bind(input.kind,input.category,input.title,input.body,input.startDate,input.endDate,input.state,now,path[1],version).run();return result.meta.changes?json({ok:true}):json({error:"內容已有變更，請重新整理"},409);
 }catch{return json({error:"目前無法儲存，請稍後再試"},503);}
}
export async function DELETE(request:Request) {
 try {
  if(!originOK(request)) return json({error:"無法驗證請求來源"},403); const session=await identity(request); if(!session) return json({error:"請先登入"},401); const me=await member(session.subject); if(!me) return json({error:"此帳號尚未加入"},403);
  const path=new URL(request.url).pathname.split("/").filter(Boolean).slice(2), now=new Date().toISOString();
  if(path[0]==="member" && me.role==="owner") {await runtime.DB.batch([runtime.DB.prepare("UPDATE uri_members SET active=0 WHERE role='member' AND active=1"),runtime.DB.prepare("UPDATE uri_invites SET consumed_at=? WHERE consumed_at IS NULL").bind(now)]); return json({ok:true});}
  if(path[0]==="purge" && path[1]) {
   if(me.role!=="owner") return json({error:"需要管理權限"},403);
   const version=Number(new URL(request.url).searchParams.get("version"));
   const row=await runtime.DB.prepare("SELECT state,version FROM uri_entries WHERE id=? AND deleted_at IS NOT NULL").bind(path[1]).first<{state:string;version:number}>();
   if(!row || row.version!==version) return json({error:"內容已有變更，請重新整理"},409);
   if(row.state!=="purging") {
    const locked=await runtime.DB.prepare("UPDATE uri_entries SET state='purging',version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NOT NULL").bind(now,path[1],version).run();
    if(!locked.meta.changes) return json({error:"內容已有變更，請重新整理"},409);
   }
   const photos=await runtime.DB.prepare("SELECT object_key FROM uri_photos WHERE entry_id=?").bind(path[1]).all<{object_key:string}>();
   if((photos.results||[]).length&&!runtime.URI_BUCKET) return json({error:"照片儲存尚未連線，請稍後重試永久刪除"},503);
   for(const photo of photos.results||[]) await runtime.URI_BUCKET!.delete(photo.object_key);
   await runtime.DB.batch([runtime.DB.prepare("DELETE FROM uri_photos WHERE entry_id=?").bind(path[1]),runtime.DB.prepare("DELETE FROM uri_entries WHERE id=? AND state='purging' AND deleted_at IS NOT NULL").bind(path[1])]);
   return json({ok:true});
  }
  if(path[0]!=="entries"||!path[1]) return json({error:"找不到內容"},404);
  const v=Number(new URL(request.url).searchParams.get("version"));if(!Number.isInteger(v))return json({error:"請重新整理"},400);
  const res=await runtime.DB.prepare("UPDATE uri_entries SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL").bind(now,now,path[1],v).run();return res.meta.changes?json({ok:true}):json({error:"內容已有變更，請重新整理"},409);
 }catch{return json({error:"目前無法刪除，請稍後再試"},503);}
}
