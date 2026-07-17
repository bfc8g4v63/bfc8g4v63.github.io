"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Rsvp = {
  id: string;
  name: string;
  partySize: number;
  diet: string;
  note: string;
  response: "attending" | "not_attending";
};

type FamilyEvent = {
  id: string;
  title: string;
  eventDate: string;
  startTime: string;
  location: string;
  description: string;
  contactName: string;
  contactPhone: string;
  capacity: number | null;
  status: "active" | "cancelled";
  rsvps: Rsvp[];
};

type Panel =
  | { type: "create" }
  | { type: "edit"; event: FamilyEvent }
  | { type: "rsvp"; event: FamilyEvent }
  | null;

const emptyEvent = {
  title: "",
  eventDate: "",
  startTime: "",
  location: "",
  description: "",
  contactName: "",
  contactPhone: "",
  capacity: "",
  editCode: "",
};

function formatDate(value: string) {
  if (!value) return "日期未定";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function dateParts(value: string) {
  if (!value) return { month: "待定", day: "—" };
  const date = new Date(`${value}T12:00:00`);
  return {
    month: new Intl.DateTimeFormat("zh-TW", { month: "short" }).format(date),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

export default function Home() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState("");

  async function loadEvents() {
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const data = await response.json() as { error?: string; events?: FamilyEvent[] };
      if (!response.ok) throw new Error(data.error || "讀取活動失敗");
      setEvents(data.events ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "目前無法讀取活動");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const upcoming = useMemo(
    () => [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events],
  );

  async function shareEvent(event: FamilyEvent) {
    const url = `${window.location.origin}/?event=${event.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: `${formatDate(event.eventDate)} ${event.startTime}｜${event.location}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("活動網址已複製，可以貼到 LINE 分享");
      }
    } catch {
      // The user may close the native share sheet; no error message is needed.
    }
  }

  function closePanel(message?: string) {
    setPanel(null);
    if (message) {
      setNotice(message);
      window.setTimeout(() => setNotice(""), 4000);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="好日子家庭活動首頁">
          <span className="brand-mark" aria-hidden="true">好</span>
          <span><strong>好日子</strong><small>家庭活動</small></span>
        </a>
        <button className="primary small" onClick={() => setPanel({ type: "create" })}>＋ 建立活動</button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">全家人都會用的活動簿</p>
          <h1>相聚的日子，<br /><em>簡單記、放心約。</em></h1>
          <p className="hero-lead">不用下載、不用註冊。建立活動後，把網址分享到 LINE，家人點一下就能參加。</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => setPanel({ type: "create" })}>建立第一個活動</button>
            <a className="text-link" href="#activities">看看近期活動 ↓</a>
          </div>
        </div>
        <div className="hero-note" aria-label="三個簡單步驟">
          <span className="tape" aria-hidden="true" />
          <p className="note-title">就這麼簡單</p>
          <ol>
            <li><b>1</b><span><strong>建立</strong>填寫時間和地點</span></li>
            <li><b>2</b><span><strong>分享</strong>貼到家族群組</span></li>
            <li><b>3</b><span><strong>參加</strong>家人一鍵回覆</span></li>
          </ol>
        </div>
      </section>

      <section className="activities" id="activities">
        <div className="section-heading">
          <div><p className="eyebrow">近期安排</p><h2>家族活動</h2></div>
          <button className="secondary" onClick={() => setPanel({ type: "create" })}>＋ 新活動</button>
        </div>

        {notice && <div className="notice" role="status">✓ {notice}</div>}
        {error && <div className="error" role="alert">{error}<button onClick={loadEvents}>再試一次</button></div>}
        {loading && <div className="loading" aria-live="polite">正在整理活動…</div>}

        {!loading && !error && upcoming.length === 0 && (
          <div className="empty-state">
            <div className="empty-sun" aria-hidden="true">☀</div>
            <h3>還沒有活動</h3>
            <p>從一頓飯、一次散步開始，建立第一個全家人的好日子。</p>
            <button className="primary" onClick={() => setPanel({ type: "create" })}>建立活動</button>
          </div>
        )}

        <div className="event-grid">
          {upcoming.map((event) => {
            const parts = dateParts(event.eventDate);
            const attending = event.rsvps.filter((rsvp) => rsvp.response === "attending");
            const people = attending.reduce((sum, rsvp) => sum + rsvp.partySize, 0);
            return (
              <article className={`event-card ${event.status === "cancelled" ? "cancelled" : ""}`} key={event.id} id={`event-${event.id}`}>
                <div className="date-block"><span>{parts.month}</span><strong>{parts.day}</strong></div>
                <div className="event-body">
                  <div className="event-title-row">
                    <h3>{event.title}</h3>
                    {event.status === "cancelled" && <span className="status-cancelled">已取消</span>}
                  </div>
                  <p className="event-meta"><span aria-hidden="true">◷</span>{event.startTime || "時間未定"}</p>
                  <p className="event-meta"><span aria-hidden="true">⌖</span>{event.location || "地點未定"}</p>
                  {event.description && <p className="event-description">{event.description}</p>}
                  <div className="attendance">
                    <strong>{people} 人參加</strong>
                    {event.capacity ? <span>／上限 {event.capacity} 人</span> : <span>歡迎全家一起來</span>}
                  </div>
                  {attending.length > 0 && <p className="names">已回覆：{attending.map((rsvp) => rsvp.name).join("、")}</p>}
                  <div className="card-actions">
                    <button className="primary" disabled={event.status === "cancelled"} onClick={() => setPanel({ type: "rsvp", event })}>我要參加</button>
                    <button className="icon-button" aria-label={`分享 ${event.title}`} onClick={() => shareEvent(event)}>分享</button>
                    <button className="icon-button" aria-label={`修改 ${event.title}`} onClick={() => setPanel({ type: "edit", event })}>修改</button>
                  </div>
                  {(event.contactName || event.contactPhone) && (
                    <p className="contact">聯絡人：{event.contactName}{event.contactPhone && <> · <a href={`tel:${event.contactPhone}`}>{event.contactPhone}</a></>}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="reassurance">
        <p className="eyebrow">為長輩多想一步</p>
        <div className="reassurance-grid">
          <div><span aria-hidden="true">字</span><h3>大字清楚</h3><p>不用放大畫面，也能看得舒服。</p></div>
          <div><span aria-hidden="true">一</span><h3>一鍵回覆</h3><p>不設密碼、不必下載新程式。</p></div>
          <div><span aria-hidden="true">家</span><h3>家人代填</h3><p>一支手機可幫多位家人報名。</p></div>
        </div>
      </section>

      <footer><strong>好日子</strong><span>讓每一次相聚，都更容易。</span></footer>

      {panel?.type === "create" && <EventForm onClose={() => closePanel()} onSaved={() => { closePanel("活動已建立，可以分享給家人了"); loadEvents(); }} />}
      {panel?.type === "edit" && <EventForm event={panel.event} onClose={() => closePanel()} onSaved={() => { closePanel("活動內容已更新"); loadEvents(); }} />}
      {panel?.type === "rsvp" && <RsvpForm event={panel.event} onClose={() => closePanel()} onSaved={() => { closePanel("已收到回覆，期待見面！"); loadEvents(); }} />}
    </main>
  );
}

function EventForm({ event, onClose, onSaved }: { event?: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    ...emptyEvent,
    ...(event ? {
      title: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      location: event.location,
      description: event.description,
      contactName: event.contactName,
      contactPhone: event.contactPhone,
      capacity: event.capacity ? String(event.capacity) : "",
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/events", {
        method: event ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: event?.id, capacity: form.capacity ? Number(form.capacity) : null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗"); }
    finally { setSaving(false); }
  }

  async function cancelEvent() {
    if (!event) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/events", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, editCode: form.editCode, status: event.status === "cancelled" ? "active" : "cancelled" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失敗");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "操作失敗"); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <button className="modal-close" aria-label="關閉" onClick={onClose}>×</button>
        <p className="eyebrow">{event ? "管理活動" : "新的相聚"}</p>
        <h2 id="event-form-title">{event ? "修改活動" : "建立活動"}</h2>
        <form onSubmit={submit}>
          <label>活動名稱<span>必填</span><input required value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="例如：阿嬤生日午餐" /></label>
          <div className="form-row">
            <label>日期<span>必填</span><input required type="date" value={form.eventDate} onChange={(e) => update("eventDate", e.target.value)} /></label>
            <label>時間<span>必填</span><input required type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} /></label>
          </div>
          <label>地點<span>必填</span><input required value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="餐廳名稱或地址" /></label>
          <label>活動說明<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="要帶什麼？在哪裡集合？" rows={3} /></label>
          <div className="form-row">
            <label>聯絡人<input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="王小明" /></label>
            <label>聯絡電話<input inputMode="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="0912 345 678" /></label>
          </div>
          <div className="form-row">
            <label>人數上限<input type="number" min="1" max="999" value={form.capacity} onChange={(e) => update("capacity", e.target.value)} placeholder="不限可留白" /></label>
            <label>活動修改碼<span>必填</span><input required minLength={4} value={form.editCode} onChange={(e) => update("editCode", e.target.value)} placeholder={event ? "輸入建立時的修改碼" : "自訂至少 4 碼"} /></label>
          </div>
          {!event && <p className="form-hint">請記住修改碼。日後修改或取消活動時會用到。</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            {event && <button type="button" className="danger" onClick={cancelEvent} disabled={saving}>{event.status === "cancelled" ? "恢復活動" : "取消活動"}</button>}
            <button type="button" className="secondary" onClick={onClose}>返回</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? "儲存中…" : event ? "儲存修改" : "建立並分享"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RsvpForm({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", partySize: "1", diet: "", note: "", response: "attending" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/rsvps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, eventId: event.id, partySize: Number(form.partySize) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "回覆失敗");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "回覆失敗"); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal rsvp-modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-title">
        <button className="modal-close" aria-label="關閉" onClick={onClose}>×</button>
        <p className="eyebrow">回覆活動</p><h2 id="rsvp-title">{event.title}</h2>
        <p className="modal-event-meta">{formatDate(event.eventDate)} · {event.startTime}<br />{event.location}</p>
        <form onSubmit={submit}>
          <label>您的姓名<span>必填</span><input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：王奶奶" /></label>
          <fieldset><legend>是否參加？</legend>
            <label className="choice"><input type="radio" name="response" value="attending" checked={form.response === "attending"} onChange={() => setForm({ ...form, response: "attending" })} /><span>✓ 我要參加</span></label>
            <label className="choice"><input type="radio" name="response" value="not_attending" checked={form.response === "not_attending"} onChange={() => setForm({ ...form, response: "not_attending" })} /><span>這次無法參加</span></label>
          </fieldset>
          {form.response === "attending" && <>
            <label>總共幾人參加？<select value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })}>{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n} 人</option>)}</select></label>
            <label>飲食需求<input value={form.diet} onChange={(e) => setForm({ ...form, diet: e.target.value })} placeholder="例如：吃素、不吃牛（可留白）" /></label>
            <label>想告訴主辦人<textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="可留白" /></label>
          </>}
          <p className="form-hint">同一姓名再次回覆，會更新原本的答案。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>返回</button><button type="submit" className="primary" disabled={saving}>{saving ? "送出中…" : "確認送出"}</button></div>
        </form>
      </section>
    </div>
  );
}
