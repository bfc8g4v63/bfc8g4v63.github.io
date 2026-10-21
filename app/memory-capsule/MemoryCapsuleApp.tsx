"use client";

import qrcode from "qrcode-generator";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Membership = { id: string; familyId: string; role: string; displayName: string; avatarUrl: string; familyName: string };
type Session = { signedIn: boolean; setupRequired?: boolean; profile?: { displayName: string; avatarUrl: string }; memberships?: Membership[] };
type MemoryComment = { id: string; mediaId: string | null; capsuleId: string | null; body: string; displayAs: string; kind: "comment" | "memory"; createdAt: string; authorMemberId: string; authorName: string; authorAvatar: string };
type Capsule = { id: string; title: string; introduction: string; eraLabel: string; coverMediaId: string | null; coverUrl: string; mediaCount: number; comments: MemoryComment[] };
type Media = { id: string; capsuleId: string; authorMemberId: string; originalFilename: string; mimeType: string; title: string; description: string; capturedAt: string | null; createdAt: string; authorName: string; authorAvatar: string; url: string; thumbnailUrl: string; downloadUrl: string; comments: MemoryComment[]; heartCount: number; heartedByMe: boolean };
type Dashboard = { family: { id: string; displayName: string }; storage: { usedBytes: number; quotaBytes: number }; membership: Membership; capsules: Capsule[]; media: Media[] };
type Invite = { id: string; role: "admin" | "member"; maxUses: number; useCount: number; expiresAt: string; revokedAt: string | null; createdAt: string };
type FamilyMember = { id: string; displayName: string; avatarUrl: string; role: "owner" | "admin" | "member"; isActive: boolean; joinedAt: string };
type Report = { id: string; targetType: "media" | "comment"; targetId: string; reason: string; status: string; createdAt: string; reporterName: string; target: { hiddenAt: string | null; deletedAt: string | null } | null };
type Retention = { mediaCount: number; commentCount: number; retentionDays: number; eligibleBefore: string };
type UploadEntry = { id: string; file: File; capsuleId: string; status: "queued" | "preparing" | "uploading" | "complete" | "failed"; progress: number; error?: string; prepared?: { mediaId: string; uploadUrl: string; thumbnailUploadUrl?: string } };

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "請稍後再試");
  return body;
}

function Avatar({ name, src, small = false }: { name: string; src?: string; small?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => { setFailedSource(null); }, [src]);
  const avatarClass = `memory-avatar${small ? " small" : ""}`;
  if (src && failedSource !== src) {
    return <img className={avatarClass} src={src} alt={`${name} 的 LINE 頭像`} referrerPolicy="no-referrer" onError={() => setFailedSource(src)} />;
  }
  return <span className={`${avatarClass} memory-avatar-fallback`} aria-label={name}>{name.trim().slice(0, 1) || "家"}</span>;
}

function MediaPhoto({ item, onOpen }: { item: Media; onOpen?: () => void }) {
  const [source, setSource] = useState<"thumbnail" | "original" | "unavailable">(() => item.thumbnailUrl ? "thumbnail" : item.url ? "original" : "unavailable");
  useEffect(() => { setSource(item.thumbnailUrl ? "thumbnail" : item.url ? "original" : "unavailable"); }, [item.thumbnailUrl, item.url]);
  const label = item.title || item.description || item.originalFilename;
  const unavailable = <span className="memory-photo-unavailable" role="img" aria-label={`${label}：照片預覽暫不可用`}><i aria-hidden="true">▧</i><b>照片預覽暫不可用</b><small>開啟相簿後可查看原始檔</small></span>;
  if (source === "unavailable") return onOpen ? <button className="memory-photo-preview" type="button" onClick={onOpen} aria-label={`開啟原圖：${label}`}>{unavailable}</button> : unavailable;
  const image = <img src={source === "thumbnail" ? item.thumbnailUrl : item.url} alt={label} loading="lazy" onError={() => setSource((current) => current === "thumbnail" && item.url ? "original" : "unavailable")} />;
  return onOpen ? <button className="memory-photo-preview" type="button" onClick={onOpen} aria-label={`開啟原圖：${label}`}>{image}</button> : image;
}

function MediaVideoPreview({ item }: { item: Media }) {
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => { setPosterFailed(false); }, [item.thumbnailUrl]);
  if (!item.thumbnailUrl || posterFailed) return <span className="memory-recent-video" aria-label={`${item.title || item.originalFilename}：影片`}><i aria-hidden="true">▶</i>影片</span>;
  return <img src={item.thumbnailUrl} alt={`${item.title || item.originalFilename} 的影片封面`} loading="lazy" onError={() => setPosterFailed(true)} />;
}

function formatStorage(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
}

async function videoDurationSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    const finish = (duration: number | null) => { URL.revokeObjectURL(url); resolve(duration); };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) ? probe.duration : null);
    probe.onerror = () => finish(null);
    probe.src = url;
  });
}

const THUMBNAIL_MAX_EDGE = 1200;

async function webpFromCanvas(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height));
  const thumbnailWidth = Math.max(1, Math.round(width * scale));
  const thumbnailHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = thumbnailWidth; canvas.height = thumbnailHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  draw(context, thumbnailWidth, thumbnailHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .8));
  return blob?.type === "image/webp" ? blob : null;
}

async function photoThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await webpFromCanvas(image.naturalWidth, image.naturalHeight, (context, width, height) => context.drawImage(image, 0, 0, width, height));
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

async function videoThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "metadata"; video.src = url;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("video preview unavailable")); });
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) return null;
    video.currentTime = Math.min(Math.max(.1, video.duration * .1), 1);
    await new Promise<void>((resolve, reject) => { video.onseeked = () => resolve(); video.onerror = () => reject(new Error("video seek unavailable")); });
    return await webpFromCanvas(video.videoWidth, video.videoHeight, (context, width, height) => context.drawImage(video, 0, 0, width, height));
  } catch { return null; }
  finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}

async function createThumbnail(file: File) {
  return file.type.startsWith("image/") ? photoThumbnail(file) : file.type.startsWith("video/") ? videoThumbnail(file) : null;
}

export function MemoryCapsuleApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedCapsuleId, setSelectedCapsuleId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [exportCapsuleId, setExportCapsuleId] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadEntry[]>([]);
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteDays, setInviteDays] = useState(7);
  const [inviteUrl, setInviteUrl] = useState("");
  const [communityBusy, setCommunityBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [capsuleBusy, setCapsuleBusy] = useState(false);
  const [editingCapsule, setEditingCapsule] = useState<string | null>(null);
  const [capsuleForm, setCapsuleForm] = useState({ title: "", eraLabel: "", introduction: "", coverMediaId: "" });
  const [mediaEditorId, setMediaEditorId] = useState<string | null>(null);
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, { title: string; description: string; capturedAt: string }>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, { body: string; displayAs: string }>>({});
  const [memoryDraft, setMemoryDraft] = useState({ body: "", displayAs: "" });
  const [quotaGb, setQuotaGb] = useState("20");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerImageFailed, setViewerImageFailed] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const viewerTouchStart = useRef<{ x: number; y: number } | null>(null);

  const activeCapsule = useMemo(() => dashboard?.capsules.find((capsule) => capsule.id === selectedCapsuleId) || dashboard?.capsules[0], [dashboard, selectedCapsuleId]);
  const galleryPhotos = useMemo(() => (dashboard?.media || []).filter((item) => item.capsuleId === activeCapsule?.id && item.mimeType.startsWith("image/")), [dashboard?.media, activeCapsule?.id]);
  const viewerPhoto = viewerIndex === null ? null : galleryPhotos[viewerIndex] || null;
  useEffect(() => { setViewerImageFailed(false); }, [viewerPhoto?.id]);
  const inviteQrDataUrl = useMemo(() => {
    if (!inviteUrl) return "";
    const code = qrcode(0, "M");
    code.addData(inviteUrl);
    code.make();
    return code.createDataURL(5, 2);
  }, [inviteUrl]);
  const memoryYears = useMemo(() => {
    const groups = new Map<string, Capsule[]>();
    for (const capsule of dashboard?.capsules || []) {
      const year = capsule.eraLabel.match(/(?:19|20)\d{2}/)?.[0] || "其他回憶";
      groups.set(year, [...(groups.get(year) || []), capsule]);
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left, "zh-TW"));
  }, [dashboard?.capsules]);

  const moveViewer = (offset: number) => setViewerIndex((current) => {
    if (current === null || !galleryPhotos.length) return null;
    return (current + offset + galleryPhotos.length) % galleryPhotos.length;
  });
  const openViewer = (mediaId: string) => {
    const index = galleryPhotos.findIndex((item) => item.id === mediaId);
    if (index >= 0) setViewerIndex(index);
  };
  useEffect(() => {
    if (viewerIndex === null) return;
    if (!viewerPhoto) { setViewerIndex(null); return; }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, viewerPhoto, galleryPhotos.length]);

  const loadCommunity = async (familyId: string) => {
    const [nextInvites, nextMembers, nextReports] = await Promise.all([
      json<{ invites: Invite[] }>(`/api/memory/families/${familyId}/invites`),
      json<{ members: FamilyMember[] }>(`/api/memory/families/${familyId}/members`),
      json<{ reports: Report[] }>(`/api/memory/families/${familyId}/reports`),
    ]);
    setInvites(nextInvites.invites);
    setMembers(nextMembers.members);
    setReports(nextReports.reports);
  };

  const refresh = async () => {
    setIsLoading(true); setError("");
    try {
      const nextSession = await json<Session>("/api/memory/auth/session");
      setSession(nextSession);
      const familyId = nextSession.memberships?.[0]?.familyId;
      if (nextSession.signedIn && familyId) {
        const nextDashboard = await json<Dashboard>(`/api/memory/families/${familyId}/dashboard`);
        setDashboard(nextDashboard);
        setQuotaGb(String(Math.max(1, Math.round(nextDashboard.storage.quotaBytes / (1024 * 1024 * 1024)))));
        setSelectedCapsuleId((current) => current || nextDashboard.capsules[0]?.id || "");
        if (["owner", "admin"].includes(nextDashboard.membership.role)) await loadCommunity(familyId);
        else { setInvites([]); setMembers([]); }
        if (nextDashboard.membership.role === "owner") setRetention(await json<Retention>(`/api/memory/families/${familyId}/retention`));
        else setRetention(null);
      } else setDashboard(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暫時無法載入回憶膠囊");
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    setInviteCode(params.get("invite") || "");
    if (login === "expired") setError("LINE 登入逾時，請再按一次「使用 LINE 進入」。");
    if (login === "failed") setError("LINE 登入沒有完成，請確認驗證碼後再試一次。");
  }, []);

  const login = () => {
    const url = new URL("/api/memory/auth/start", window.location.origin);
    url.searchParams.set("returnTo", "/memory-capsule");
    if (inviteCode) url.searchParams.set("invite", inviteCode);
    window.location.assign(url.toString());
  };
  const logout = async () => { await fetch("/api/memory/auth/logout", { method: "POST" }); await refresh(); };
  const createInvite = async () => {
    if (!dashboard) return;
    setCommunityBusy(true); setError(""); setCopied(false);
    try {
      const result = await json<{ inviteUrl: string }>(`/api/memory/families/${dashboard.family.id}/invites`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: inviteRole, maxUses: 1, expiresAt: new Date(Date.now() + inviteDays * 24 * 60 * 60 * 1000).toISOString() }),
      });
      setInviteUrl(result.inviteUrl);
      await loadCommunity(dashboard.family.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法建立邀請連結");
    } finally { setCommunityBusy(false); }
  };
  const copyInvite = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); }
    catch { setError("無法自動複製，請長按下方連結後複製。"); }
  };
  const revokeInvite = async (inviteId: string) => {
    if (!dashboard || !window.confirm("撤銷後，這個邀請連結將無法再加入家族。要繼續嗎？")) return;
    setCommunityBusy(true); setError("");
    try {
      await json(`/api/memory/families/${dashboard.family.id}/invites?inviteId=${encodeURIComponent(inviteId)}`, { method: "DELETE" });
      if (inviteUrl) setInviteUrl("");
      await loadCommunity(dashboard.family.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法撤銷邀請"); }
    finally { setCommunityBusy(false); }
  };
  const updateMember = async (memberId: string, patch: { role?: "admin" | "member"; isActive?: boolean }) => {
    if (!dashboard) return;
    setCommunityBusy(true); setError("");
    try {
      await json(`/api/memory/families/${dashboard.family.id}/members`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId, ...patch }) });
      await loadCommunity(dashboard.family.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法更新家人權限"); }
    finally { setCommunityBusy(false); }
  };
  const resetCapsuleForm = () => { setEditingCapsule(null); setCapsuleForm({ title: "", eraLabel: "", introduction: "", coverMediaId: "" }); };
  const openCapsuleEditor = (capsule?: Capsule) => {
    setEditingCapsule(capsule?.id || "new");
    setCapsuleForm(capsule ? { title: capsule.title, eraLabel: capsule.eraLabel, introduction: capsule.introduction, coverMediaId: capsule.coverMediaId || "" } : { title: "", eraLabel: "", introduction: "", coverMediaId: "" });
  };
  const saveCapsule = async () => {
    if (!dashboard || !capsuleForm.title.trim()) return setError("請輸入回憶膠囊名稱");
    setCapsuleBusy(true); setError("");
    try {
      if (editingCapsule === "new") {
        const result = await json<{ capsule: Capsule }>(`/api/memory/families/${dashboard.family.id}/capsules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(capsuleForm) });
        setSelectedCapsuleId(result.capsule.id);
      } else if (editingCapsule) {
        await json(`/api/memory/families/${dashboard.family.id}/capsules`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ capsuleId: editingCapsule, ...capsuleForm }) });
      }
      resetCapsuleForm(); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法儲存回憶膠囊"); }
    finally { setCapsuleBusy(false); }
  };
  const moveCapsule = async (capsuleId: string, direction: "up" | "down") => {
    if (!dashboard) return;
    setCapsuleBusy(true); setError("");
    try { await json(`/api/memory/families/${dashboard.family.id}/capsules`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ capsuleId, action: "move", direction }) }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法調整膠囊順序"); }
    finally { setCapsuleBusy(false); }
  };
  const openMediaEditor = (media: Media) => { setMediaEditorId(media.id); setMediaDrafts((drafts) => ({ ...drafts, [media.id]: { title: media.title, description: media.description, capturedAt: media.capturedAt || "" } })); };
  const saveMedia = async (mediaId: string) => {
    const draft = mediaDrafts[mediaId]; if (!draft) return;
    setError("");
    try { await json(`/api/memory/media/${mediaId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }); setMediaEditorId(null); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法儲存回憶資料"); }
  };
  const deleteMedia = async (media: Media) => {
    if (!window.confirm(`確定從家族頁面移除「${media.title || media.originalFilename}」嗎？之後管理者可在保留區處理。`)) return;
    setError("");
    try { await json(`/api/memory/media/${media.id}`, { method: "DELETE" }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法刪除回憶"); }
  };
  const toggleHeart = async (media: Media) => {
    if (!dashboard) return;
    setError("");
    try { await json(`/api/memory/families/${dashboard.family.id}/reactions${media.heartedByMe ? `?targetId=${encodeURIComponent(media.id)}` : ""}`, media.heartedByMe ? { method: "DELETE" } : { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "media", targetId: media.id }) }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法更新愛心"); }
  };
  const submitComment = async (target: { mediaId?: string; capsuleId?: string }, kind: "comment" | "memory", draftKey: string) => {
    if (!dashboard) return;
    const draft = draftKey === "memory" ? memoryDraft : commentDrafts[draftKey] || { body: "", displayAs: "" };
    if (!draft.body.trim()) return;
    setError("");
    try {
      await json(`/api/memory/families/${dashboard.family.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...target, kind, ...draft }) });
      if (draftKey === "memory") setMemoryDraft({ body: "", displayAs: "" }); else setCommentDrafts((drafts) => ({ ...drafts, [draftKey]: { body: "", displayAs: "" } }));
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法留下這段回憶"); }
  };
  const deleteComment = async (commentId: string) => {
    if (!window.confirm("確定移除這則留言嗎？")) return;
    setError("");
    try { await json(`/api/memory/comments/${commentId}`, { method: "DELETE" }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法刪除留言"); }
  };
  const saveQuota = async () => {
    if (!dashboard) return;
    try { await json(`/api/memory/families/${dashboard.family.id}/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ storageQuotaBytes: Number(quotaGb) * 1024 * 1024 * 1024 }) }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法更新容量上限"); }
  };
  const purgeRetention = async () => {
    if (!dashboard || !retention || !window.confirm(`這會永久刪除已保留超過 ${retention.retentionDays} 天的 ${retention.mediaCount} 份媒體與 ${retention.commentCount} 則留言，且無法復原。要繼續嗎？`)) return;
    setRetentionBusy(true); setError("");
    try { await json(`/api/memory/families/${dashboard.family.id}/retention`, { method: "POST" }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法永久清理保留內容"); }
    finally { setRetentionBusy(false); }
  };
  const exportHref = dashboard ? `/api/memory/families/${dashboard.family.id}/export${exportCapsuleId ? `?capsuleId=${encodeURIComponent(exportCapsuleId)}` : ""}` : "#";
  const startExport = async () => {
    if (!dashboard) return;
    setExportBusy(true); setError("");
    try {
      const checkUrl = `${exportHref}${exportHref.includes("?") ? "&" : "?"}check=1`;
      await json(checkUrl);
      window.location.assign(exportHref);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法建立私密備份"); }
    finally { setExportBusy(false); }
  };
  const reportContent = async (targetType: "media" | "comment", targetId: string) => {
    if (!dashboard) return;
    const reason = window.prompt("請簡短說明回報原因（將只提供家族管理者處理）：");
    if (!reason?.trim()) return;
    try { await json(`/api/memory/families/${dashboard.family.id}/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetId, reason }) }); setError("已送出回報，家族管理者會處理。"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法送出回報"); }
  };
  const resolveReport = async (reportId: string, action: "hide" | "restore" | "dismiss") => {
    if (!dashboard) return;
    try { await json(`/api/memory/families/${dashboard.family.id}/reports`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, action }) }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "無法處理回報"); }
  };

  const updateUpload = (id: string, patch: Partial<UploadEntry>) => setUploadQueue((entries) => entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  const uploadOne = async (entry: UploadEntry) => {
    if (!dashboard) return false;
    const file = entry.file;
    const contentType = file.type.toLowerCase();
    updateUpload(entry.id, { status: "preparing", progress: 0, error: "" });
    try {
      if (contentType.startsWith("video/")) {
        const duration = await videoDurationSeconds(file);
        if (duration && duration > 15 * 60) throw new Error("超過 15 分鐘，請先裁剪後再上傳");
      }
      // Preview generation stays on the member's device and runs alongside
      // the original upload. If a format cannot supply a preview, the
      // original remains fully usable and the feed simply falls back to it.
      const thumbnailPromise = createThumbnail(file);
      const prepared = entry.prepared || await json<{ mediaId: string; uploadUrl: string; thumbnailUploadUrl?: string }>(`/api/memory/families/${dashboard.family.id}/uploads`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ capsuleId: entry.capsuleId, filename: file.name, mimeType: contentType, byteSize: file.size, thumbnail: true }),
      });
      updateUpload(entry.id, { prepared, status: "uploading" });
      let uploaded = false;
      let uploadFailure: Error | null = null;
      for (let attempt = 0; attempt < 2 && !uploaded; attempt += 1) {
        if (attempt) updateUpload(entry.id, { status: "uploading", progress: 0, error: "正在重試…" });
        try {
          await new Promise<void>((resolve, reject) => {
            const upload = new XMLHttpRequest();
            upload.open("PUT", prepared.uploadUrl);
            upload.setRequestHeader("content-type", contentType);
            upload.upload.onprogress = (progressEvent) => {
              if (!progressEvent.lengthComputable) return;
              updateUpload(entry.id, { status: "uploading", progress: Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100)) });
            };
            upload.onerror = () => reject(new Error("無法連線至私有儲存空間"));
            upload.onload = () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error(`安全儲存回應 ${upload.status || "不明"}`));
            upload.send(file);
          });
          uploaded = true;
        } catch (reason) { uploadFailure = reason instanceof Error ? reason : new Error("上傳失敗"); }
      }
      if (!uploaded) throw uploadFailure || new Error("上傳失敗");
      const thumbnail = await thumbnailPromise;
      if (thumbnail && prepared.thumbnailUploadUrl) {
        // A preview must never block the original memory. The server returns a
        // one-object private URL; the browser does not retain it after upload.
        await fetch(prepared.thumbnailUploadUrl, { method: "PUT", headers: { "content-type": "image/webp" }, body: thumbnail }).catch(() => undefined);
      }
      await json(`/api/memory/families/${dashboard.family.id}/uploads/${prepared.mediaId}/complete`, { method: "POST" });
      updateUpload(entry.id, { status: "complete", progress: 100, error: "" });
      return true;
    } catch (reason) {
      updateUpload(entry.id, { status: "failed", error: reason instanceof Error ? reason.message : "上傳失敗，請稍後重試" });
      return false;
    }
  };
  const runUploads = async (entries: UploadEntry[]) => {
    setUploading(true); setError("");
    let completed = false;
    for (const entry of entries) completed = (await uploadOne(entry)) || completed;
    if (completed) { setProgress("已把回憶放進家族膠囊"); await refresh(); }
    setUploading(false);
  };
  const uploadMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!dashboard || !activeCapsule || !files.length) return;
    const additions = files.map((file) => ({ id: crypto.randomUUID(), file, capsuleId: activeCapsule.id, status: "queued" as const, progress: 0 }));
    setUploadQueue((entries) => [...entries.filter((entry) => entry.status !== "complete").slice(-5), ...additions]);
    void runUploads(additions);
  };
  const retryUpload = async (id: string) => {
    const entry = uploadQueue.find((item) => item.id === id);
    if (!entry || uploading) return;
    setUploading(true); setError("");
    // Signed R2 URLs are deliberately short-lived. A manual retry must obtain a
    // fresh URL instead of reusing the failed request's URL after it expires.
    updateUpload(entry.id, { prepared: undefined, progress: 0, error: "" });
    const completed = await uploadOne({ ...entry, prepared: undefined });
    if (completed) { setProgress("已把回憶放進家族膠囊"); await refresh(); }
    setUploading(false);
  };
  const openCapsule = (capsuleId: string) => {
    setSelectedCapsuleId(capsuleId);
    window.setTimeout(() => document.getElementById("memory-active-capsule")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  if (isLoading) return <main className="memory-page"><p className="memory-loading">正在打開家族回憶⋯</p></main>;
  if (session?.setupRequired) return <main className="memory-page"><section className="memory-empty"><p className="memory-kicker">水金呼吸</p><h1>回憶膠囊正在準備</h1><p>家族管理者正在完成安全設定，請稍後回來。</p></section></main>;
  if (!session?.signedIn) return <main className="memory-page memory-welcome"><section className="memory-welcome-card">
    <p className="memory-kicker">水金呼吸・回憶膠囊</p><h1>{inviteCode ? "你受邀加入家族回憶。" : "把相聚，留給未來的家人。"}</h1><p>{inviteCode ? "請用自己的 LINE 帳號登入，即可加入陳水金家族。加入後可以瀏覽照片、上傳新回憶與留下想說的話。" : "這是陳水金家族的私密回憶空間。使用 LINE 登入後，受邀家人可以看照片、上傳新回憶與留下想說的話。"}</p>
    {error && <p className="memory-error" role="alert">{error}</p>}<div className="memory-cta-wrap"><button className="memory-primary" onClick={login}>{inviteCode ? "使用 LINE 接受邀請" : "使用 LINE 進入"}</button></div><small>不需要新帳號或密碼；Face ID／Touch ID 仍由你的裝置與 LINE 負責。</small>
  </section></main>;
  if (!dashboard) return <main className="memory-page"><section className="memory-empty"><Avatar name={session.profile?.displayName || "家人"} src={session.profile?.avatarUrl} /><p className="memory-kicker">已使用 LINE 登入</p><h1>{inviteCode ? "準備加入家族" : "尚未加入家族"}</h1><p>{inviteCode ? "請再按一次按鈕，確認以目前的 LINE 帳號接受家族邀請。" : "請向家族管理者索取專屬邀請連結，再由連結進入。"}</p>{error && <p className="memory-error" role="alert">{error}</p>}{inviteCode && <div className="memory-cta-wrap"><button className="memory-primary" onClick={login}>以 LINE 接受邀請</button></div>}<div className="memory-cta-wrap"><button className="memory-secondary" onClick={logout}>切換 LINE 帳號</button></div></section></main>;

  const visibleMedia = dashboard.media.filter((item) => item.capsuleId === activeCapsule?.id);
  const recentMedia = dashboard.media.slice(0, 6);
  return <main className="memory-page">
    <header className="memory-header"><a className="memory-brand" href="/memory-capsule"><span>水</span><b>水金呼吸</b><small>回憶膠囊</small></a><div className="memory-member"><Avatar name={dashboard.membership.displayName} src={dashboard.membership.avatarUrl} small /><span>{dashboard.membership.displayName}</span><button onClick={logout}>登出</button></div></header>
    <section className="memory-hero"><div><p className="memory-kicker">{dashboard.family.displayName}</p><h1>我們的回憶，<br /><em>一直都在。</em></h1><p>照片與影片只屬於受邀家人。每一份回憶都會保留上傳者的 LINE 暱稱與時間。</p></div><div className="memory-hero-orb" aria-hidden="true">水</div></section>
    {error && <p className="memory-error" role="alert">{error}</p>}
    <section className="memory-discovery" aria-labelledby="memory-discovery-title"><div><p className="memory-kicker">快速找回憶</p><h2 id="memory-discovery-title">先從這裡打開</h2><p>最近放進來的照片、影片，以及按年份整理的家族相聚。</p></div><div className="memory-discovery-grid"><section className="memory-recent"><h3>最近新增</h3>{recentMedia.length ? <div className="memory-recent-list">{recentMedia.map((item) => <button key={item.id} onClick={() => openCapsule(item.capsuleId)}>{item.mimeType.startsWith("image/") ? <MediaPhoto item={item} /> : <MediaVideoPreview item={item} />}<span className="memory-recent-meta"><b>{item.title || item.originalFilename}</b><small>{new Date(item.createdAt).toLocaleDateString("zh-TW")}</small></span></button>)}</div> : <p>第一份回憶正在等家人放進來。</p>}</section><section className="memory-timeline"><h3>年份／活動</h3><div>{memoryYears.map(([year, capsules]) => <article key={year}><b>{year}</b>{capsules.map((capsule) => <button key={capsule.id} onClick={() => openCapsule(capsule.id)}>{capsule.title}<small>{capsule.mediaCount} 項回憶</small></button>)}</article>)}</div></section></div></section>
    {["owner", "admin"].includes(dashboard.membership.role) && <section className="memory-storage" aria-label="家族儲存空間"><div><p className="memory-kicker">家族空間</p><h2>{formatStorage(dashboard.storage.usedBytes)} <small>/ {formatStorage(dashboard.storage.quotaBytes)}</small></h2><p>目前已確認的照片與影片用量。到 80% 和 90% 會顯示提醒，達上限時會暫停新的上傳。</p></div><div className="memory-storage-meter" aria-label={`已使用 ${Math.min(100, Math.round((dashboard.storage.usedBytes / dashboard.storage.quotaBytes) * 100))}%`}><span style={{ width: `${Math.min(100, (dashboard.storage.usedBytes / dashboard.storage.quotaBytes) * 100)}%` }} /></div>{dashboard.storage.usedBytes / dashboard.storage.quotaBytes >= .9 ? <strong className="memory-storage-alert">空間已達 90%，請整理內容或提高容量。</strong> : dashboard.storage.usedBytes / dashboard.storage.quotaBytes >= .8 ? <strong className="memory-storage-alert">空間已達 80%，請留意接下來的影片上傳。</strong> : null}</section>}
    {dashboard.membership.role === "owner" && <section className="memory-storage memory-quota-control" aria-label="調整家族容量"><label>容量上限（GB）<input type="number" min="1" max="1024" value={quotaGb} onChange={(event) => setQuotaGb(event.target.value)} /></label><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => { void saveQuota(); }}>儲存容量上限</button></div></section>}
    {dashboard.membership.role === "owner" && retention && <section className="memory-storage memory-retention" aria-label="30 天保留區"><div><p className="memory-kicker">30 天保留區</p><h2>{retention.mediaCount + retention.commentCount} <small>項可永久清理</small></h2><p>只有已軟刪除且超過 {retention.retentionDays} 天的內容會出現在這裡；清理後無法恢復。</p></div><div className="memory-cta-wrap"><button className="memory-danger-button" disabled={retentionBusy || !(retention.mediaCount + retention.commentCount)} onClick={() => { void purgeRetention(); }}>{retentionBusy ? "清理中⋯" : "永久清理已逾期內容"}</button></div></section>}
    {dashboard.membership.role === "owner" && <section className="memory-storage memory-export" aria-label="下載家族私密備份"><div><p className="memory-kicker">私密備份</p><h2>下載 ZIP 備份</h2><p>ZIP 會包含原始照片／影片和 metadata，不會在 R2 另存公開副本。超過 2 GB 請選單一膠囊分批下載。</p></div><label>備份範圍<select value={exportCapsuleId} onChange={(event) => setExportCapsuleId(event.target.value)} disabled={exportBusy}><option value="">全部家族</option>{dashboard.capsules.map((capsule) => <option key={capsule.id} value={capsule.id}>{capsule.title}</option>)}</select></label><div className="memory-cta-wrap"><button className="memory-secondary" disabled={exportBusy} onClick={() => { void startExport(); }}>{exportBusy ? "準備備份⋯" : "下載 ZIP 備份"}</button></div></section>}
    <section className="memory-section"><div className="memory-section-heading"><div><p className="memory-kicker">家族膠囊</p><h2>一起打開的回憶</h2></div>{["owner", "admin"].includes(dashboard.membership.role) && <div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => openCapsuleEditor()}>＋ 建立膠囊</button></div>}</div>
      {editingCapsule && <section className="memory-editor-card" aria-label={editingCapsule === "new" ? "建立回憶膠囊" : "整理回憶膠囊"}><h3>{editingCapsule === "new" ? "建立新的回憶膠囊" : "整理這顆膠囊"}</h3><label>名稱<input value={capsuleForm.title} maxLength={100} onChange={(event) => setCapsuleForm({ ...capsuleForm, title: event.target.value })} placeholder="例如：2026 過年團圓" /></label><label>日期／年代（選填）<input value={capsuleForm.eraLabel} maxLength={80} onChange={(event) => setCapsuleForm({ ...capsuleForm, eraLabel: event.target.value })} placeholder="例如：2026 年春節" /></label><label>前言（選填）<textarea value={capsuleForm.introduction} maxLength={1200} onChange={(event) => setCapsuleForm({ ...capsuleForm, introduction: event.target.value })} placeholder="寫下這顆膠囊想留給家人的話" /></label>{editingCapsule !== "new" && <label>膠囊封面<select value={capsuleForm.coverMediaId} onChange={(event) => setCapsuleForm({ ...capsuleForm, coverMediaId: event.target.value })}><option value="">使用「宴」字封面</option>{visibleMedia.map((media) => <option key={media.id} value={media.id}>{media.title || media.originalFilename}</option>)}</select></label>}<div className="memory-editor-actions"><button className="memory-secondary" disabled={capsuleBusy} onClick={resetCapsuleForm}>取消</button><button className="memory-primary" disabled={capsuleBusy} onClick={() => { void saveCapsule(); }}>{capsuleBusy ? "儲存中⋯" : "儲存膠囊"}</button></div></section>}
      <div className="memory-capsules">{dashboard.capsules.map((capsule, index) => <article key={capsule.id} className="memory-capsule-card"><button className={`memory-capsule${activeCapsule?.id === capsule.id ? " active" : ""}`} onClick={() => setSelectedCapsuleId(capsule.id)}>{capsule.coverUrl ? <img className="memory-capsule-cover" src={capsule.coverUrl} alt={`${capsule.title} 封面`} /> : <span className="memory-capsule-icon">宴</span>}<span><b>{capsule.title}</b><small>{capsule.eraLabel || "家族回憶"}・{capsule.mediaCount} 項回憶</small></span></button>{["owner", "admin"].includes(dashboard.membership.role) && <div className="memory-capsule-actions"><button onClick={() => openCapsuleEditor(capsule)}>整理</button><button disabled={capsuleBusy || index === 0} onClick={() => { void moveCapsule(capsule.id, "up"); }}>往前</button><button disabled={capsuleBusy || index === dashboard.capsules.length - 1} onClick={() => { void moveCapsule(capsule.id, "down"); }}>往後</button></div>}</article>)}</div>
    </section>
    {["owner", "admin"].includes(dashboard.membership.role) && <section className="memory-community" aria-labelledby="memory-community-title"><div className="memory-section-heading"><div><p className="memory-kicker">家族入口管理</p><h2 id="memory-community-title">邀家人，一起保存回憶</h2><p>每次建立的是一人、一段期限的私密邀請；家人必須用自己的 LINE 登入才會加入。</p></div></div>
      <div className="memory-community-grid"><section className="memory-invite-card"><h3>建立家人邀請</h3><label>有效期限<select value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} disabled={communityBusy}><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option></select></label>
        {dashboard.membership.role === "owner" && <label>加入後的權限<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")} disabled={communityBusy}><option value="member">一般家人</option><option value="admin">共同管理者</option></select></label>}
        <p className="memory-form-hint">連結只可使用 1 次；管理者可隨時撤銷。</p><div className="memory-cta-wrap"><button className="memory-primary" disabled={communityBusy} onClick={() => { void createInvite(); }}>{communityBusy ? "處理中⋯" : "建立邀請連結"}</button></div>
        {inviteUrl && <div className="memory-share-result"><label>傳給家人的專屬連結<input value={inviteUrl} readOnly aria-label="傳給家人的專屬邀請連結" onFocus={(event) => event.currentTarget.select()} /></label><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => { void copyInvite(); }}>{copied ? "已複製連結" : "複製邀請連結"}</button></div><div className="memory-invite-qr"><img src={inviteQrDataUrl} alt="家人邀請連結 QR Code" /><p>也可讓家人用 LINE 掃描。此 QR Code 與連結同樣只能使用一次。</p></div><p>請直接傳給指定家人；不要貼在公開群組或公開貼文。</p></div>}
      </section>
      <section className="memory-members-card"><h3>家人與邀請</h3><div className="memory-member-list">{members.map((member) => <article className="memory-member-row" key={member.id}><Avatar name={member.displayName} src={member.avatarUrl} small /><div><b>{member.displayName}</b><small>{member.role === "owner" ? "總管理者" : member.role === "admin" ? "共同管理者" : "家人"}{member.isActive ? "・使用中" : "・已停用"}</small></div>{dashboard.membership.role === "owner" && member.id !== dashboard.membership.id && <div className="memory-member-actions"><button disabled={communityBusy} onClick={() => { void updateMember(member.id, { role: member.role === "admin" ? "member" : "admin" }); }}>{member.role === "admin" ? "改為家人" : "設為共同管理者"}</button><button className="memory-danger-link" disabled={communityBusy} onClick={() => { void updateMember(member.id, { isActive: !member.isActive }); }}>{member.isActive ? "停用" : "恢復"}</button></div>}</article>)}</div>
        <div className="memory-invite-list">{invites.filter((invite) => !invite.revokedAt && new Date(invite.expiresAt).getTime() > Date.now() && invite.useCount < invite.maxUses).map((invite) => <article key={invite.id}><span><b>{invite.role === "admin" ? "共同管理者邀請" : "家人邀請"}</b><small>尚可使用 {invite.maxUses - invite.useCount} 次・至 {new Date(invite.expiresAt).toLocaleDateString("zh-TW")}</small></span><button className="memory-danger-link" disabled={communityBusy} onClick={() => { void revokeInvite(invite.id); }}>撤銷</button></article>)}</div>
      </section></div>
      {reports.length > 0 && <section className="memory-reports" aria-label="內容回報與保留紀錄"><h3>內容回報</h3>{reports.map((report) => <article key={report.id}><div><b>{report.targetType === "media" ? "照片或影片" : "留言"}・{report.reporterName}</b><p>{report.reason}</p><small>{report.status === "open" ? "等待處理" : report.status === "hidden" ? "已隱藏（30 天保留）" : report.status === "restored" ? "已恢復顯示" : "已結案"}</small></div><div className="memory-member-actions">{report.status === "open" && <><button onClick={() => { void resolveReport(report.id, "hide"); }}>隱藏內容</button><button onClick={() => { void resolveReport(report.id, "dismiss"); }}>無需處理</button></>}{report.status === "hidden" && <button onClick={() => { void resolveReport(report.id, "restore"); }}>恢復顯示</button>}</div></article>)}</section>}
    </section>}
    {activeCapsule && <section id="memory-active-capsule" className="memory-capsule-detail"><div className="memory-section-heading"><div><p className="memory-kicker">{activeCapsule.eraLabel || "回憶膠囊"}</p><h2>{activeCapsule.title}</h2><p>{activeCapsule.introduction || "等待家人放進第一份回憶。"}</p></div></div>
      <section className="memory-upload-panel" aria-label="新增照片或影片"><div><h3>放進一份新回憶</h3><p>先選照片或影片；系統會一份一份安全上傳，失敗可直接重試。</p></div><div className="memory-upload-actions"><button className="memory-primary" disabled={uploading} onClick={() => photoInput.current?.click()}>{uploading ? "上傳中⋯" : "＋ 新增照片"}</button><button className="memory-secondary" disabled={uploading} onClick={() => videoInput.current?.click()}>＋ 新增影片</button></div></section>
      <input ref={photoInput} className="memory-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={uploadMedia} />
      <input ref={videoInput} className="memory-file-input" type="file" accept="video/mp4,video/quicktime" multiple onChange={uploadMedia} />
      {progress && <p className="memory-upload-status" aria-live="polite">{progress}</p>}
      {uploadQueue.length > 0 && <section className="memory-upload-queue" aria-label="媒體上傳進度"><h3>上傳進度</h3>{uploadQueue.map((item) => <article key={item.id}><div><b>{item.file.name}</b><small>{item.status === "queued" || item.status === "preparing" ? "正在準備" : item.status === "uploading" ? item.error || `正在上傳 ${item.progress}%` : item.status === "complete" ? "已加入家族膠囊" : `尚未成功：${item.error}`}</small></div>{item.status === "uploading" && <span className="memory-upload-meter" aria-label={`上傳 ${item.progress}%`}><i style={{ width: `${item.progress}%` }} /></span>}{item.status === "failed" && <button className="memory-secondary" disabled={uploading} onClick={() => { void retryUpload(item.id); }}>重試這一份</button>}</article>)}</section>}
      <section className="memory-text-memory"><h3>寫下一段文字回憶</h3><p>直接以你的 LINE 暱稱留下心裡的話；若是替長輩代傳，可填上長輩稱呼。</p><textarea value={memoryDraft.body} maxLength={1200} onChange={(event) => setMemoryDraft({ ...memoryDraft, body: event.target.value })} placeholder="例如：那天大家笑得好開心⋯" /><input value={memoryDraft.displayAs} maxLength={80} onChange={(event) => setMemoryDraft({ ...memoryDraft, displayAs: event.target.value })} placeholder="替長輩代傳時，填入長輩稱呼（選填）" /><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => { void submitComment({ capsuleId: activeCapsule.id }, "memory", "memory"); }}>保存文字回憶</button></div></section>
      {activeCapsule.comments.filter((comment) => comment.kind === "memory").length > 0 && <section className="memory-memory-feed" aria-label="家族文字回憶"><h3>家人留下的話</h3>{activeCapsule.comments.filter((comment) => comment.kind === "memory").map((comment) => <article key={comment.id}><Avatar name={comment.authorName} src={comment.authorAvatar} small /><div><b>{comment.displayAs ? `${comment.displayAs}（由 ${comment.authorName} 代傳）` : comment.authorName}</b><p>{comment.body}</p><small>{new Date(comment.createdAt).toLocaleString("zh-TW")}</small></div>{(comment.authorMemberId === dashboard.membership.id || ["owner", "admin"].includes(dashboard.membership.role)) && <button className="memory-danger-link" onClick={() => { void deleteComment(comment.id); }}>移除</button>}</article>)}</section>}
      {visibleMedia.length ? <div className="memory-media-grid">{visibleMedia.map((item) => <article className="memory-media-card" key={item.id}>
        {item.mimeType.startsWith("video/") ? <><video controls playsInline preload="metadata" poster={item.thumbnailUrl || undefined} src={item.url} aria-label={item.title || item.originalFilename}>你的瀏覽器無法直接播放這支影片。</video><div className="memory-video-fallback"><a className="memory-secondary" href={item.downloadUrl} download={item.originalFilename}>播放不相容？下載原始影片</a></div></> : <MediaPhoto item={item} onOpen={() => openViewer(item.id)} />}
        <div><p>{item.title || item.originalFilename}</p>{item.description && <p className="memory-media-description">{item.description}</p>}{item.capturedAt && <small className="memory-captured-at">拍攝日期 {item.capturedAt}</small>}<span><Avatar name={item.authorName} src={item.authorAvatar} small />{item.authorName}・{new Date(item.createdAt).toLocaleDateString("zh-TW")}</span>
          <div className="memory-media-actions"><button className={item.heartedByMe ? "hearted" : ""} onClick={() => { void toggleHeart(item); }}>{item.heartedByMe ? "♥ 已喜歡" : "♡ 喜歡"}{item.heartCount ? ` ${item.heartCount}` : ""}</button><button onClick={() => { void reportContent("media", item.id); }}>回報</button>{(item.authorMemberId === dashboard.membership.id || ["owner", "admin"].includes(dashboard.membership.role)) && <><button onClick={() => openMediaEditor(item)}>編輯</button><button className="memory-danger-link" onClick={() => { void deleteMedia(item); }}>移除</button></>}</div>
          {mediaEditorId === item.id && mediaDrafts[item.id] && <section className="memory-media-editor"><label>標題<input value={mediaDrafts[item.id].title} onChange={(event) => setMediaDrafts((drafts) => ({ ...drafts, [item.id]: { ...drafts[item.id], title: event.target.value } }))} /></label><label>拍攝日期<input type="date" value={mediaDrafts[item.id].capturedAt} onChange={(event) => setMediaDrafts((drafts) => ({ ...drafts, [item.id]: { ...drafts[item.id], capturedAt: event.target.value } }))} /></label><label>回憶描述<textarea value={mediaDrafts[item.id].description} onChange={(event) => setMediaDrafts((drafts) => ({ ...drafts, [item.id]: { ...drafts[item.id], description: event.target.value } }))} /></label><div className="memory-editor-actions"><button className="memory-secondary" onClick={() => setMediaEditorId(null)}>取消</button><button className="memory-primary" onClick={() => { void saveMedia(item.id); }}>儲存內容</button></div></section>}
          <section className="memory-comments"><h3>留言{item.comments.length ? ` ${item.comments.length}` : ""}</h3>{item.comments.map((comment) => <article key={comment.id}><Avatar name={comment.authorName} src={comment.authorAvatar} small /><div><b>{comment.displayAs ? `${comment.displayAs}（由 ${comment.authorName} 代傳）` : comment.authorName}</b><p>{comment.body}</p></div><button onClick={() => { void reportContent("comment", comment.id); }}>回報</button>{(comment.authorMemberId === dashboard.membership.id || ["owner", "admin"].includes(dashboard.membership.role)) && <button className="memory-danger-link" onClick={() => { void deleteComment(comment.id); }}>移除</button>}</article>)}<textarea value={commentDrafts[item.id]?.body || ""} maxLength={1200} onChange={(event) => setCommentDrafts((drafts) => ({ ...drafts, [item.id]: { body: event.target.value, displayAs: drafts[item.id]?.displayAs || "" } }))} placeholder="留下想說的話" /><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => { void submitComment({ mediaId: item.id }, "comment", item.id); }}>送出留言</button></div></section>
        </div></article>)}</div> : <div className="memory-empty memory-empty-compact"><p className="memory-empty-mark">◌</p><h3>第一份回憶，從這裡開始</h3><p>先選照片或影片，成功後會立即顯示在家族膠囊。</p><div className="memory-upload-actions"><button className="memory-primary" onClick={() => photoInput.current?.click()}>選擇照片</button><button className="memory-secondary" onClick={() => videoInput.current?.click()}>選擇影片</button></div></div>}
    </section>}
    {viewerPhoto && <section className="memory-photo-viewer" role="dialog" aria-modal="true" aria-label={`查看原圖：${viewerPhoto.title || viewerPhoto.originalFilename}`} onClick={(event) => { if (event.target === event.currentTarget) setViewerIndex(null); }}>
      <div className="memory-photo-viewer-stage" onTouchStart={(event) => { const touch = event.touches[0]; viewerTouchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const start = viewerTouchStart.current; const touch = event.changedTouches[0]; viewerTouchStart.current = null; if (!start || !touch) return; const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) moveViewer(deltaX > 0 ? -1 : 1); }}>
        <button className="memory-photo-viewer-close" type="button" onClick={() => setViewerIndex(null)} aria-label="關閉原圖">×</button>
        {galleryPhotos.length > 1 && <button className="memory-photo-viewer-arrow previous" type="button" onClick={() => moveViewer(-1)} aria-label="上一張照片">‹</button>}
        <figure>{viewerImageFailed ? <div className="memory-photo-viewer-unavailable"><i aria-hidden="true">▧</i><b>這台裝置無法預覽原圖</b><a href={viewerPhoto.downloadUrl} download={viewerPhoto.originalFilename}>下載原始照片</a></div> : <img src={viewerPhoto.url} alt={viewerPhoto.title || viewerPhoto.description || viewerPhoto.originalFilename} onError={() => setViewerImageFailed(true)} />}<figcaption>{viewerPhoto.title || viewerPhoto.originalFilename}<small>{viewerIndex! + 1} / {galleryPhotos.length}・左右滑動或按方向鍵換照片</small></figcaption></figure>
        {galleryPhotos.length > 1 && <button className="memory-photo-viewer-arrow next" type="button" onClick={() => moveViewer(1)} aria-label="下一張照片">›</button>}
      </div>
    </section>}
  </main>;
}
