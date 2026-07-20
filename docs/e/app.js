const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
const root = document.querySelector("#event-app");
const modalRoot = document.querySelector("#modal-root");
const shareToken = new URLSearchParams(location.search).get("s") || "";
let currentEvent;
let participantCode = "";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${value}T12:00:00`));
}

async function post(path, body, method = "POST") {
  const response = await fetch(`${API}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "操作失敗");
    error.requiresParticipantCode = data.requiresParticipantCode;
    throw error;
  }
  return data;
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
  root.innerHTML = `
    <article class="event-invitation ${event.status === "cancelled" ? "cancelled" : ""}">
      <p class="eyebrow">${event.accessMode === "public" ? "公開活動" : "活動邀請"}</p>
      <h1>${esc(event.title)}</h1>
      <p class="invitation-meta">${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}<br>${esc(event.location)}</p>
      ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
      <p class="attendance"><strong>${people} 人參加</strong>${event.capacity ? `<span>／上限 ${event.capacity} 人</span>` : ""}</p>
      ${event.status === "cancelled" ? '<p class="form-error">此活動已取消</p>' : '<button class="primary" id="rsvp">我要參加</button>'}
      ${event.contactName ? `<p class="contact">活動聯絡人：${esc(event.contactName)}</p>` : ""}
      <p class="privacy-note">您的姓名、飲食與備註只會讓活動管理者看到。</p>
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
    const data = await post("/events/access", { shareToken, participantCode });
    currentEvent = data.event;
    renderEvent(currentEvent);
  } catch (error) {
    if (error.requiresParticipantCode) showCodeGate(error.message);
    else root.innerHTML = `<section class="event-gate"><h1>無法開啟活動</h1><p>${esc(error.message)}</p><a class="primary" href="/">回到好日子</a></section>`;
  }
}

function closeModal() { modalRoot.innerHTML = ""; }

function openRsvp() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal rsvp-modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-title">
      <button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">回覆活動</p><h2 id="rsvp-title">${esc(currentEvent.title)}</h2>
      <form id="rsvp-form"><label>您的姓名 <span>必填</span><input name="name" required autofocus placeholder="例如：王奶奶"></label>
        <fieldset><legend>是否參加？</legend><label class="choice"><input type="radio" name="response" value="attending" checked><span>✓ 我要參加</span></label><label class="choice"><input type="radio" name="response" value="not_attending"><span>這次無法參加</span></label></fieldset>
        <div id="attending-fields"><label>總共幾人參加？<select name="partySize">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1} 人</option>`).join("")}</select></label><label>飲食需求<input name="diet" placeholder="例如：吃素、不吃牛（可留白）"></label><label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白"></textarea></label></div>
        <p class="form-hint">同一姓名再次回覆，會更新原本的答案。</p><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">確認送出</button></div>
      </form>
    </section></div>`;
  const form = document.querySelector("#rsvp-form");
  form.addEventListener("change", () => { document.querySelector("#attending-fields").hidden = form.elements.response.value !== "attending"; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.eventId = currentEvent.id; body.shareToken = shareToken; body.participantCode = participantCode; body.partySize = Number(body.partySize || 1);
    try { await post("/rsvps", body); closeModal(); await loadEvent(); }
    catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
  });
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
  const rows = data.rsvps.length ? data.rsvps.map((item) => `<tr><td>${esc(item.name)}</td><td>${item.response === "attending" ? "參加" : "不參加"}</td><td>${item.response === "attending" ? item.partySize : "—"}</td><td>${esc(item.diet || "—")}</td><td>${esc(item.note || "—")}</td></tr>`).join("") : '<tr><td colspan="5">尚未收到回覆</td></tr>';
  modalRoot.innerHTML = `<div class="modal-backdrop admin-backdrop"><section class="modal admin-modal" role="dialog" aria-modal="true"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">活動管理後台</p><h2>${esc(data.event.title)}</h2><div class="stats-grid"><div><strong>${data.summary.attendingPeople}</strong><span>參加人數</span></div><div><strong>${data.summary.attendingReplies}</strong><span>參加回覆</span></div><div><strong>${data.summary.notAttendingReplies}</strong><span>不參加</span></div></div><div class="admin-toolbar"><button class="primary" id="manager-edit">修改活動</button></div><section class="admin-section"><div class="table-scroll"><table><thead><tr><th>姓名</th><th>回覆</th><th>人數</th><th>飲食</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table></div></section></section></div>`;
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

document.addEventListener("click", (event) => { if (event.target.closest("[data-close]") || event.target.classList.contains("modal-backdrop")) closeModal(); });
loadEvent();
