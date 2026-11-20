import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const base="http://localhost:3000", secret="local-only-secret-for-tests-0000";
function state(returnTo,expiresAt=Math.floor(Date.now()/1000)+600){const payload=Buffer.from(JSON.stringify({returnTo,expiresAt,nonce:"local-test-nonce",inviteCodeHash:""})).toString("base64url");return `${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;}
async function callback(token,{cookie=false,error=true}={}){const q=new URLSearchParams({state:token,...(error?{error:"access_denied"}:{})});const r=await fetch(`${base}/api/memory/auth/callback?${q}`,{redirect:"manual",headers:cookie?{cookie:`memory_capsule_state=${token}`}:{}});return {status:r.status,location:r.headers.get("location"),cookie:r.headers.get("set-cookie")};}
const uri=state('/uri');let r=await callback(uri);assert.equal(r.status,302);assert.equal(new URL(r.location).pathname,'/uri');assert.equal(new URL(r.location).search,'?login=expired');assert.doesNotMatch(r.cookie||'',/memory_capsule_session=/);
r=await callback(uri,{cookie:true,error:false});assert.equal(new URL(r.location).pathname,'/uri');assert.equal(new URL(r.location).search,'?login=failed');
r=await callback(state('/memory-capsule'),{cookie:true});assert.equal(new URL(r.location).pathname,'/memory-capsule');
r=await callback(state('/uri').replace(/.$/,'x'));assert.equal(new URL(r.location).pathname,'/memory-capsule');
r=await callback(state('//example.org'));assert.equal(new URL(r.location).origin,base);assert.equal(new URL(r.location).pathname,'/memory-capsule');
console.log('OAuth failure routing passed: missing cookie, missing code, family flow, tampering and external redirect checks.');
