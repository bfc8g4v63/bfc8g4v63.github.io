"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Membership = { id: string; familyId: string; role: string; displayName: string; avatarUrl: string; familyName: string };
type Session = { signedIn: boolean; setupRequired?: boolean; profile?: { displayName: string; avatarUrl: string }; memberships?: Membership[] };
type Capsule = { id: string; title: string; introduction: string; eraLabel: string; mediaCount: number };
type Media = { id: string; capsuleId: string; originalFilename: string; mimeType: string; title: string; description: string; createdAt: string; authorName: string; authorAvatar: string; url: string };
type Dashboard = { family: { id: string; displayName: string }; membership: Membership; capsules: Capsule[]; media: Media[] };

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "請稍後再試");
  return body;
}

function Avatar({ name, src, small = false }: { name: string; src?: string; small?: boolean }) {
  return src ? <img className={`memory-avatar${small ? " small" : ""}`} src={src} alt={`${name} 的 LINE 頭像`} referrerPolicy="no-referrer" />
    : <span className={`memory-avatar memory-avatar-fallback${small ? " small" : ""}`} aria-label={name}>{name.slice(0, 1)}</span>;
}

export function MemoryCapsuleApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedCapsuleId, setSelectedCapsuleId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const activeCapsule = useMemo(() => dashboard?.capsules.find((capsule) => capsule.id === selectedCapsuleId) || dashboard?.capsules[0], [dashboard, selectedCapsuleId]);

  const refresh = async () => {
    setIsLoading(true); setError("");
    try {
      const nextSession = await json<Session>("/api/memory/auth/session");
      setSession(nextSession);
      const familyId = nextSession.memberships?.[0]?.familyId;
      if (nextSession.signedIn && familyId) {
        const nextDashboard = await json<Dashboard>(`/api/memory/families/${familyId}/dashboard`);
        setDashboard(nextDashboard);
        setSelectedCapsuleId((current) => current || nextDashboard.capsules[0]?.id || "");
      } else setDashboard(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暫時無法載入回憶膠囊");
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const login = new URLSearchParams(window.location.search).get("login");
    if (login === "expired") setError("LINE 登入逾時，請再按一次「使用 LINE 進入」。");
    if (login === "failed") setError("LINE 登入沒有完成，請確認驗證碼後再試一次。");
  }, []);

  const login = () => { window.location.assign(`/api/memory/auth/start?returnTo=${encodeURIComponent("/memory-capsule")}`); };
  const logout = async () => { await fetch("/api/memory/auth/logout", { method: "POST" }); await refresh(); };

  const uploadPhotos = async (event: FormEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!dashboard || !activeCapsule || !files.length) return;
    setUploading(true); setError("");
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const contentType = file.type.toLowerCase();
        setProgress(`正在上傳 ${index + 1}／${files.length}：${file.name}`);
        const prepared = await json<{ mediaId: string; uploadUrl: string }>(`/api/memory/families/${dashboard.family.id}/uploads`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ capsuleId: activeCapsule.id, filename: file.name, mimeType: contentType, byteSize: file.size }),
        });
        const put = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: file });
        if (!put.ok) throw new Error(`${file.name} 上傳失敗，請稍後重試`);
        await json(`/api/memory/families/${dashboard.family.id}/uploads/${prepared.mediaId}/complete`, { method: "POST" });
      }
      setProgress("相片已放進回憶膠囊");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "相片上傳失敗");
    } finally { setUploading(false); }
  };

  if (isLoading) return <main className="memory-page"><p className="memory-loading">正在打開家族回憶⋯</p></main>;
  if (session?.setupRequired) return <main className="memory-page"><section className="memory-empty"><p className="memory-kicker">水金呼吸</p><h1>回憶膠囊正在準備</h1><p>家族管理者正在完成安全設定，請稍後回來。</p></section></main>;
  if (!session?.signedIn) return <main className="memory-page memory-welcome"><section className="memory-welcome-card">
    <p className="memory-kicker">水金呼吸・回憶膠囊</p><h1>把相聚，留給未來的家人。</h1><p>這是陳水金家族的私密回憶空間。使用 LINE 登入後，受邀家人可以看照片、上傳新回憶與留下想說的話。</p>
    {error && <p className="memory-error" role="alert">{error}</p>}<div className="memory-cta-wrap"><button className="memory-primary" onClick={login}>使用 LINE 進入</button></div><small>不需要新帳號或密碼；Face ID／Touch ID 仍由你的裝置與 LINE 負責。</small>
  </section></main>;
  if (!dashboard) return <main className="memory-page"><section className="memory-empty"><Avatar name={session.profile?.displayName || "家人"} src={session.profile?.avatarUrl} /><p className="memory-kicker">已使用 LINE 登入</p><h1>等待家族邀請</h1><p>請從家族管理者提供的邀請連結重新開啟，完成加入後就能看到回憶膠囊。</p><div className="memory-cta-wrap"><button className="memory-secondary" onClick={logout}>切換 LINE 帳號</button></div></section></main>;

  const visibleMedia = dashboard.media.filter((item) => item.capsuleId === activeCapsule?.id);
  return <main className="memory-page">
    <header className="memory-header"><a className="memory-brand" href="/memory-capsule"><span>水</span><b>水金呼吸</b><small>回憶膠囊</small></a><div className="memory-member"><Avatar name={dashboard.membership.displayName} src={dashboard.membership.avatarUrl} small /><span>{dashboard.membership.displayName}</span><button onClick={logout}>登出</button></div></header>
    <section className="memory-hero"><div><p className="memory-kicker">{dashboard.family.displayName}</p><h1>我們的回憶，<em>一直都在。</em></h1><p>照片只屬於受邀家人。每一張相片都會保留上傳者的 LINE 暱稱與時間。</p></div><div className="memory-hero-orb" aria-hidden="true">水</div></section>
    {error && <p className="memory-error" role="alert">{error}</p>}
    <section className="memory-section"><div className="memory-section-heading"><div><p className="memory-kicker">家族膠囊</p><h2>一起打開的回憶</h2></div></div>
      <div className="memory-capsules">{dashboard.capsules.map((capsule) => <button key={capsule.id} className={`memory-capsule${activeCapsule?.id === capsule.id ? " active" : ""}`} onClick={() => setSelectedCapsuleId(capsule.id)}><span className="memory-capsule-icon">宴</span><span><b>{capsule.title}</b><small>{capsule.eraLabel || "家族回憶"}・{capsule.mediaCount} 張相片</small></span></button>)}</div>
    </section>
    {activeCapsule && <section className="memory-capsule-detail"><div className="memory-section-heading"><div><p className="memory-kicker">{activeCapsule.eraLabel || "回憶膠囊"}</p><h2>{activeCapsule.title}</h2><p>{activeCapsule.introduction || "等待家人放進第一張相片。"}</p></div><div className="memory-cta-wrap"><button className="memory-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "上傳中⋯" : "＋ 新增相片"}</button></div></div>
      <input ref={fileInput} className="memory-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { void uploadPhotos(event); }} />
      {progress && <p className="memory-upload-status" aria-live="polite">{progress}</p>}
      {visibleMedia.length ? <div className="memory-media-grid">{visibleMedia.map((item) => <article className="memory-media-card" key={item.id}><img src={item.url} alt={item.title || item.description || item.originalFilename} /><div><p>{item.title || item.originalFilename}</p><span><Avatar name={item.authorName} src={item.authorAvatar} small />{item.authorName}・{new Date(item.createdAt).toLocaleDateString("zh-TW")}</span></div></article>)}</div> : <div className="memory-empty memory-empty-compact"><p className="memory-empty-mark">◌</p><h3>第一張相片，從這裡開始</h3><p>選擇相片後會立即顯示在家族膠囊，管理者可在之後協助整理。</p><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => fileInput.current?.click()}>選擇相片</button></div></div>}
    </section>}
  </main>;
}
