const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
const root = document.querySelector("#event-app");
const modalRoot = document.querySelector("#modal-root");
const shareToken = new URLSearchParams(location.search).get("s") || "";
let currentEvent;
let participantCode = "";
let attendeeToken = "";
let attendeeName = "";
let companionData = null;

function normalizedAttendeeName(name) {
  return String(name || "").trim();
}

function attendeeStorageKey(name = attendeeName) {
  const safeName = normalizedAttendeeName(name);
  return safeName ? `good-days-rsvp:${shareToken}:${encodeURIComponent(safeName)}` : "";
}

function activeAttendeeStorageKey() {
  return `good-days-rsvp:${shareToken}:active`;
}

function attendeeTokenFor(name) {
  const key = attendeeStorageKey(name);
  if (!key) return "";
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

try {
  attendeeName = localStorage.getItem(activeAttendeeStorageKey()) || "";
  attendeeToken = attendeeTokenFor(attendeeName);
} catch {}

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function formatMoney(value) {
  return `NT$${new Intl.NumberFormat("zh-TW").format(Math.max(0, Number(value) || 0))}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return "—";
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short", timeStyle: "short", hour12: false, timeZone: "Asia/Taipei",
  }).format(date);
}

async function post(path, body, method = "POST") {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${API}${path}`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "操作失敗");
      error.requiresParticipantCode = data.requiresParticipantCode;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("連線逾時，請檢查網路後再試");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function showCodeGate(message = "這是一個需要參加碼的私人活動。") {
  root.innerHTML = `
    <section class="event-gate"><p class="eyebrow">私人活動</p><h1>輸入參加碼</h1><p>${esc(message)}</p>
      <form id="code-form"><label>參加碼<input name="participantCode" required minlength="4" autofocus autocomplete="off"></label><p class="form-error" hidden></p><button class="primary">開啟活動</button></form>
    </section>`;
  const form = document.querySelector("#code-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    participantCode = form.elements.participantCode.value.trim();
    try { await loadEvent(); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

function renderEvent(event) {
  const people = event.summary?.attendingPeople || 0;
  const isFull = Boolean(event.capacity && people >= event.capacity);
  const roster = event.roster?.names;
  const rosterHtml = Array.isArray(roster) ? `
    <section class="attendee-roster"><h2>同場參加者</h2>
      ${roster.length ? `<ul class="attendee-names">${roster.map((name) => `<li>${esc(name)}</li>`).join("")}</ul>` : '<p>目前沒有可公開的顯示名稱。</p>'}
    </section>` : event.attendanceVisibility !== "count" && event.status === "active"
      ? '<p class="privacy-note">完成報名後，可在這裡查看依活動設定公開的參加者名稱。</p>' : "";
  root.innerHTML = `
    <article class="event-invitation ${event.status === "cancelled" ? "cancelled" : ""}">
      <p class="eyebrow">${event.accessMode === "public" ? "公開活動" : "活動邀請"}</p>
      <h1>${esc(event.title)}</h1>
      <p class="invitation-meta">${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}<br>${esc(event.location)}</p>
      ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
      <p class="attendance"><strong>${people} 人參加</strong>${event.capacity ? `<span>／上限 ${event.capacity} 人</span>` : ""}</p>
      ${event.feePerPerson > 0 ? `<p class="fee-note">活動費用：每人 ${formatMoney(event.feePerPerson)}</p>` : ""}
      ${event.status === "cancelled" ? '<p class="form-error">此活動已取消</p>' : `<button class="primary" id="rsvp">${isFull ? "活動已額滿" : "我要參加"}</button>${isFull ? '<p class="form-hint">目前已額滿；已報名者仍可更新內容、減少人數或改為不參加。</p>' : ""}`}
      ${rosterHtml}
      ${event.status === "active" ? '<section id="companions-root" class="companions-section" aria-live="polite"></section>' : ""}
      ${event.contactName ? `<p class="contact">活動聯絡人：${esc(event.contactName)}</p>` : ""}
      <p class="privacy-note">電話、飲食、備註與管理資訊只會讓活動管理者看到。</p>
      <button class="text-link manage-link" id="manager">活動管理</button>
    </article>`;
  document.querySelector("#rsvp")?.addEventListener("click", openRsvp);
  document.querySelector("#manager").addEventListener("click", openManagerLogin);
}

async function loadEvent() {
  if (!shareToken) {
    root.innerHTML = '<section class="event-gate"><h1>這個分享連結不完整</h1><a class="primary" href="/">回到好日子</a></section>';
    return;
  }
  try {
    const data = await post("/events/access", { shareToken, participantCode, attendeeToken });
    currentEvent = data.event;
    renderEvent(currentEvent);
    if (currentEvent.status === "active") await loadCompanions();
  } catch (error) {
    if (error.requiresParticipantCode) showCodeGate(error.message);
    else {
      root.innerHTML = `<section class="event-gate"><h1>無法開啟活動</h1><p>${esc(error.message)}</p><div class="form-actions"><button class="secondary" id="retry-event">重新嘗試</button><a class="primary" href="/">回到好日子</a></div></section>`;
      document.querySelector("#retry-event")?.addEventListener("click", () => void loadEvent());
    }
  }
}

function closeModal() { modalRoot.innerHTML = ""; }

function openRsvp() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal rsvp-modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-title">
      <button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">回覆活動</p><h2 id="rsvp-title">${esc(currentEvent.title)}</h2>
      <form id="rsvp-form"><label>您的姓名 <span>必填</span><input name="name" required autofocus placeholder="例如：王奶奶"></label>
        <fieldset><legend>是否參加？</legend><label class="choice"><input type="radio" name="response" value="attending" checked><span>✓ 我要參加</span></label><label class="choice"><input type="radio" name="response" value="not_attending"><span>這次無法參加</span></label></fieldset>
        <div id="attending-fields"><label>總共幾人參加？<input name="partySize" type="number" min="1" step="1" inputmode="numeric" value="1" required></label>${currentEvent.feePerPerson > 0 ? `<p class="fee-note" id="rsvp-fee-total">本戶應收：${formatMoney(currentEvent.feePerPerson)}（每人 ${formatMoney(currentEvent.feePerPerson)}）</p>` : ""}<label>飲食需求<input name="diet" placeholder="例如：吃素、不吃牛（可留白）"></label><label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白"></textarea></label>${currentEvent.attendanceVisibility === "opt_in" ? '<label class="toggle"><input name="shareName" type="checkbox" value="true"><span>公開我的顯示名稱給同場參加者</span></label>' : ""}${currentEvent.attendanceVisibility === "all" ? '<p class="form-hint">此活動設定為全部名單；完成報名後，您的顯示名稱會提供給已報名的同場參加者查看。</p>' : ""}</div>
        <p class="form-hint">一支手機可以代填多位親友；輸入與原先完全相同的姓名，才會更新該人的回覆，不會新增重複資料。</p><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">確認送出</button><button type="button" class="text-danger" id="delete-my-rsvp">永久刪除我的回覆</button></div>
      </form>
    </section></div>`;
  const form = document.querySelector("#rsvp-form");
  const syncRsvpFields = () => {
    const attending = form.elements.response.value === "attending";
    document.querySelector("#attending-fields").hidden = !attending;
    const total = document.querySelector("#rsvp-fee-total");
    if (total) total.textContent = `本戶應收：${formatMoney((attending ? Number(form.elements.partySize.value || 0) : 0) * currentEvent.feePerPerson)}（每人 ${formatMoney(currentEvent.feePerPerson)}）`;
  };
  form.addEventListener("change", syncRsvpFields);
  form.addEventListener("input", syncRsvpFields);
  syncRsvpFields();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const name = normalizedAttendeeName(body.name);
    body.eventId = currentEvent.id; body.shareToken = shareToken; body.participantCode = participantCode; body.attendeeToken = attendeeTokenFor(name); body.partySize = Number(body.partySize || 1);
    try {
      const data = await post("/rsvps", body);
      attendeeName = name;
      attendeeToken = data.attendeeToken || "";
      try {
        const key = attendeeStorageKey(name);
        if (attendeeToken && key) {
          localStorage.setItem(key, attendeeToken);
          localStorage.setItem(activeAttendeeStorageKey(), name);
        }
        else if (key) localStorage.removeItem(key);
      } catch {}
      closeModal(); await loadEvent();
    }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
  document.querySelector("#delete-my-rsvp").addEventListener("click", async () => {
    const name = normalizedAttendeeName(form.elements.name.value);
    if (!name) { const box = form.querySelector(".form-error"); box.textContent = "請先輸入原本報名的姓名"; box.hidden = false; return; }
    if (!confirm(`要永久刪除「${name}」的回覆嗎？此動作無法復原。`)) return;
    try {
      await post("/rsvps", { eventId: currentEvent.id, name, attendeeToken: attendeeTokenFor(name) }, "DELETE");
      const key = attendeeStorageKey(name);
      try {
        if (key) localStorage.removeItem(key);
        if (attendeeName === name) {
          attendeeName = "";
          attendeeToken = "";
          localStorage.removeItem(activeAttendeeStorageKey());
        }
      } catch {}
      closeModal(); await loadEvent();
    } catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

const companionIntentLabels = {
  team: "想同隊", table: "想同桌", arrive: "想一起到場", after: "活動後繼續交流",
};

function companionRoot() { return document.querySelector("#companions-root"); }

function requestFor(card) {
  return companionData?.requests?.find((item) => (
    (item.fromRsvpId === companionData.viewer.rsvpId && item.toRsvpId === card.rsvpId)
    || (item.toRsvpId === companionData.viewer.rsvpId && item.fromRsvpId === card.rsvpId)
  ));
}

async function loadCompanions() {
  const holder = companionRoot();
  if (!holder) return;
  if (!attendeeToken) {
    holder.innerHTML = `<div class="companions-empty"><div><p class="eyebrow">同行卡</p><h2>把相遇留在活動裡</h2><p>完成報名後，可自願建立一張同行卡；只有同場已報名者看得到。沒有私訊，也不會公開到活動外。</p></div><button class="secondary" id="companion-rsvp">先完成報名</button></div>`;
    document.querySelector("#companion-rsvp")?.addEventListener("click", openRsvp);
    return;
  }
  try {
    companionData = await post("/companions", { action: "read", eventId: currentEvent.id, attendeeToken });
    renderCompanions();
  } catch (error) {
    holder.innerHTML = `<div class="companions-empty"><div><p class="eyebrow">同行卡</p><h2>同場再認識一些人</h2><p>${esc(error.message)}</p></div></div>`;
  }
}

function intentTags(intents = []) {
  return intents.map((intent) => `<span class="companion-tag">${esc(companionIntentLabels[intent] || intent)}</span>`).join("");
}

function renderCompanions() {
  const holder = companionRoot();
  if (!holder || !companionData) return;
  const own = companionData.ownCard;
  const cards = companionData.cards || [];
  const requests = companionData.requests || [];
  const inbound = requests.filter((item) => item.toRsvpId === companionData.viewer.rsvpId && item.status === "pending");
  holder.innerHTML = `<div class="companions-heading"><div><p class="eyebrow">同行卡</p><h2>同場再認識一些人</h2><p>僅同場已報名者可見。沒有私訊、電話或 LINE ID；雙方同意後，活動現場或原群組相認。</p></div>${own ? '<div class="companion-own-actions"><button class="secondary" id="edit-companion">編輯我的卡</button><button class="text-link" id="hide-companion">暫停並清除</button></div>' : '<button class="primary" id="create-companion">建立同行卡</button>'}</div>
    ${inbound.length ? `<section class="companion-inbox"><h3>收到 ${inbound.length} 個同行邀請</h3>${inbound.map((item) => `<div class="companion-invite"><span>${esc(companionIntentLabels[item.kind] || item.kind)}</span><div><button class="secondary" data-respond-companion="accepted" data-request-id="${esc(item.id)}">願意，活動見</button><button class="text-link" data-respond-companion="declined" data-request-id="${esc(item.id)}">這次先不用</button></div></div>`).join("")}</section>` : ""}
    ${cards.length ? `<div class="companion-grid">${cards.map((card) => {
      const request = requestFor(card);
      const state = request
        ? request.fromRsvpId === companionData.viewer.rsvpId
          ? request.status === "pending" ? "已送出同行邀請" : request.status === "accepted" ? "對方願意，活動現場相認" : "本次同行邀請未成立"
          : request.status === "accepted" ? "你已答應，活動現場相認" : ""
        : "";
      const action = !request ? `<button class="secondary" data-invite-companion="${esc(card.rsvpId)}">邀請同行</button>` : `<p class="companion-status">${esc(state)}</p>`;
      return `<article class="companion-card"><h3>${esc(card.displayName)}</h3>${card.intro ? `<p>${esc(card.intro)}</p>` : ""}${card.interests?.length ? `<p class="companion-interests">${card.interests.map(esc).join(" · ")}</p>` : ""}<div class="companion-tags">${intentTags(card.intents)}</div>${action}</article>`;
    }).join("")}</div>` : '<p class="companions-none">目前還沒有其他同行卡。你可以先建立一張，讓同場的人有一個安全的相認方式。</p>'}`;
  document.querySelector("#create-companion")?.addEventListener("click", () => openCompanionEditor());
  document.querySelector("#edit-companion")?.addEventListener("click", () => openCompanionEditor(own));
  document.querySelector("#hide-companion")?.addEventListener("click", hideCompanionCard);
  document.querySelectorAll("[data-invite-companion]").forEach((button) => button.addEventListener("click", () => openCompanionInvite(button.dataset.inviteCompanion)));
  document.querySelectorAll("[data-respond-companion]").forEach((button) => button.addEventListener("click", () => respondCompanion(button.dataset.requestId, button.dataset.respondCompanion)));
}

function openCompanionEditor(card = null) {
  const selected = new Set(card?.intents || []);
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="companion-title"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">同行卡</p><h2 id="companion-title">${card ? "編輯我的同行卡" : "建立我的同行卡"}</h2><p class="form-hint">只在這一場活動可見。請不要填寫電話、LINE ID 或住址。</p><form id="companion-form"><label>顯示名稱 <span>必填</span><input name="displayName" required maxlength="30" value="${esc(card?.displayName || "")}" placeholder="例如：小安／羽球新手"></label><label>一句自我介紹<textarea name="intro" rows="3" maxlength="140" placeholder="例如：喜歡輕鬆打球，也想認識同好">${esc(card?.intro || "")}</textarea></label><label>興趣標籤 <span>最多 5 個，以逗號分隔</span><input name="interests" maxlength="120" value="${esc((card?.interests || []).join("、"))}" placeholder="羽球、桌遊、唱歌"></label><fieldset><legend>願意一起做什麼？</legend>${Object.entries(companionIntentLabels).map(([key, label]) => `<label class="choice"><input type="checkbox" name="intents" value="${key}" ${selected.has(key) ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">儲存同行卡</button></div></form></section></div>`;
  const form = document.querySelector("#companion-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const interests = String(data.get("interests") || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
    const intents = data.getAll("intents");
    try { await post("/companions", { action: "save_card", eventId: currentEvent.id, attendeeToken, displayName: data.get("displayName"), intro: data.get("intro"), interests, intents }); closeModal(); await loadCompanions(); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

function openCompanionInvite(rsvpId) {
  const card = companionData.cards.find((item) => item.rsvpId === rsvpId);
  if (!card) return;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">同行邀請</p><h2>邀請 ${esc(card.displayName)}</h2><p class="form-hint">不會開啟私訊；若對方同意，請在活動現場或原群組相認。</p><form id="companion-invite-form"><label>想一起做什麼？<select name="kind">${card.intents.map((intent) => `<option value="${esc(intent)}">${esc(companionIntentLabels[intent] || intent)}</option>`).join("")}</select></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">送出邀請</button></div></form></section></div>`;
  const form = document.querySelector("#companion-invite-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await post("/companions", { action: "send_request", eventId: currentEvent.id, attendeeToken, toRsvpId: rsvpId, kind: form.elements.kind.value }); closeModal(); await loadCompanions(); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

async function respondCompanion(requestId, response) {
  try { await post("/companions", { action: "respond_request", eventId: currentEvent.id, attendeeToken, requestId, response }); await loadCompanions(); }
  catch (error) { alert(error.message); }
}

async function hideCompanionCard() {
  if (!confirm("要暫停同行卡嗎？你的卡片與本場相關邀請都會一併清除。")) return;
  try { await post("/companions", { action: "hide_card", eventId: currentEvent.id, attendeeToken }); await loadCompanions(); }
  catch (error) { alert(error.message); }
}

function openManagerLogin() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">活動管理</p><h2>輸入管理碼</h2><form id="manager-form"><label>活動管理碼<input name="editCode" required minlength="4" autofocus></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">開啟名單</button></div></form></section></div>`;
  const form = document.querySelector("#manager-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { const data = await post("/admin/event", { eventId: currentEvent.id, editCode: form.elements.editCode.value.trim() }); renderManager(data, form.elements.editCode.value.trim()); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

function renderManager(data, editCode) {
  const rows = data.rsvps.length ? data.rsvps.map((item) => `<tr><td>${esc(item.name)}</td><td>${item.response === "attending" ? "參加" : "不參加"}</td><td>${item.response === "attending" ? item.partySize : "—"}</td><td>${esc(item.diet || "—")}</td><td>${esc(item.note || "—")}</td><td>${esc(formatDateTime(item.createdAt))}</td></tr>`).join("") : '<tr><td colspan="6">尚未收到回覆</td></tr>';
  modalRoot.innerHTML = `<div class="modal-backdrop admin-backdrop"><section class="modal admin-modal" role="dialog" aria-modal="true"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">活動管理後台</p><h2>${esc(data.event.title)}</h2><div class="stats-grid"><div><strong>${data.summary.attendingPeople}</strong><span>參加人數</span></div><div><strong>${data.summary.attendingReplies}</strong><span>參加回覆</span></div><div><strong>${data.summary.notAttendingReplies}</strong><span>不參加</span></div></div><div class="admin-toolbar"><button class="primary" id="manager-edit">修改活動</button></div><section class="admin-section"><div class="table-scroll"><table><thead><tr><th>姓名</th><th>回覆</th><th>人數</th><th>飲食</th><th>備註</th><th>登記時間</th></tr></thead><tbody>${rows}</tbody></table></div></section></section></div>`;
  document.querySelector("#manager-edit").addEventListener("click", () => openManagerEdit(data.event, editCode));
}

function openManagerEdit(event, editCode) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">活動管理</p><h2>修改活動</h2>
      <form id="manager-edit-form"><label>活動名稱<input name="title" required value="${esc(event.title)}"></label><div class="form-row"><label>日期<input name="eventDate" type="date" required value="${esc(event.eventDate)}"></label><label>時間<input name="startTime" type="time" required value="${esc(event.startTime)}"></label></div><label>地點<input name="location" required value="${esc(event.location)}"></label><label>活動說明<textarea name="description" rows="3">${esc(event.description)}</textarea></label><div class="form-row"><label>聯絡人<input name="contactName" value="${esc(event.contactName)}"></label><label>聯絡電話（僅管理者可見）<input name="contactPhone" value="${esc(event.contactPhone)}"></label></div><label>人數上限<input name="capacity" type="number" min="1" max="999" value="${esc(event.capacity || "")}"></label><fieldset class="access-options"><legend>活動公開方式</legend><label class="choice"><input type="radio" name="accessMode" value="unlisted" ${event.accessMode === "unlisted" ? "checked" : ""}><span><strong>不公開，免密碼</strong></span></label><label class="choice"><input type="radio" name="accessMode" value="private" ${event.accessMode === "private" ? "checked" : ""}><span><strong>不公開＋參加碼</strong></span></label><label class="choice"><input type="radio" name="accessMode" value="public" ${event.accessMode === "public" ? "checked" : ""}><span><strong>完全公開</strong></span></label></fieldset><label id="edit-code-field" ${event.accessMode === "private" ? "" : "hidden"}>更換參加碼（留白代表不變）<input name="participantCode" minlength="4"></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">儲存修改</button></div></form>
    </section></div>`;
  const form = document.querySelector("#manager-edit-form");
  const codeField = form.querySelector("#edit-code-field");
  form.addEventListener("change", () => { codeField.hidden = form.elements.accessMode.value !== "private"; });
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.id = event.id; body.editCode = editCode; body.capacity = body.capacity ? Number(body.capacity) : null;
    try { await post("/events", body, "PATCH"); closeModal(); await loadEvent(); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
}

document.addEventListener("click", (event) => { if (event.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.querySelector(".modal")) closeModal();
});
loadEvent();
