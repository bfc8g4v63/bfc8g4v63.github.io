const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
let events = [];

const eventsRoot = document.querySelector("#events");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#error");
const noticeBox = document.querySelector("#notice");
const modalRoot = document.querySelector("#modal-root");

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function formatDate(value) {
  if (!value) return "日期未定";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long", day: "numeric", weekday: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function dateParts(value) {
  if (!value) return { month: "待定", day: "—" };
  const date = new Date(`${value}T12:00:00`);
  return {
    month: new Intl.DateTimeFormat("zh-TW", { month: "short" }).format(date),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

function showNotice(message) {
  noticeBox.textContent = `✓ ${message}`;
  noticeBox.hidden = false;
  window.setTimeout(() => { noticeBox.hidden = true; }, 4000);
}

function eventCard(event) {
  const parts = dateParts(event.eventDate);
  const attending = event.rsvps.filter((item) => item.response === "attending");
  const people = attending.reduce((sum, item) => sum + item.partySize, 0);
  const names = attending.length
    ? `<p class="names">已回覆：${attending.map((item) => esc(item.name)).join("、")}</p>` : "";
  const contact = event.contactName || event.contactPhone
    ? `<p class="contact">聯絡人：${esc(event.contactName)}${event.contactPhone ? ` · <a href="tel:${esc(event.contactPhone)}">${esc(event.contactPhone)}</a>` : ""}</p>` : "";
  return `
    <article class="event-card ${event.status === "cancelled" ? "cancelled" : ""}" id="event-${esc(event.id)}">
      <div class="date-block"><span>${esc(parts.month)}</span><strong>${esc(parts.day)}</strong></div>
      <div class="event-body">
        <div class="event-title-row"><h3>${esc(event.title)}</h3>${event.status === "cancelled" ? '<span class="status-cancelled">已取消</span>' : ""}</div>
        <p class="event-meta"><span aria-hidden="true">◷</span>${esc(event.startTime || "時間未定")}</p>
        <p class="event-meta"><span aria-hidden="true">⌖</span>${esc(event.location || "地點未定")}</p>
        ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
        <div class="attendance"><strong>${people} 人參加</strong><span>${event.capacity ? `／上限 ${event.capacity} 人` : "歡迎全家一起來"}</span></div>
        ${names}
        <div class="card-actions">
          <button class="primary" data-action="rsvp" data-id="${esc(event.id)}" ${event.status === "cancelled" ? "disabled" : ""}>我要參加</button>
          <button class="icon-button" data-action="share" data-id="${esc(event.id)}">分享</button>
          <button class="icon-button" data-action="edit" data-id="${esc(event.id)}">修改</button>
        </div>
        ${contact}
      </div>
    </article>`;
}

function renderEvents() {
  if (!events.length) {
    eventsRoot.innerHTML = `<div class="empty-state"><div class="empty-sun" aria-hidden="true">☀</div><h3>還沒有活動</h3><p>從一頓飯、一次散步開始，建立第一個全家人的好日子。</p><button class="primary" data-create>建立活動</button></div>`;
    return;
  }
  eventsRoot.innerHTML = events.map(eventCard).join("");
  const requested = new URLSearchParams(location.search).get("event");
  if (requested) document.querySelector(`#event-${CSS.escape(requested)}`)?.scrollIntoView({ block: "center" });
}

async function loadEvents() {
  loading.hidden = false;
  errorBox.hidden = true;
  try {
    const response = await fetch(`${API}/events`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "讀取活動失敗");
    events = data.events || [];
    renderEvents();
  } catch (error) {
    errorBox.innerHTML = `${esc(error.message || "目前無法讀取活動")} <button id="retry">再試一次</button>`;
    errorBox.hidden = false;
  } finally {
    loading.hidden = true;
  }
}

function field(label, name, value = "", attrs = "") {
  return `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
}

function openEventForm(event) {
  const editing = Boolean(event);
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">${editing ? "管理活動" : "新的相聚"}</p>
        <h2 id="event-form-title">${editing ? "修改活動" : "建立活動"}</h2>
        <form id="event-form">
          ${field('活動名稱 <span>必填</span>', "title", event?.title, 'required placeholder="例如：阿嬤生日午餐"')}
          <div class="form-row">
            ${field('日期 <span>必填</span>', "eventDate", event?.eventDate, 'required type="date"')}
            ${field('時間 <span>必填</span>', "startTime", event?.startTime, 'required type="time"')}
          </div>
          ${field('地點 <span>必填</span>', "location", event?.location, 'required placeholder="餐廳名稱或地址"')}
          <label>活動說明<textarea name="description" rows="3" placeholder="要帶什麼？在哪裡集合？">${esc(event?.description)}</textarea></label>
          <div class="form-row">
            ${field("聯絡人", "contactName", event?.contactName, 'placeholder="王小明"')}
            ${field("聯絡電話", "contactPhone", event?.contactPhone, 'inputmode="tel" placeholder="0912 345 678"')}
          </div>
          <div class="form-row">
            ${field("人數上限", "capacity", event?.capacity || "", 'type="number" min="1" max="999" placeholder="不限可留白"')}
            ${field('活動修改碼 <span>必填</span>', "editCode", "", `required minlength="4" placeholder="${editing ? "輸入建立時的修改碼" : "自訂至少 4 碼"}"`)}
          </div>
          ${editing ? "" : '<p class="form-hint">請記住修改碼。日後修改或取消活動時會用到。</p>'}
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions">
            ${editing ? `<button type="button" class="danger" id="toggle-event">${event.status === "cancelled" ? "恢復活動" : "取消活動"}</button>` : ""}
            <button type="button" class="secondary" data-close>返回</button>
            <button type="submit" class="primary">${editing ? "儲存修改" : "建立並分享"}</button>
          </div>
        </form>
      </section>
    </div>`;

  const form = document.querySelector("#event-form");
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "儲存中…";
    const body = Object.fromEntries(new FormData(form));
    body.capacity = body.capacity ? Number(body.capacity) : null;
    if (editing) body.id = event.id;
    await save(`${API}/events`, editing ? "PATCH" : "POST", body, editing ? "活動內容已更新" : "活動已建立，可以分享給家人了", form);
    button.disabled = false;
    button.textContent = editing ? "儲存修改" : "建立並分享";
  });

  document.querySelector("#toggle-event")?.addEventListener("click", async () => {
    const editCode = form.elements.editCode.value.trim();
    if (!editCode) return showFormError(form, "請先輸入活動修改碼");
    await save(`${API}/events`, "PATCH", {
      id: event.id, editCode, status: event.status === "cancelled" ? "active" : "cancelled",
    }, event.status === "cancelled" ? "活動已恢復" : "活動已取消", form);
  });
}

function openRsvpForm(event) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal rsvp-modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">回覆活動</p><h2 id="rsvp-title">${esc(event.title)}</h2>
        <p class="modal-event-meta">${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}<br>${esc(event.location)}</p>
        <form id="rsvp-form">
          ${field('您的姓名 <span>必填</span>', "name", "", 'required autofocus placeholder="例如：王奶奶"')}
          <fieldset><legend>是否參加？</legend>
            <label class="choice"><input type="radio" name="response" value="attending" checked><span>✓ 我要參加</span></label>
            <label class="choice"><input type="radio" name="response" value="not_attending"><span>這次無法參加</span></label>
          </fieldset>
          <div id="attending-fields">
            <label>總共幾人參加？<select name="partySize">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1} 人</option>`).join("")}</select></label>
            ${field("飲食需求", "diet", "", 'placeholder="例如：吃素、不吃牛（可留白）"')}
            <label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白"></textarea></label>
          </div>
          <p class="form-hint">同一姓名再次回覆，會更新原本的答案。</p>
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button type="submit" class="primary">確認送出</button></div>
        </form>
      </section>
    </div>`;
  const form = document.querySelector("#rsvp-form");
  form.addEventListener("change", () => {
    document.querySelector("#attending-fields").hidden = form.elements.response.value !== "attending";
  });
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.eventId = event.id;
    body.partySize = Number(body.partySize || 1);
    await save(`${API}/rsvps`, "POST", body, "已收到回覆，期待見面！", form);
  });
}

function showFormError(form, message) {
  const box = form.querySelector("#form-error");
  box.textContent = message;
  box.hidden = false;
}

async function save(url, method, body, successMessage, form) {
  try {
    const response = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失敗");
    closeModal();
    showNotice(successMessage);
    await loadEvents();
  } catch (error) {
    showFormError(form, error.message || "操作失敗");
  }
}

function closeModal() {
  modalRoot.innerHTML = "";
}

async function shareEvent(event) {
  const url = `${location.origin}/?event=${encodeURIComponent(event.id)}`;
  try {
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatDate(event.eventDate)} ${event.startTime}｜${event.location}`, url });
    else {
      await navigator.clipboard.writeText(url);
      showNotice("活動網址已複製，可以貼到 LINE 分享");
    }
  } catch {}
}

document.addEventListener("click", (clickEvent) => {
  const create = clickEvent.target.closest("[data-create]");
  if (create) return openEventForm();
  const close = clickEvent.target.closest("[data-close]");
  if (close || clickEvent.target.classList.contains("modal-backdrop")) return closeModal();
  if (clickEvent.target.id === "retry") return loadEvents();
  const action = clickEvent.target.closest("[data-action]");
  if (!action) return;
  const event = events.find((item) => item.id === action.dataset.id);
  if (!event) return;
  if (action.dataset.action === "rsvp") openRsvpForm(event);
  if (action.dataset.action === "edit") openEventForm(event);
  if (action.dataset.action === "share") shareEvent(event);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
loadEvents();
