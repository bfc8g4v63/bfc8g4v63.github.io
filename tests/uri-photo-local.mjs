import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const base="http://localhost:3000",secret="local-only-secret-for-tests-0000";
const payload=Buffer.from(JSON.stringify({subject:"owner",displayName:"owner",avatarUrl:"",expiresAt:Math.floor(Date.now()/1000)+3600})).toString("base64url");
const cookie=`memory_capsule_session=${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;
async function call(path,{method="GET",data,body,origin=base}={}){const headers={cookie,...(method!=="GET"?{origin}:{}),...(data?{"content-type":"application/json"}:{}),...(body?{"content-type":"image/png"}:{})};const r=await fetch(`${base}/api/uri/${path}`,{method,headers,body:body||(data?JSON.stringify(data):undefined)});return {status:r.status,body:(r.headers.get("content-type")||"").includes("json")?await r.json():new Uint8Array(await r.arrayBuffer())};}
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
const created=[];
try {
 let r=await call("entries",{method:"POST",data:{kind:"memory",title:"Local photo test A",startDate:"2026-11-20"}});assert.equal(r.status,201);const first=r.body.id;created.push(first);
 r=await call("entries",{method:"POST",data:{kind:"memory",title:"Local photo test B",startDate:"2026-11-20"}});assert.equal(r.status,201);const second=r.body.id;created.push(second);
 r=await call(`photos/${first}`,{method:"POST",body:png});assert.equal(r.status,201);const p1=r.body.id;
 r=await call(`photos/${first}`,{method:"POST",body:png});assert.equal(r.status,201);const p2=r.body.id;
 r=await call(`photos/${second}`,{method:"POST",body:png});assert.equal(r.status,201);const foreign=r.body.id;
 r=await call(`photos/${first}`,{method:"POST",body:png,origin:"https://outside.example"});assert.equal(r.status,403);
 r=await call(`entries/${first}`,{method:"PATCH",data:{action:"cover",photoId:p2,version:1}});assert.equal(r.status,200);
 r=await call("entries");let firstRow=r.body.entries.find(e=>e.id===first);assert.deepEqual(new Set(firstRow.photos),new Set([p1,p2]));assert.equal(firstRow.coverPhotoId,p2);
 r=await call(`entries/${first}`,{method:"PATCH",data:{action:"cover",photoId:foreign,version:1}});assert.equal(r.status,404);
 r=await call("entries");firstRow=r.body.entries.find(e=>e.id===first);assert.equal(firstRow.coverPhotoId,p2);
 r=await call("export");assert.equal(r.status,200);assert.ok(Buffer.from(r.body).includes(Buffer.from(p2)),"cover ID appears in export");
 console.log("Local photo integration passed: binary PNG, multiple photos, cover ownership, export and origin checks.");
} finally {
 for(const id of created){let r=await call("entries");let row=r.body.entries.find(e=>e.id===id);if(row){await call(`entries/${id}?version=${row.version}`,{method:"DELETE"});r=await call("entries?deleted=1");row=r.body.entries.find(e=>e.id===id);if(row)await call(`purge/${id}?version=${row.version}`,{method:"DELETE"});}}
}
