"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Membership = { id: string; familyId: string; role: string; displayName: string; avatarUrl: string; familyName: string };
type Session = { signedIn: boolean; setupRequired?: boolean; profile?: { displayName: string; avatarUrl: string }; memberships?: Membership[] };
type Capsule = { id: string; title: string; introduction: string; eraLabel: string; mediaCount: number };
type Media = { id: string; capsuleId: string; originalFilename: string; mimeType: string; title: string; description: string; createdAt: string; authorName: string; authorAvatar: string; url: string };
type Dashboard = { family: { id: string; displayName: string }; membership: Membership; capsules: Capsule[]; media: Media[] };
type Invite = { id: string; role: "admin" | "member"; maxUses: number; useCount: number; expiresAt: string; revokedAt: string | null; createdAt: string };
type FamilyMember = { id: string; displayName: string; avatarUrl: string; role: "owner" | "admin" | "member"; isActive: boolean; joinedAt: string };

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
  const [inviteCode, setInviteCode] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteDays, setInviteDays] = useState(7);
  const [inviteUrl, setInviteUrl] = useState("");
  const [communityBusy, setCommunityBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeCapsule = useMemo(() => dashboard?.capsules.find((capsule) => capsule.id === selectedCapsuleId) || dashboard?.capsules[0], [dashboard, selectedCapsuleId]);

  const loadCommunity = async (familyId: string) => {
    const [nextInvites, nextMembers] = await Promise.all([
      json<{ invites: Invite[] }>(`/api/memory/families/${familyId}/invites`),
      json<{ members: FamilyMember[] }>(`/api/memory/families/${familyId}/members`),
    ]);
    setInvites(nextInvites.invites);
    setMembers(nextMembers.members);
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
        setSelectedCapsuleId((current) => current || nextDashboard.capsules[0]?.id || "");
        if (["owner", "admin"].includes(nextDashboard.membership.role)) await loadCommunity(familyId);
        else { setInvites([]); setMembers([]); }
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
    <p className="memory-kicker">水金呼吸・回憶膠囊</p><h1>{inviteCode ? "你受邀加入家族回憶。" : "把相聚，留給未來的家人。"}</h1><p>{inviteCode ? "請用自己的 LINE 帳號登入，即可加入陳水金家族。加入後可以瀏覽照片、上傳新回憶與留下想說的話。" : "這是陳水金家族的私密回憶空間。使用 LINE 登入後，受邀家人可以看照片、上傳新回憶與留下想說的話。"}</p>
    {error && <p className="memory-error" role="alert">{error}</p>}<div className="memory-cta-wrap"><button className="memory-primary" onClick={login}>{inviteCode ? "使用 LINE 接受邀請" : "使用 LINE 進入"}</button></div><small>不需要新帳號或密碼；Face ID／Touch ID 仍由你的裝置與 LINE 負責。</small>
  </section></main>;
  if (!dashboard) return <main className="memory-page"><section className="memory-empty"><Avatar name={session.profile?.displayName || "家人"} src={session.profile?.avatarUrl} /><p className="memory-kicker">已使用 LINE 登入</p><h1>{inviteCode ? "準備加入家族" : "尚未加入家族"}</h1><p>{inviteCode ? "請再按一次按鈕，確認以目前的 LINE 帳號接受家族邀請。" : "請向家族管理者索取專屬邀請連結，再由連結進入。"}</p>{error && <p className="memory-error" role="alert">{error}</p>}{inviteCode && <div className="memory-cta-wrap"><button className="memory-primary" onClick={login}>以 LINE 接受邀請</button></div>}<div className="memory-cta-wrap"><button className="memory-secondary" onClick={logout}>切換 LINE 帳號</button></div></section></main>;

  const visibleMedia = dashboard.media.filter((item) => item.capsuleId === activeCapsule?.id);
  return <main className="memory-page">
    <header className="memory-header"><a className="memory-brand" href="/memory-capsule"><span>水</span><b>水金呼吸</b><small>回憶膠囊</small></a><div className="memory-member"><Avatar name={dashboard.membership.displayName} src={dashboard.membership.avatarUrl} small /><span>{dashboard.membership.displayName}</span><button onClick={logout}>登出</button></div></header>
    <section className="memory-hero"><div><p className="memory-kicker">{dashboard.family.displayName}</p><h1>我們的回憶，<em>一直都在。</em></h1><p>照片只屬於受邀家人。每一張相片都會保留上傳者的 LINE 暱稱與時間。</p></div><div className="memory-hero-orb" aria-hidden="true">水</div></section>
    {error && <p className="memory-error" role="alert">{error}</p>}
    <section className="memory-section"><div className="memory-section-heading"><div><p className="memory-kicker">家族膠囊</p><h2>一起打開的回憶</h2></div></div>
      <div className="memory-capsules">{dashboard.capsules.map((capsule) => <button key={capsule.id} className={`memory-capsule${activeCapsule?.id === capsule.id ? " active" : ""}`} onClick={() => setSelectedCapsuleId(capsule.id)}><span className="memory-capsule-icon">宴</span><span><b>{capsule.title}</b><small>{capsule.eraLabel || "家族回憶"}・{capsule.mediaCount} 張相片</small></span></button>)}</div>
    </section>
    {["owner", "admin"].includes(dashboard.membership.role) && <section className="memory-community" aria-labelledby="memory-community-title"><div className="memory-section-heading"><div><p className="memory-kicker">家族入口管理</p><h2 id="memory-community-title">邀家人，一起保存回憶</h2><p>每次建立的是一人、一段期限的私密邀請；家人必須用自己的 LINE 登入才會加入。</p></div></div>
      <div className="memory-community-grid"><section className="memory-invite-card"><h3>建立家人邀請</h3><label>有效期限<select value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} disabled={communityBusy}><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option></select></label>
        {dashboard.membership.role === "owner" && <label>加入後的權限<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")} disabled={communityBusy}><option value="member">一般家人</option><option value="admin">共同管理者</option></select></label>}
        <p className="memory-form-hint">連結只可使用 1 次；管理者可隨時撤銷。</p><div className="memory-cta-wrap"><button className="memory-primary" disabled={communityBusy} onClick={() => { void createInvite(); }}>{communityBusy ? "處理中⋯" : "建立邀請連結"}</button></div>
        {inviteUrl && <div className="memory-share-result"><label>傳給家人的專屬連結<input value={inviteUrl} readOnly aria-label="傳給家人的專屬邀請連結" onFocus={(event) => event.currentTarget.select()} /></label><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => { void copyInvite(); }}>{copied ? "已複製連結" : "複製邀請連結"}</button></div><p>請直接傳給指定家人；不要貼在公開群組或公開貼文。</p></div>}
      </section>
      <section className="memory-members-card"><h3>家人與邀請</h3><div className="memory-member-list">{members.map((member) => <article className="memory-member-row" key={member.id}><Avatar name={member.displayName} src={member.avatarUrl} small /><div><b>{member.displayName}</b><small>{member.role === "owner" ? "總管理者" : member.role === "admin" ? "共同管理者" : "家人"}{member.isActive ? "・使用中" : "・已停用"}</small></div>{dashboard.membership.role === "owner" && member.id !== dashboard.membership.id && <div className="memory-member-actions"><button disabled={communityBusy} onClick={() => { void updateMember(member.id, { role: member.role === "admin" ? "member" : "admin" }); }}>{member.role === "admin" ? "改為家人" : "設為共同管理者"}</button><button className="memory-danger-link" disabled={communityBusy} onClick={() => { void updateMember(member.id, { isActive: !member.isActive }); }}>{member.isActive ? "停用" : "恢復"}</button></div>}</article>)}</div>
        <div className="memory-invite-list">{invites.filter((invite) => !invite.revokedAt && new Date(invite.expiresAt).getTime() > Date.now() && invite.useCount < invite.maxUses).map((invite) => <article key={invite.id}><span><b>{invite.role === "admin" ? "共同管理者邀請" : "家人邀請"}</b><small>尚可使用 {invite.maxUses - invite.useCount} 次・至 {new Date(invite.expiresAt).toLocaleDateString("zh-TW")}</small></span><button className="memory-danger-link" disabled={communityBusy} onClick={() => { void revokeInvite(invite.id); }}>撤銷</button></article>)}</div>
      </section></div>
    </section>}
    {activeCapsule && <section className="memory-capsule-detail"><div className="memory-section-heading"><div><p className="memory-kicker">{activeCapsule.eraLabel || "回憶膠囊"}</p><h2>{activeCapsule.title}</h2><p>{activeCapsule.introduction || "等待家人放進第一張相片。"}</p></div><div className="memory-cta-wrap"><button className="memory-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "上傳中⋯" : "＋ 新增相片"}</button></div></div>
      <input ref={fileInput} className="memory-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { void uploadPhotos(event); }} />
      {progress && <p className="memory-upload-status" aria-live="polite">{progress}</p>}
      {visibleMedia.length ? <div className="memory-media-grid">{visibleMedia.map((item) => <article className="memory-media-card" key={item.id}><img src={item.url} alt={item.title || item.description || item.originalFilename} /><div><p>{item.title || item.originalFilename}</p><span><Avatar name={item.authorName} src={item.authorAvatar} small />{item.authorName}・{new Date(item.createdAt).toLocaleDateString("zh-TW")}</span></div></article>)}</div> : <div className="memory-empty memory-empty-compact"><p className="memory-empty-mark">◌</p><h3>第一張相片，從這裡開始</h3><p>選擇相片後會立即顯示在家族膠囊，管理者可在之後協助整理。</p><div className="memory-cta-wrap"><button className="memory-secondary" onClick={() => fileInput.current?.click()}>選擇相片</button></div></div>}
    </section>}
  </main>;
}
