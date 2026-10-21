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

test("media previews are generated privately and optional previews never block original memories", async () => {
  const [upload, dashboard, page] = await Promise.all([
    readFile(new URL("../app/api/memory/families/[familyId]/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/memory/families/[familyId]/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/memory-capsule/MemoryCapsuleApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(upload, /thumbnailUploadUrl/);
  assert.match(upload, /thumb\.webp/);
  assert.match(upload, /signedR2Url\("PUT", thumbnailKey/);
  assert.match(dashboard, /thumbnailUrl: await signedR2Url\("GET"/);
  assert.match(page, /const THUMBNAIL_MAX_EDGE = 1200/);
  assert.match(page, /canvas\.toBlob\(resolve, "image\/webp", \.8\)/);
  assert.match(page, /async function videoThumbnail/);
  assert.match(page, /const thumbnailPromise = createThumbnail\(file\)/);
  assert.match(page, /await fetch\(prepared\.thumbnailUploadUrl/);
  assert.match(page, /\.catch\(\(\) => undefined\)/);
  assert.match(page, /poster=\{item\.thumbnailUrl \|\| undefined\}/);
  assert.match(page, /\[source, setSource\] = useState<"thumbnail" \| "original" \| "unavailable">/);
  assert.match(page, /current === "thumbnail" && item\.url \? "original" : "unavailable"/);
  assert.match(page, /memory-photo-unavailable/);
});

test("photo galleries never show browser broken-image chrome and viewer controls stay aligned", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/memory-capsule/MemoryCapsuleApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /照片預覽暫不可用/);
  assert.match(page, /onTouchStart=/);
  assert.match(page, /onTouchEnd=/);
  assert.match(page, /event\.key === "ArrowLeft"/);
  assert.match(page, /event\.key === "ArrowRight"/);
  assert.match(page, /memory-photo-viewer-arrow/);
  assert.match(page, /viewerImageFailed/);
  assert.match(page, /這台裝置無法預覽原圖/);
  assert.match(page, /onOpen=\{\(\) => openViewer\(item\.id\)\}/);
  assert.match(styles, /\.memory-photo-viewer-close,\.memory-photo-viewer-arrow \{[^}]*display:grid; place-items:center/);
  assert.match(styles, /\.memory-photo-viewer-unavailable a \{[^}]*display:grid; place-items:center/);
  assert.match(styles, /@media \(max-width:680px\).*?\.memory-photo-viewer \{[^}]*padding:12px/s);
});
