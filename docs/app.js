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
    year: "numeric", month: "long", day: "numeric", weekday: "short",
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
  window.setTimeout(() => { noticeBox.hidden = true; }, 5000);
}

function eventCard(event) {
  const parts = dateParts(event.eventDate);
  const people = event.summary?.attendingPeople || 0;
  const contact = event.contactName || event.contactPhone
    ? `<p class="contact">活動聯絡人：${esc(event.contactName)}${event.contactPhone ? ` · <a href="tel:${esc(event.contactPhone)}">${esc(event.contactPhone)}</a>` : ""}</p>` : "";
  return `
    <article class="event-card ${event.status === "cancelled" ? "cancelled" : ""}" id="event-${esc(event.id)}">
      <div class="date-block"><span>${esc(parts.month)}</span><strong>${esc(parts.day)}</strong></div>
      <div class="event-body">
        <div class="event-title-row"><h3>${esc(event.title)}</h3>${event.status === "cancelled" ? '<span class="status-cancelled">已取消</span>' : ""}</div>
        <p class="event-meta"><span aria-hidden="true">◷</span>${esc(event.startTime || "時間未定")}</p>
        <p class="event-meta"><span aria-hidden="true">⌖</span>${esc(event.location || "地點未定")}</p>
        ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
        <div class="attendance"><strong>${people} 人參加</strong><span>${event.capacity ? `／上限 ${event.capacity} 人` : "歡迎全家一起來"}</span></div>
        <p class="privacy-note">姓名與飲食備註僅活動管理者可查看</p>
        <div class="card-actions">
          <button class="primary" data-action="rsvp" data-id="${esc(event.id)}" ${event.status === "cancelled" ? "disabled" : ""}>我要參加</button>
          <button class="icon-button" data-action="share" data-id="${esc(event.id)}">分享</button>
          <button class="icon-button" data-action="admin" data-id="${esc(event.id)}">管理</button>
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

async function requestJson(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失敗");
  return data;
}

function openEventForm(event, knownEditCode = "") {
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
            ${field('活動管理碼 <span>必填</span>', "editCode", knownEditCode, `required minlength="4" placeholder="${editing ? "輸入活動管理碼" : "自訂至少 4 碼"}"`)}
          </div>
          ${editing ? "" : '<p class="form-hint">管理碼可查看私人名單、修改活動及設定 LINE 提醒，請妥善保存。</p>'}
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions">
            ${editing ? `<button type="button" class="danger" id="toggle-event">${event.status === "cancelled" ? "恢復活動" : "取消活動"}</button>` : ""}
            <button type="button" class="secondary" data-close>返回</button>
            <button type="submit" class="primary">${editing ? "儲存修改" : "建立活動"}</button>
          </div>
        </form>
      </section>
    </div>`;

  const form = document.querySelector("#event-form");
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "儲存中…";
    const body = Object.fromEntries(new FormData(form));
    body.capacity = body.capacity ? Number(body.capacity) : null;
    if (editing) body.id = event.id;
    const ok = await save(`${API}/events`, editing ? "PATCH" : "POST", body, editing ? "活動內容已更新" : "活動已建立，可以分享給家人了", form);
    if (!ok) {
      button.disabled = false;
      button.textContent = original;
    }
  });

  document.querySelector("#toggle-event")?.addEventListener("click", async () => {
    const editCode = form.elements.editCode.value.trim();
    if (!editCode) return showFormError(form, "請先輸入活動管理碼");
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
          <p class="form-hint">同一姓名再次回覆，會更新原本的答案。資料僅活動管理者可查看。</p>
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

function openAdminLogin(event) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">私人管理區</p><h2 id="admin-login-title">管理 ${esc(event.title)}</h2>
        <p>輸入建立活動時設定的管理碼，才能查看參與者名單與 LINE 提醒。</p>
        <form id="admin-login-form">
          ${field('活動管理碼 <span>必填</span>', "editCode", "", 'required minlength="4" inputmode="text" autofocus autocomplete="current-password"')}
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button type="submit" class="primary">開啟管理後台</button></div>
        </form>
      </section>
    </div>`;
  const form = document.querySelector("#admin-login-form");
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const editCode = form.elements.editCode.value.trim();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "驗證中…";
    try {
      const data = await requestJson("/admin/event", { eventId: event.id, editCode });
      openAdminDashboard(data, editCode);
    } catch (error) {
      showFormError(form, error.message);
      button.disabled = false;
      button.textContent = "開啟管理後台";
    }
  });
}

function responseLabel(value) {
  return value === "attending" ? "參加" : "不參加";
}

function adminRows(rsvps) {
  if (!rsvps.length) return '<tr><td colspan="6" class="empty-cell">尚未收到回覆</td></tr>';
  return rsvps.map((item) => `<tr>
    <td><strong>${esc(item.name)}</strong></td><td><span class="response-pill ${esc(item.response)}">${responseLabel(item.response)}</span></td>
    <td>${item.response === "attending" ? `${item.partySize} 人` : "—"}</td><td>${esc(item.diet || "—")}</td>
    <td>${esc(item.note || "—")}</td><td>${esc(new Date(item.updatedAt).toLocaleString("zh-TW"))}</td>
  </tr>`).join("");
}

function linePanel(line) {
  if (!line.configured) return `
    <div class="line-status warning"><strong>LINE 機器人程式已完成，等待填入兩個 LINE 憑證</strong>
      <p>請依照 <a href="/line-bot-guide.html" target="_blank">LINE 機器人設定教學</a> 建立官方帳號，完成後即可產生群組綁定碼。</p></div>`;
  const binding = line.binding;
  return `
    <div class="line-status ${binding ? "connected" : ""}">
      <strong>${binding ? `已綁定：${esc(binding.groupName)}` : "尚未綁定 LINE 群組"}</strong>
      <p>${binding ? "自動提醒會傳送到這個群組。" : "先產生 6 位數綁定碼，再到家族 LINE 群組輸入。"}</p>
      <div id="binding-code-area"></div>
      <div class="inline-actions">
        ${binding ? '<button class="secondary" id="line-test">傳送測試提醒</button><button class="text-danger" id="line-unbind">解除綁定</button>' : '<button class="line-button" id="line-code">產生群組綁定碼</button>'}
      </div>
    </div>
    <fieldset class="reminder-options"><legend>自動提醒時間</legend>
      <label class="toggle"><input type="checkbox" name="sevenDays" ${line.settings.sevenDays ? "checked" : ""}><span>活動前 7 天</span></label>
      <label class="toggle"><input type="checkbox" name="oneDay" ${line.settings.oneDay ? "checked" : ""}><span>活動前 1 天</span></label>
      <label class="toggle"><input type="checkbox" name="twoHours" ${line.settings.twoHours ? "checked" : ""}><span>活動前 2 小時</span></label>
      <button class="secondary" id="line-settings">儲存提醒設定</button>
    </fieldset>`;
}

function openAdminDashboard(data, editCode) {
  const event = data.event;
  const remaining = event.capacity ? Math.max(0, event.capacity - data.summary.attendingPeople) : null;
  modalRoot.innerHTML = `
    <div class="modal-backdrop admin-backdrop">
      <section class="modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">活動管理後台</p><h2 id="admin-title">${esc(event.title)}</h2>
        <p class="modal-event-meta">${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}<br>${esc(event.location)}</p>
        <div class="stats-grid">
          <div><strong>${data.summary.attendingPeople}</strong><span>參加人數</span></div>
          <div><strong>${data.summary.attendingReplies}</strong><span>參加回覆</span></div>
          <div><strong>${data.summary.notAttendingReplies}</strong><span>不參加</span></div>
          <div><strong>${remaining === null ? "不限" : remaining}</strong><span>剩餘名額</span></div>
        </div>
        <div class="admin-toolbar">
          <button class="primary" id="edit-from-admin">修改活動</button>
          <button class="secondary" id="export-rsvps">下載 CSV 名單</button>
        </div>
        <section class="admin-section">
          <div class="admin-section-title"><div><p class="eyebrow">僅管理者可見</p><h3>參與者名單</h3></div><span>${data.rsvps.length} 筆回覆</span></div>
          <div class="table-scroll"><table><thead><tr><th>姓名</th><th>回覆</th><th>人數</th><th>飲食</th><th>備註</th><th>更新時間</th></tr></thead><tbody>${adminRows(data.rsvps)}</tbody></table></div>
        </section>
        <section class="admin-section line-section">
          <div class="admin-section-title"><div><p class="eyebrow line-eyebrow">LINE 群組</p><h3>自動提醒機器人</h3></div><a href="/line-bot-guide.html" target="_blank">查看設定教學</a></div>
          ${linePanel(data.line)}
          <p class="form-error" id="line-error" role="alert" hidden></p>
        </section>
      </section>
    </div>`;

  document.querySelector("#edit-from-admin").addEventListener("click", () => openEventForm(event, editCode));
  document.querySelector("#export-rsvps").addEventListener("click", () => exportRsvps(event, data.rsvps));
  document.querySelector("#line-code")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      const result = await requestJson("/admin/line", { action: "create_binding_code", eventId: event.id, editCode });
      document.querySelector("#binding-code-area").innerHTML = `<div class="binding-code"><span>請在群組輸入</span><strong>綁定 ${esc(result.code)}</strong><small>15 分鐘內有效</small></div>`;
      button.textContent = "重新產生綁定碼";
    } catch (error) {
      showLineError(error.message);
    } finally { button.disabled = false; }
  });
  document.querySelector("#line-settings")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      await requestJson("/admin/line", {
        action: "save_settings", eventId: event.id, editCode,
        sevenDays: document.querySelector('[name="sevenDays"]').checked,
        oneDay: document.querySelector('[name="oneDay"]').checked,
        twoHours: document.querySelector('[name="twoHours"]').checked,
      });
      showNotice("LINE 提醒時間已儲存");
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector("#line-test")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      await requestJson("/admin/line", { action: "send_test", eventId: event.id, editCode });
      showNotice("測試提醒已傳到 LINE 群組");
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector("#line-unbind")?.addEventListener("click", async () => {
    if (!confirm("確定解除這個活動的 LINE 群組綁定？")) return;
    try {
      await requestJson("/admin/line", { action: "unbind", eventId: event.id, editCode });
      const fresh = await requestJson("/admin/event", { eventId: event.id, editCode });
      openAdminDashboard(fresh, editCode);
      showNotice("已解除 LINE 群組綁定");
    } catch (error) { showLineError(error.message); }
  });
}

function showLineError(message) {
  const box = document.querySelector("#line-error");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportRsvps(event, rsvps) {
  const rows = [
    ["姓名", "回覆", "參加人數", "飲食需求", "備註", "更新時間"],
    ...rsvps.map((item) => [item.name, responseLabel(item.response), item.response === "attending" ? item.partySize : 0, item.diet, item.note, item.updatedAt]),
  ];
  const blob = new Blob(["\ufeff", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${event.title}-參與名單.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
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
    return true;
  } catch (error) {
    showFormError(form, error.message || "操作失敗");
    return false;
  }
}

function closeModal() { modalRoot.innerHTML = ""; }

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
  if (action.dataset.action === "admin") openAdminLogin(event);
  if (action.dataset.action === "share") shareEvent(event);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
loadEvents();
