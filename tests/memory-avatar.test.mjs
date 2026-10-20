import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LINE profile snapshots refresh after login and stale avatars fall back without a broken image", async () => {
  const [families, callback, page] = await Promise.all([
    readFile(new URL("../app/api/memory/families.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/memory/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/memory-capsule/MemoryCapsuleApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(families, /export async function refreshMemoryMemberProfile/);
  assert.match(families, /eq\(memoryFamilyMembers\.lineSubject, identity\.subject\)/);
  assert.match(families, /avatarUrl: identity\.avatarUrl/);
  assert.match(callback, /await refreshMemoryMemberProfile\(identity\)/);
  assert.match(page, /const \[failedSource, setFailedSource\] = useState<string \| null>\(null\)/);
  assert.match(page, /onError=\{\(\) => setFailedSource\(src\)\}/);
  assert.match(page, /memory-avatar-fallback/);
});
