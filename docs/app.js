const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
let events = [];

const eventsRoot = document.querySelector("#events");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#error");
const noticeBox = document.querySelector("#notice");
const modalRoot = document.querySelector("#modal-root");

function managerAuthFromLink() {
  const eventId = new URLSearchParams(location.search).get("manage") || "";
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  return eventId && token ? { type: "token", value: token, eventId } : null;
}

function managerCredentials(managerAuth) {
  return managerAuth?.type === "token"
    ? { managerToken: managerAuth.value }
    : { editCode: managerAuth?.value || "" };
}

function managerPayload(eventId, managerAuth) {
  return { eventId, ...managerCredentials(managerAuth) };
}

function eventManagerPayload(eventId, managerAuth) {
  return { id: eventId, ...managerCredentials(managerAuth) };
}

function managerUrl(eventId, managerToken) {
  return `${location.origin}/?manage=${encodeURIComponent(eventId)}#token=${encodeURIComponent(managerToken)}`;
}

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

async function trackSiteVisit() {
  const countBox = document.querySelector("#visitor-count");
  const countValue = document.querySelector("#visitor-count-value");
  if (!countBox || !countValue) return;
  try {
    const response = await fetch(`${API}/site-stats`, { method: "POST", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || typeof data.views !== "number") throw new Error("瀏覽人次暫時無法取得");
    countValue.textContent = new Intl.NumberFormat("zh-TW").format(data.views);
  } catch {
    countBox.hidden = true;
  }
}

function eventCard(event) {
  const parts = dateParts(event.eventDate);
  const people = event.summary?.attendingPeople || 0;
  const isFull = Boolean(event.capacity && people >= event.capacity);
  const contact = event.contactName
    ? `<p class="contact">活動聯絡人：${esc(event.contactName)}</p>` : "";
  return `
    <article class="event-card ${event.status === "cancelled" ? "cancelled" : ""}" id="event-${esc(event.id)}">
      <div class="date-block"><span>${esc(parts.month)}</span><strong>${esc(parts.day)}</strong></div>
      <div class="event-body">
        <div class="event-title-row"><h3>${esc(event.title)}</h3>${event.status === "cancelled" ? '<span class="status-cancelled">已取消</span>' : ""}</div>
        <p class="event-meta"><span aria-hidden="true">◷</span>${esc(event.startTime || "時間未定")}</p>
        <p class="event-meta"><span aria-hidden="true">⌖</span>${esc(event.location || "地點未定")}</p>
        ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
        <div class="attendance"><strong>${people} 人參加</strong><span>${event.capacity ? `／上限 ${event.capacity} 人` : "歡迎全家一起來"}</span></div>
        <p class="privacy-note">聯絡電話、姓名與飲食備註僅活動管理者可查看</p>
        <div class="card-actions">
          <button class="primary" data-action="rsvp" data-id="${esc(event.id)}" ${event.status === "cancelled" ? "disabled" : ""}>${isFull ? "活動已額滿" : "我要參加"}</button>
          <button class="icon-button" data-action="share" data-id="${esc(event.id)}">分享</button>
          <button class="icon-button" data-action="admin" data-id="${esc(event.id)}">管理</button>
        </div>
        ${contact}
      </div>
    </article>`;
}

function renderEvents() {
  if (!events.length) {
    eventsRoot.innerHTML = `<div class="empty-state"><div class="empty-sun" aria-hidden="true">☀</div><h3>還沒有公開活動</h3><p>從一頓飯、一次散步開始，建立第一個全家人的好日子。</p><button class="primary" data-create>建立活動</button></div>`;
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

function openEventForm(event, managerAuth = null) {
  const editing = Boolean(event);
  const managerField = editing
    ? '<p class="form-hint">已完成建立者驗證；儲存、取消與永久刪除都會使用目前的建立者權限。</p>'
    : '<label>活動管理碼 <span>至少 6 個字元；用來找回與管理活動</span><input name="editCode" required minlength="6" autocomplete="new-password" placeholder="請妥善保存，不會提供給參加者"></label>';
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">${editing ? "管理活動" : "新的相聚"}</p>
        <h2 id="event-form-title">${editing ? "修改活動" : "建立活動"}</h2>
        <form id="event-form">
          ${field('活動名稱 <span>必填</span>', "title", event?.title, 'required placeholder="例如：阿嬤生日午餐"')}
          ${field('建立者姓名 <span>必填；僅用於遺失連結後找回活動</span>', "creatorName", event?.creatorName, 'required placeholder="例如：王小明"')}
          <div class="form-row">
            ${field('日期 <span>必填</span>', "eventDate", event?.eventDate, 'required type="date"')}
            ${field('時間 <span>必填</span>', "startTime", event?.startTime, 'required type="time"')}
          </div>
          ${field('地點 <span>必填</span>', "location", event?.location, 'required placeholder="餐廳名稱或地址"')}
          <label>活動說明<textarea name="description" rows="3" placeholder="要帶什麼？在哪裡集合？">${esc(event?.description)}</textarea></label>
          <fieldset class="access-options"><legend>活動公開方式</legend>
            <p class="access-privacy-note">差別在於活動是否會出現在首頁，以及參加時是否需要參加碼。無論選哪一種，姓名、飲食與備註都只會由活動管理者查看。</p>
            <label class="choice"><input type="radio" name="accessMode" value="unlisted" ${(!event || event.accessMode === "unlisted") ? "checked" : ""}><span><strong>不公開，免密碼（推薦）</strong><small>不會出現在首頁；拿到專屬連結的人可查看與參加。</small></span></label>
            <label class="choice"><input type="radio" name="accessMode" value="private" ${event?.accessMode === "private" ? "checked" : ""}><span><strong>不公開＋參加碼</strong><small>拿到連結後仍需輸入參加碼，適合私人或敏感活動。</small></span></label>
            <label class="choice"><input type="radio" name="accessMode" value="public" ${event?.accessMode === "public" ? "checked" : ""}><span><strong>完全公開</strong><small>會出現在首頁，任何訪客都能查看與參加。</small></span></label>
          </fieldset>
          <fieldset class="access-options"><legend>參加者名單顯示方式</legend>
            <p class="access-privacy-note">預設只顯示參加人數。只有已成功報名的參加者，才可能看到依本設定公開的姓名；電話、飲食、備註與管理資料永不公開。</p>
            <label class="choice"><input type="radio" name="attendanceVisibility" value="count" ${(!event || !event.attendanceVisibility || event.attendanceVisibility === "count") ? "checked" : ""}><span><strong>僅顯示人數（預設）</strong><small>例如：目前 12 人參加。</small></span></label>
            <label class="choice"><input type="radio" name="attendanceVisibility" value="opt_in" ${event?.attendanceVisibility === "opt_in" ? "checked" : ""}><span><strong>自願公開名單（推薦）</strong><small>參加者可自行同意是否公開顯示名稱。</small></span></label>
            <label class="choice"><input type="radio" name="attendanceVisibility" value="all" ${event?.attendanceVisibility === "all" ? "checked" : ""}><span><strong>全部名單</strong><small>所有已參加者的顯示名稱皆可見，適合熟人小群組。</small></span></label>
          </fieldset>
          <label id="participant-code-field" ${event?.accessMode === "private" ? "" : "hidden"}>參加碼 <span>私人活動必填</span><input name="participantCode" minlength="4" autocomplete="new-password" placeholder="自訂至少 4 碼；留白代表不變"></label>
          <div class="form-row">
            ${field("聯絡人", "contactName", event?.contactName, 'placeholder="王小明"')}
            ${field("聯絡電話（僅管理者可見）", "contactPhone", event?.contactPhone, 'inputmode="tel" placeholder="0912 345 678"')}
          </div>
          ${field("人數上限", "capacity", event?.capacity || "", 'type="number" min="1" max="999" placeholder="不限可留白"')}
          ${managerField}
          ${editing ? "" : '<p class="form-hint">系統同時建立專屬管理連結。管理碼可用於遺失管理連結後找回活動；兩者皆可修改、取消、永久刪除與設定 LINE 提醒。</p>'}
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions">
            ${editing ? `<button type="button" class="danger" id="toggle-event">${event.status === "cancelled" ? "恢復活動" : "取消活動"}</button>` : ""}
            ${editing ? '<button type="button" class="text-danger" id="delete-event">永久刪除</button>' : ""}
            <button type="button" class="secondary" data-close>返回</button>
            <button type="submit" class="primary">${editing ? "儲存修改" : "建立活動"}</button>
          </div>
        </form>
      </section>
    </div>`;

  const form = document.querySelector("#event-form");
  const participantCodeField = form.querySelector("#participant-code-field");
  const syncParticipantCode = () => {
    const privateMode = form.elements.accessMode.value === "private";
    participantCodeField.hidden = !privateMode;
    const input = form.elements.participantCode;
    input.required = privateMode && !event?.accessMode?.includes("private");
  };
  form.addEventListener("change", syncParticipantCode);
  syncParticipantCode();
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "儲存中…";
    const body = Object.fromEntries(new FormData(form));
    body.capacity = body.capacity ? Number(body.capacity) : null;
    if (editing) Object.assign(body, eventManagerPayload(event.id, managerAuth));
    const data = await save(`${API}/events`, editing ? "PATCH" : "POST", body, editing ? "活動內容已更新" : "活動已建立", form);
    if (!data) {
      button.disabled = false;
      button.textContent = original;
    } else if (!editing) {
      const creatorAuth = { type: "code", value: body.editCode };
      openCreatorNextSteps({ ...body, id: data.id, shareUrl: data.shareUrl }, creatorAuth, data.managerUrl);
    }
  });

  document.querySelector("#toggle-event")?.addEventListener("click", async () => {
    await save(`${API}/events`, "PATCH", {
      ...eventManagerPayload(event.id, managerAuth), status: event.status === "cancelled" ? "active" : "cancelled",
    }, event.status === "cancelled" ? "活動已恢復" : "活動已取消", form);
  });

  document.querySelector("#delete-event")?.addEventListener("click", async () => {
    if (!confirm("永久刪除後，所有報名資料、LINE 綁定與提醒紀錄都無法復原。要繼續嗎？")) return;
    if (prompt(`請輸入活動名稱「${event.title}」以確認永久刪除`) !== event.title) return;
    try {
      const response = await fetch(`${API}/events`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventManagerPayload(event.id, managerAuth)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "永久刪除失敗");
      closeModal();
      showNotice("活動已永久刪除");
      await loadEvents();
    } catch (error) { showFormError(form, error.message || "永久刪除失敗"); }
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
            <label>總共幾人參加？<input name="partySize" type="number" min="1" step="1" inputmode="numeric" value="1" required></label>
            ${field("飲食需求", "diet", "", 'placeholder="例如：吃素、不吃牛（可留白）"')}
            <label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白"></textarea></label>
            ${event.attendanceVisibility === "opt_in" ? '<label class="toggle"><input name="shareName" type="checkbox" value="true"><span>公開我的顯示名稱給同場參加者</span></label>' : ""}
            ${event.attendanceVisibility === "all" ? '<p class="form-hint">此活動設定為全部名單，完成報名後您的顯示名稱會提供給已報名的同場參加者查看。</p>' : ""}
          </div>
          <p class="form-hint">要取消自己的報名，請用原先報名的裝置再次輸入相同姓名，並選擇「這次無法參加」。資料僅活動管理者可查看。</p>
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
    try {
      const shareToken = new URL(event.shareUrl).searchParams.get("s");
      if (shareToken) {
        body.shareToken = shareToken;
        body.attendeeToken = localStorage.getItem(`good-days-rsvp:${shareToken}`) || "";
      }
    } catch {}
    const data = await save(`${API}/rsvps`, "POST", body, "已收到回覆，期待見面！", form);
    if (data?.attendeeToken && event.shareUrl) {
      try {
        const shareToken = new URL(event.shareUrl).searchParams.get("s");
        if (shareToken) localStorage.setItem(`good-days-rsvp:${shareToken}`, data.attendeeToken);
      } catch {}
    }
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
      const managerAuth = { type: "code", value: editCode };
      const data = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
      openAdminDashboard(data, managerAuth);
    } catch (error) {
      showFormError(form, error.message);
      button.disabled = false;
      button.textContent = "開啟管理後台";
    }
  });
}

async function openAdminFromCredential(eventId, managerAuth, errorBox) {
  try {
    const data = await requestJson("/admin/event", managerPayload(eventId, managerAuth));
    openAdminDashboard(data, managerAuth);
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message || "無法開啟建立者管理區";
      errorBox.hidden = false;
    }
    else showNotice(error.message || "無法開啟建立者管理區");
  }
}

function openCreatorNextSteps(event, managerAuth, issuedManagerUrl = "") {
  const shareUrl = event.shareUrl;
  const privateManagerUrl = managerAuth.type === "token"
    ? (issuedManagerUrl || managerUrl(event.id, managerAuth.value))
    : "";
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="created-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">活動已建立</p><h2 id="created-title">下一步：分享或綁定 LINE</h2>
      <p>活動邀請已建立完成。現在就可以加入 LINE 小幫手並產生群組綁定碼。</p>
      <label>活動分享連結<input id="created-share-url" value="${esc(shareUrl)}" readonly></label>
      ${privateManagerUrl ? `<div class="line-status warning"><strong>請保存建立者管理連結</strong><p>這個連結可修改、取消或永久刪除活動，也可管理 LINE 小幫手；請勿分享給參加者。</p><label>建立者管理連結<input id="created-manager-url" value="${esc(privateManagerUrl)}" readonly></label><button class="secondary" id="copy-manager-link">複製管理連結</button></div>` : ""}
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="form-actions"><button class="secondary" id="copy-created-share">複製分享連結</button><button class="primary" id="start-line-binding">現在綁定 LINE 小幫手</button></div>
    </section></div>`;
  document.querySelector("#copy-created-share").addEventListener("click", async () => {
    await navigator.clipboard.writeText(shareUrl);
    showNotice("活動分享連結已複製");
  });
  document.querySelector("#copy-manager-link")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(privateManagerUrl);
    showNotice("建立者管理連結已複製，請妥善保存");
  });
  document.querySelector("#start-line-binding").addEventListener("click", () => {
    void openAdminFromCredential(event.id, managerAuth, document.querySelector("#form-error"));
  });
}

function openCreatorRecovery() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">建立者專用</p><h2 id="recovery-title">找回我的活動</h2>
      <p>先輸入建立者姓名。搜尋結果只會顯示完全符合的姓名；活動內容、連結與 QR Code 都會保持鎖定。</p>
      <form id="recovery-search-form"><label>建立者姓名<input name="creatorName" required minlength="2" autofocus autocomplete="name"></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">搜尋</button></div></form>
    </section></div>`;
  const form = document.querySelector("#recovery-search-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const creatorName = form.elements.creatorName.value.trim();
    try {
      const data = await requestJson("/creator-recovery", { action: "search", creatorName });
      if (!data.matches?.length) throw new Error("找不到符合的建立者姓名");
      openCreatorRecoveryUnlock(creatorName);
    } catch (error) { showFormError(form, error.message || "無法搜尋活動"); }
  });
}

function openCreatorRecoveryUnlock(creatorName) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">搜尋結果</p><h2 id="unlock-title">${esc(creatorName)}</h2>
      <div class="locked-recovery"><span aria-hidden="true">🔒</span><div><strong>活動內容已鎖定</strong><p>輸入建立活動時設定的管理碼，才能查看並分享活動連結。</p></div></div>
      <form id="recovery-unlock-form"><label>活動管理碼<input name="editCode" required minlength="4" autofocus autocomplete="current-password"></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" id="recovery-back">返回</button><button class="primary">解鎖活動</button></div></form>
    </section></div>`;
  document.querySelector("#recovery-back").addEventListener("click", openCreatorRecovery);
  const form = document.querySelector("#recovery-unlock-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editCode = form.elements.editCode.value.trim();
    try {
      const data = await requestJson("/creator-recovery", { action: "unlock", creatorName, editCode });
      openRecoveredActivities(data.activities || [], editCode);
    } catch (error) { showFormError(form, error.message || "無法解鎖活動"); }
  });
}

function openRecoveredActivities(activities, editCode) {
  const cards = activities.map((event) => `
    <article class="recovered-activity"><div><strong>${esc(event.title)}</strong><span>${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}${event.status === "cancelled" ? " · 已取消" : ""}</span></div><div class="inline-actions"><button class="secondary" data-recovery-share="${esc(event.id)}">分享連結／QR</button><button class="primary" data-recovery-manage="${esc(event.id)}">管理活動</button></div></article>`).join("");
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="recovered-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">已解鎖</p><h2 id="recovered-title">我的活動</h2>
      <div class="recovered-activities">${cards || '<p class="form-hint">沒有可顯示的活動。</p>'}</div>
    </section></div>`;
  for (const event of activities) {
    document.querySelector(`[data-recovery-share="${CSS.escape(event.id)}"]`)?.addEventListener("click", () => openSharePanel(event));
    document.querySelector(`[data-recovery-manage="${CSS.escape(event.id)}"]`)?.addEventListener("click", () => {
      void openAdminFromCredential(event.id, { type: "code", value: editCode });
    });
  }
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
      <p>${binding ? "自動提醒會傳送到這個群組；輸入「活動」可廣播活動連結與 QR Code，輸入「原神啟動」可廣播報名名單與人數、飲食、備註。" : "先產生 6 位數綁定碼，再到家族 LINE 群組輸入。"}</p>
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

function openAdminDashboard(data, managerAuth) {
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
          <button class="secondary" id="show-share">分享連結與 QR Code</button>
          ${managerAuth.type === "token" ? '<button class="secondary" id="show-manager-link">複製建立者管理連結</button>' : ""}
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

  document.querySelector("#edit-from-admin").addEventListener("click", () => openEventForm(event, managerAuth));
  document.querySelector("#show-share").addEventListener("click", () => openSharePanel(event));
  document.querySelector("#show-manager-link")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(managerUrl(event.id, managerAuth.value));
    showNotice("建立者管理連結已複製，請勿分享給參加者");
  });
  document.querySelector("#export-rsvps").addEventListener("click", () => exportRsvps(event, data.rsvps));
  document.querySelector("#line-code")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      const result = await requestJson("/admin/line", {
        action: "create_binding_code", ...managerPayload(event.id, managerAuth),
      });
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
        action: "save_settings", ...managerPayload(event.id, managerAuth),
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
      await requestJson("/admin/line", {
        action: "send_test", ...managerPayload(event.id, managerAuth),
      });
      showNotice("測試提醒已傳到 LINE 群組");
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector("#line-unbind")?.addEventListener("click", async () => {
    if (!confirm("確定解除這個活動的 LINE 群組綁定？")) return;
    try {
      await requestJson("/admin/line", { action: "unbind", ...managerPayload(event.id, managerAuth) });
      const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
      openAdminDashboard(fresh, managerAuth);
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
  const box = form.querySelector("#form-error, .form-error");
  if (!box) return;
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
    return data;
  } catch (error) {
    showFormError(form, error.message || "操作失敗");
    return null;
  }
}

function closeModal() { modalRoot.innerHTML = ""; }

async function shareEvent(event) {
  const url = event.shareUrl || `${location.origin}/?event=${encodeURIComponent(event.id)}`;
  try {
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatDate(event.eventDate)} ${event.startTime}｜${event.location}`, url });
    else {
      await navigator.clipboard.writeText(url);
      showNotice("活動網址已複製，可以貼到 LINE 分享");
    }
  } catch {}
}

function qrDataUrl(url) {
  if (typeof qrcode !== "function") return "";
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createDataURL(8, 4);
}

function openSharePanel(event) {
  const url = event.shareUrl;
  const qr = qrDataUrl(url);
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal compact-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">專屬活動連結</p><h2 id="share-title">${esc(event.title || "分享活動")}</h2>
        <p>此活動有自己的頁面。${event.accessMode === "private" ? "開啟後還需要輸入參加碼。" : "把連結或 QR Code 分享給家人即可。"}</p>
        <label>分享連結<input id="share-url" value="${esc(url)}" readonly></label>
        <div class="inline-actions"><button class="primary" id="copy-share">複製連結</button><button class="secondary" id="native-share">分享…</button></div>
        ${qr ? `<figure class="qr-card"><img src="${qr}" alt="活動 QR Code"><figcaption>讓家人用手機相機掃描開啟活動</figcaption><a class="secondary download-qr" href="${qr}" download="${esc(event.title || "活動")}-QR-Code.png">下載 QR Code</a></figure>` : ""}
      </section>
    </div>`;
  document.querySelector("#copy-share").addEventListener("click", async () => {
    await navigator.clipboard.writeText(url);
    showNotice("活動專屬連結已複製");
  });
  document.querySelector("#native-share").addEventListener("click", async () => {
    if (navigator.share) await navigator.share({ title: event.title || "活動邀請", url });
    else await navigator.clipboard.writeText(url);
  });
}

document.addEventListener("click", (clickEvent) => {
  const create = clickEvent.target.closest("[data-create]");
  if (create) return openEventForm();
  if (clickEvent.target.closest("[data-recover]")) return openCreatorRecovery();
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
trackSiteVisit();
const linkedManager = managerAuthFromLink();
if (linkedManager) void openAdminFromCredential(linkedManager.eventId, linkedManager);
