import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LINE profile snapshots refresh after login and stale avatars fall back without a broken image", async () => {
  const [families, callback, auth, page, styles] = await Promise.all([
    readFile(new URL("../app/api/memory/families.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/memory/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/memory/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/memory-capsule/MemoryCapsuleApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(families, /export async function refreshMemoryMemberProfile/);
  assert.match(families, /eq\(memoryFamilyMembers\.lineSubject, identity\.subject\)/);
  assert.match(families, /avatarUrl: identity\.avatarUrl/);
  assert.match(callback, /await refreshMemoryMemberProfile\(identity\)/);
  assert.match(auth, /https:\/\/api\.line\.me\/v2\/profile/);
  assert.match(auth, /currentProfile\.userId === profile\.sub/);
  assert.match(auth, /authorization: `Bearer \$\{tokens\.access_token\}`/);
  assert.doesNotMatch(auth, /return \{[^}]*access_token/);
  assert.match(page, /const \[failedSource, setFailedSource\] = useState<string \| null>\(null\)/);
  assert.match(page, /onError=\{\(\) => setFailedSource\(src\)\}/);
  assert.match(page, /memory-avatar-fallback/);
  assert.match(styles, /\.memory-avatar \{[^}]*aspect-ratio:1 \/ 1[^}]*object-fit:cover[^}]*object-position:center center[^}]*image-orientation:from-image/);
});
