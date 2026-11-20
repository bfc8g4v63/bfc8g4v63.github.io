import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const base="http://localhost:3000", origin=base, secret="local-only-secret-for-tests-0000";
function cookie(subject){const payload=Buffer.from(JSON.stringify({subject,displayName:subject,avatarUrl:"",expiresAt:Math.floor(Date.now()/1000)+3600})).toString("base64url");return `memory_capsule_session=${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;}
async function request(path,{who="owner",method="GET",data,source=origin,form}={}){const r=await fetch(`${base}/api/uri/${path}`,{method,headers:{cookie:cookie(who),...(method!=="GET"?{origin:source}:{}),...(data?{"content-type":"application/json"}:{})},body:form|| (data?JSON.stringify(data):undefined)});let body;const type=r.headers.get("content-type")||"";if(type.includes("json"))body=await r.json();else body=await r.arrayBuffer();return {status:r.status,body,headers:r.headers};}
let x=await request("entries",{who:"intruder"});assert.equal(x.status,403,"outsider denied");
x=await request("join",{method:"POST",data:{code:"local-test-setup-code"},source:"https://bad.example"});assert.equal(x.status,403,"cross-site write denied");
x=await request("join",{method:"POST",data:{code:"local-test-setup-code"}});assert.equal(x.status,200,"owner setup");
x=await request("invite",{method:"POST"});assert.equal(x.status,200);const invite=x.body.code;
x=await request("join",{who:"partner",method:"POST",data:{code:invite}});assert.equal(x.status,200,"partner joins");
x=await request("join",{who:"intruder",method:"POST",data:{code:invite}});assert.equal(x.status,403,"invite cannot be reused");
x=await request("entries",{method:"POST",data:{kind:"plan",title:"測試計畫",body:"測試資料",startDate:"2020-01-01"}});assert.equal(x.status,201);const id=x.body.id;
x=await request("entries",{who:"partner"});let row=x.body.entries.find(e=>e.id===id);assert.equal(row.view,"past-plan");assert.equal(row.body,"測試資料");
x=await request(`entries/${id}`,{who:"partner",method:"PATCH",data:{kind:"plan",title:"改期",body:"測試資料",startDate:"2099-01-01",version:row.version}});assert.equal(x.status,200);
x=await request("entries");row=x.body.entries.find(e=>e.id===id);assert.equal(row.view,"plan");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");const form=new FormData();form.set("photo",new Blob([png],{type:"image/png"}),"local-test.png");x=await request(`photos/${id}`,{method:"POST",form});assert.equal(x.status,201,"private photo upload");const photo=x.body.id;
x=await request(`photos/${photo}`,{who:"intruder"});assert.equal(x.status,403,"private photo denied");x=await request(`photos/${photo}`,{who:"partner"});assert.equal(x.status,200);
x=await request("export",{who:"partner"});assert.equal(x.status,200);assert.equal(x.headers.get("content-type"),"application/zip");assert.equal(new Uint8Array(x.body)[0],0x50);
x=await request(`entries/${id}?version=${row.version}`,{who:"partner",method:"DELETE"});assert.equal(x.status,200);x=await request(`photos/${photo}`);assert.equal(x.status,404,"deleted photo denied");
x=await request("entries?deleted=1");row=x.body.entries.find(e=>e.id===id);x=await request(`entries/${id}`,{method:"PATCH",data:{action:"restore",version:row.version}});assert.equal(x.status,200);
x=await request("member",{method:"DELETE"});assert.equal(x.status,200);x=await request("entries",{who:"partner"});assert.equal(x.status,403,"revoked partner denied");
console.log("Local integration passed: membership, origin, plan dates, photo privacy, ZIP, restore and revocation.");
