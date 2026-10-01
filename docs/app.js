const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
let events = [];

const eventsRoot = document.querySelector("#events");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#error");
const noticeBox = document.querySelector("#notice");
const modalRoot = document.querySelector("#modal-root");
let activeModalClose = null;

function managerAuthFromLink() {
  const eventId = new URLSearchParams(location.search).get("manage") || "";
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get("token") || "";
  let editCode = hash.get("code") || "";
  if (!editCode && eventId) {
    try { editCode = sessionStorage.getItem(`good-days-manager-code:${eventId}`) || ""; } catch {}
  }
  if (!eventId) return null;
  if (token) return { type: "token", value: token, eventId };
  return editCode ? { type: "code", value: editCode, eventId } : null;
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

function formatMoney(value) {
  return `NT$${new Intl.NumberFormat("zh-TW").format(Math.max(0, Number(value) || 0))}`;
}

function rsvpStorageKey(shareToken, name) {
  const safeName = String(name || "").trim();
  return shareToken && safeName ? `good-days-rsvp:${shareToken}:${encodeURIComponent(safeName)}` : "";
}

function formatDate(value) {
  if (!value) return "日期未定";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value) {
  if (!value) return "日期未定";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${value} (${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]})`;
}

function googleMapsUrl(event) {
  const query = String(event?.address || event?.location || "").trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function eventLocationDetails(event) {
  const venue = event.location || "地點未定";
  const address = String(event.address || "").trim();
  const mapUrl = googleMapsUrl(event);
  return `<p class="event-meta"><span aria-hidden="true">⌖</span>地點｜${esc(venue)}</p>
    ${address ? `<p class="event-meta event-address"><span aria-hidden="true">⌂</span>地址｜${esc(address)}</p>` : ""}
    ${mapUrl ? `<a class="map-link" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">在 Google 地圖開啟</a>` : ""}`;
}

function formatDateTime(value) {
  if (!value) return "時間不明";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時間不明" : date.toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
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
        <p class="event-meta"><span aria-hidden="true">▣</span>日期｜${esc(formatShortDate(event.eventDate))}</p>
        <p class="event-meta"><span aria-hidden="true">◷</span>時間｜${esc(event.startTime || "時間未定")}</p>
        ${eventLocationDetails(event)}
        ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}
        <div class="attendance"><strong>${people} 人參加</strong><span>${event.capacity ? `／上限 ${event.capacity} 人` : "歡迎全家一起來"}</span></div>
        ${event.feePerPerson > 0 ? `<p class="fee-note">活動費用：每人 ${formatMoney(event.feePerPerson)}</p>` : ""}
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

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeParts(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return { period: "", hour: "", minute: "" };
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return { period: "", hour: "", minute: "" };
  return { period: hour24 < 12 ? "am" : "pm", hour: String(hour24 % 12 || 12), minute: String(minute).padStart(2, "0") };
}

function timePicker(value = "") {
  const selected = timeParts(value);
  const options = {
    period: [["am", "上午"], ["pm", "下午"]],
    hour: Array.from({ length: 12 }, (_, index) => [String(index + 1), `${index + 1}時`]),
    minute: Array.from({ length: 60 }, (_, index) => [String(index).padStart(2, "0"), `${String(index).padStart(2, "0")}分`]),
  };
  const wheel = (name, placeholder) => {
    const current = options[name].find(([option]) => option === selected[name]);
    if (name !== "period") {
      const unit = name === "hour" ? "時" : "分";
      return `<div class="time-wheel time-wheel-editable" data-time-wheel="${name}" aria-label="${placeholder}；可直接輸入、滑鼠滾輪或上下滑動調整">
        <button type="button" class="time-wheel-arrow" data-time-step="-1" aria-label="減少 1 ${unit}">⌃</button>
        <span class="time-wheel-input-wrap"><input type="tel" class="time-wheel-input" data-time-input="${name}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="2" aria-label="${unit === "分" ? "分鐘，可手動輸入 00 到 59" : "小時，可手動輸入 1 到 12"}" placeholder="--" value="${esc(selected[name])}"><span class="time-wheel-unit" aria-hidden="true">${unit}</span></span>
        <button type="button" class="time-wheel-arrow" data-time-step="1" aria-label="增加 1 ${unit}">⌄</button>
      </div><input type="hidden" name="time${name[0].toUpperCase()}${name.slice(1)}" value="${esc(selected[name])}">`;
    }
    return `<button type="button" class="time-wheel" data-time-wheel="${name}" aria-label="${placeholder}；可點按、滑鼠滾輪或上下滑動調整">
      <span class="time-wheel-arrow" aria-hidden="true">⌃</span><span class="time-wheel-value">${current ? current[1] : placeholder}</span><span class="time-wheel-arrow" aria-hidden="true">⌄</span>
    </button><input type="hidden" name="time${name[0].toUpperCase()}${name.slice(1)}" value="${esc(selected[name])}">`;
  };
  return `<div class="time-picker" role="group" aria-labelledby="time-picker-label">
    <span class="time-picker-label" id="time-picker-label">時間</span>
    <span class="time-picker-required">必填</span>
    ${wheel("period", "午別")}
    ${wheel("hour", "時")}
    ${wheel("minute", "分")}
    <input type="hidden" name="startTime" value="${esc(value)}">
  </div>`;
}

const timeWheelOptions = {
  period: [["am", "上午"], ["pm", "下午"]],
  hour: Array.from({ length: 12 }, (_, index) => [String(index + 1), `${index + 1} 時`]),
  minute: Array.from({ length: 60 }, (_, index) => [String(index).padStart(2, "0"), `${String(index).padStart(2, "0")} 分`]),
};

function updateTimeWheel(form, name, direction) {
  const options = timeWheelOptions[name];
  const input = form.elements[`time${name[0].toUpperCase()}${name.slice(1)}`];
  const current = options.findIndex(([value]) => value === input.value);
  const next = current < 0 ? (direction > 0 ? 0 : options.length - 1) : (current + direction + options.length) % options.length;
  input.value = options[next][0];
  const control = form.querySelector(`[data-time-wheel="${name}"]`);
  const editable = control.querySelector(".time-wheel-input");
  if (editable) editable.value = options[next][0];
  else control.querySelector(".time-wheel-value").textContent = options[next][1];
  control.classList.add("is-selected");
  form.elements.startTime.value = selectedStartTime(form);
}

function updateEditableTimeInput(form, input, normalize = false) {
  const name = input.dataset.timeInput;
  const hidden = form.elements[`time${name[0].toUpperCase()}${name.slice(1)}`];
  const digits = input.value.replace(/\D/g, "").slice(0, 2);
  if (input.value !== digits) input.value = digits;
  const number = Number(digits);
  const normalized = name === "minute" ? String(number).padStart(2, "0") : String(number);
  const valid = digits !== "" && Number.isInteger(number) && timeWheelOptions[name].some(([value]) => value === normalized);
  hidden.value = valid ? normalized : "";
  if (normalize && valid) input.value = normalized;
  form.querySelector(`[data-time-wheel="${name}"]`).classList.toggle("is-selected", valid);
  form.elements.startTime.value = selectedStartTime(form);
}

function enableTimeWheels(form) {
  form.querySelectorAll("[data-time-wheel]").forEach((control) => {
    const name = control.dataset.timeWheel;
    let touchStartY = null;
    let lastTouch = 0;
    control.addEventListener("click", (event) => {
      const step = event.target.closest("[data-time-step]");
      if (step) return updateTimeWheel(form, name, Number(step.dataset.timeStep));
      if (event.target.closest(".time-wheel-input")) return;
      if (Date.now() - lastTouch > 500) updateTimeWheel(form, name, 1);
    });
    control.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.deltaY) updateTimeWheel(form, name, event.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    control.addEventListener("touchstart", (event) => { touchStartY = event.changedTouches[0]?.clientY ?? null; }, { passive: true });
    control.addEventListener("touchend", (event) => {
      const endY = event.changedTouches[0]?.clientY;
      if (touchStartY !== null && typeof endY === "number" && Math.abs(endY - touchStartY) > 18) {
        updateTimeWheel(form, name, endY < touchStartY ? 1 : -1);
        lastTouch = Date.now();
      }
      touchStartY = null;
    }, { passive: true });

    const editable = control.querySelector(".time-wheel-input");
    if (editable) {
      editable.addEventListener("focus", () => editable.select());
      editable.addEventListener("input", () => updateEditableTimeInput(form, editable));
      editable.addEventListener("change", () => updateEditableTimeInput(form, editable, true));
      editable.addEventListener("blur", () => updateEditableTimeInput(form, editable, true));
      editable.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        updateTimeWheel(form, name, event.key === "ArrowUp" ? -1 : 1);
      });
    }
  });
}

function localDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function datePartsForWheel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day ? { year, month, day } : null;
}

function dateWheelSegment(input, clientX) {
  const parts = datePartsForWheel(input.value) || datePartsForWheel(localToday());
  const rect = input.getBoundingClientRect();
  const styles = getComputedStyle(input);
  const start = rect.left + (parseFloat(styles.paddingLeft) || 14);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context || !parts) return "day";
  context.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  const width = (text) => context.measureText(text).width;
  const yearEnd = start + width(String(parts.year));
  const monthStart = yearEnd + width("/");
  const monthEnd = monthStart + width(String(parts.month).padStart(2, "0"));
  const dayStart = monthEnd + width("/");
  const dayEnd = dayStart + width(String(parts.day).padStart(2, "0"));
  const centers = [
    ["year", (start + yearEnd) / 2],
    ["month", (monthStart + monthEnd) / 2],
    ["day", (dayStart + dayEnd) / 2],
  ];
  return centers.reduce((nearest, current) => (
    Math.abs(clientX - current[1]) < Math.abs(clientX - nearest[1]) ? current : nearest
  ))[0];
}

function updateDateWheel(input, segment, direction) {
  const current = datePartsForWheel(input.value) || datePartsForWheel(localToday());
  if (!current) return;
  let next;
  if (segment === "day") {
    next = new Date(current.year, current.month - 1, current.day + direction);
  } else if (segment === "month") {
    next = new Date(current.year, current.month - 1 + direction, 1);
    next.setDate(Math.min(current.day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  } else {
    next = new Date(current.year + direction, current.month - 1, 1);
    next.setDate(Math.min(current.day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  input.value = localDateValue(next);
  input.dataset.dateSegment = segment;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enableDateWheels(form) {
  form.querySelectorAll("[data-date-wheel]").forEach((input) => {
    let selectedSegment = "day";
    const chooseSegment = (event) => {
      selectedSegment = dateWheelSegment(input, event.clientX);
      input.dataset.dateSegment = selectedSegment;
    };
    input.addEventListener("pointerdown", chooseSegment);
    input.addEventListener("click", chooseSegment);
    input.addEventListener("wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      updateDateWheel(input, selectedSegment, event.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  });
}

function selectedStartTime(form) {
  const period = form.elements.timePeriod.value;
  const hour = Number(form.elements.timeHour.value);
  const minute = Number(form.elements.timeMinute.value);
  if (!period || !Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return "";
  const hour24 = period === "pm" ? (hour % 12) + 12 : hour === 12 ? 0 : hour;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function requestJson(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失敗");
  return data;
}

function openEventForm(event, managerAuth = null, returnTo = null) {
  const editing = Boolean(event);
  const managerField = editing
    ? '<p class="form-hint">已完成管理者驗證；儲存、取消與永久刪除都會使用目前的管理權限。</p>'
    : '<label>管理碼 <span>至少 6 個字元；只保存加鹽雜湊值</span><input type="password" name="editCode" data-secret required minlength="6" autocomplete="new-password" spellcheck="false" placeholder="請妥善保存，不會提供給參加者"></label>';
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">${editing ? "管理活動" : "新的相聚"}</p>
        <h2 id="event-form-title">${editing ? "修改活動" : "建立活動"}</h2>
        <form id="event-form" autocomplete="off">
          ${field('活動名稱 <span>必填</span>', "title", event?.title, 'required autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="例如：阿嬤生日午餐"')}
          ${field('管理者名稱 <span>必填；與管理碼一起查看你管理的活動</span>', "creatorName", event?.creatorName, 'required placeholder="例如：王小明"')}
          <div class="form-row">
            ${field('日期 <span>必填；點選年、月、日後可用滑鼠滾輪調整</span>', "eventDate", event?.eventDate || localToday(), 'required type="date" data-date-wheel aria-label="日期；點選年、月、日後可用滑鼠滾輪調整"')}
            ${timePicker(event?.startTime)}
          </div>
          ${field('地點 <span>必填；填場館、店名或集合點</span>', "location", event?.location, 'required autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="例如：臺北市懷愛館"')}
          ${field('地址 <span>建議填寫；提供 Google 地圖導航</span>', "address", event?.address, 'autocomplete="street-address" autocapitalize="sentences" spellcheck="false" placeholder="例如：臺北市大安區學府里辛亥路三段330號"')}
          <label>活動說明<textarea name="description" rows="3" placeholder="要帶什麼？在哪裡集合？">${esc(event?.description)}</textarea></label>
          <details class="advanced-settings" ${editing ? "open" : ""}>
            <summary><strong>進階設定</strong><span>公開方式、名單、名額與費用</span></summary>
            <div class="advanced-settings-body">
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
          <label id="participant-code-field" ${event?.accessMode === "private" ? "" : "hidden"}>參加碼 <span>私人活動必填</span><input type="password" name="participantCode" data-secret minlength="4" autocomplete="new-password" spellcheck="false" placeholder="自訂至少 4 碼；留白代表不變"></label>
          <div class="form-row">
            ${field("聯絡人", "contactName", event?.contactName, 'placeholder="王小明"')}
            ${field("聯絡電話（僅管理者可見）", "contactPhone", event?.contactPhone, 'inputmode="tel" placeholder="0912 345 678"')}
          </div>
          ${field("人數上限", "capacity", event?.capacity || "", 'type="number" min="1" max="999" placeholder="不限可留白"')}
          <fieldset class="access-options" id="fee-options"><legend>活動費用</legend>
            <label class="choice"><input type="radio" name="feeMode" value="free" ${!event?.feePerPerson ? "checked" : ""}><span><strong>免費活動</strong><small>不記錄收款資訊。</small></span></label>
            <label class="choice"><input type="radio" name="feeMode" value="paid" ${event?.feePerPerson > 0 ? "checked" : ""}><span><strong>每人固定收費</strong><small>報名人數會自動換算每戶應收金額。</small></span></label>
            <label id="fee-per-person-field" hidden>每人費用（新台幣）<input name="feePerPerson" type="number" min="1" max="1000000" step="1" inputmode="numeric" value="${event?.feePerPerson || ""}" placeholder="例如：500"><small>管理後台可標記每筆報名為待收、已收或免收。</small></label>
          </fieldset>
            </div>
          </details>
          ${managerField}
          ${editing ? "" : '<p class="form-hint">建立後會提供專屬管理連結；也可從首頁「管理我的活動」用管理者名稱與管理碼回來。</p>'}
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions">
            ${editing ? `<button type="button" class="danger" id="toggle-event">${event.status === "cancelled" ? "恢復活動" : "取消活動"}</button>` : ""}
            ${editing ? '<button type="button" class="text-danger" id="delete-event">永久刪除</button>' : ""}
            <button type="button" class="secondary" data-close>${returnTo ? "返回管理後台" : "取消"}</button>
            <button type="submit" class="primary">${editing ? "儲存修改" : "建立活動"}</button>
          </div>
        </form>
      </section>
    </div>`;

  const form = document.querySelector("#event-form");
  const participantCodeField = form.querySelector("#participant-code-field");
  const feePerPersonField = form.querySelector("#fee-per-person-field");
  enableTimeWheels(form);
  enableDateWheels(form);
  const syncParticipantCode = () => {
    const privateMode = form.elements.accessMode.value === "private";
    participantCodeField.hidden = !privateMode;
    const input = form.elements.participantCode;
    input.required = privateMode && !event?.accessMode?.includes("private");
  };
  form.addEventListener("change", syncParticipantCode);
  syncParticipantCode();
  const syncFee = () => {
    const paid = form.elements.feeMode.value === "paid";
    feePerPersonField.hidden = !paid;
    feePerPersonField.querySelector("input").required = paid;
  };
  form.addEventListener("change", syncFee);
  syncFee();
  const initialFormState = JSON.stringify([...new FormData(form).entries()]);
  const leaveForm = () => returnTo ? returnTo() : closeModal();
  activeModalClose = () => {
    const currentFormState = JSON.stringify([...new FormData(form).entries()]);
    if (currentFormState === initialFormState) return leaveForm();
    const message = editing
      ? "尚未儲存修改，離開後變更內容會遺失。"
      : "尚未建立活動，離開後填寫內容會遺失。";
    openDiscardConfirmation(message, leaveForm);
  };
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "儲存中…";
    const body = Object.fromEntries(new FormData(form));
    body.startTime = selectedStartTime(form);
    if (!body.startTime) {
      showFormError(form, "請完成活動時間的上午／下午、時與分。");
      button.disabled = false;
      button.textContent = original;
      return;
    }
    delete body.timePeriod;
    delete body.timeHour;
    delete body.timeMinute;
    body.capacity = body.capacity ? Number(body.capacity) : null;
    body.feePerPerson = body.feeMode === "paid" ? Number(body.feePerPerson || 0) : 0;
    delete body.feeMode;
    if (editing) Object.assign(body, eventManagerPayload(event.id, managerAuth));
    const data = await save(`${API}/events`, editing ? "PATCH" : "POST", body, editing ? "活動內容已更新" : "活動已建立", form);
    if (!data) {
      button.disabled = false;
      button.textContent = original;
    } else if (editing && returnTo) {
      returnTo();
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
        <p class="modal-event-meta">${esc(formatShortDate(event.eventDate))} · ${esc(event.startTime)}<br>地點｜${esc(event.location)}${event.address ? `<br>地址｜${esc(event.address)}` : ""}</p>
        <form id="rsvp-form">
          ${field('您的姓名 <span>必填</span>', "name", "", 'required autofocus placeholder="例如：王奶奶"')}
          <fieldset><legend>是否參加？</legend>
            <label class="choice"><input type="radio" name="response" value="attending" checked><span>✓ 我要參加</span></label>
            <label class="choice"><input type="radio" name="response" value="not_attending"><span>這次無法參加</span></label>
          </fieldset>
          <div id="attending-fields">
            <label>總共幾人參加？<input name="partySize" type="number" min="1" step="1" inputmode="numeric" value="1" required></label>
            ${event.feePerPerson > 0 ? `<p class="fee-note" id="rsvp-fee-total">本戶應收：${formatMoney(event.feePerPerson)}（每人 ${formatMoney(event.feePerPerson)}）</p>` : ""}
            ${field("飲食需求", "diet", "", 'placeholder="例如：吃素、不吃牛（可留白）"')}
            <label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白"></textarea></label>
            ${event.attendanceVisibility === "opt_in" ? '<label class="toggle"><input name="shareName" type="checkbox" value="true"><span>公開我的顯示名稱給同場參加者</span></label>' : ""}
            ${event.attendanceVisibility === "all" ? '<p class="form-hint">此活動設定為全部名單，完成報名後您的顯示名稱會提供給已報名的同場參加者查看。</p>' : ""}
          </div>
          <p class="form-hint">一支手機可以代填多位親友；要更新某人的回覆，請用原先報名的裝置再次輸入相同姓名。資料僅活動管理者可查看。</p>
          <p class="form-error" id="form-error" role="alert" hidden></p>
          <div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button type="submit" class="primary">確認送出</button></div>
        </form>
      </section>
    </div>`;
  const form = document.querySelector("#rsvp-form");
  const syncRsvpFields = () => {
    const attending = form.elements.response.value === "attending";
    document.querySelector("#attending-fields").hidden = !attending;
    const total = document.querySelector("#rsvp-fee-total");
    if (total) total.textContent = `本戶應收：${formatMoney((attending ? Number(form.elements.partySize.value || 0) : 0) * event.feePerPerson)}（每人 ${formatMoney(event.feePerPerson)}）`;
  };
  form.addEventListener("change", syncRsvpFields);
  form.addEventListener("input", syncRsvpFields);
  syncRsvpFields();
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.eventId = event.id;
    body.partySize = Number(body.partySize || 1);
    try {
      const shareToken = new URL(event.shareUrl).searchParams.get("s");
      if (shareToken) {
        body.shareToken = shareToken;
        body.attendeeToken = localStorage.getItem(rsvpStorageKey(shareToken, body.name)) || "";
      }
    } catch {}
    const data = await save(`${API}/rsvps`, "POST", body, "已收到回覆，期待見面！", form);
    if (data?.attendeeToken && event.shareUrl) {
      try {
        const shareToken = new URL(event.shareUrl).searchParams.get("s");
        if (shareToken) localStorage.setItem(rsvpStorageKey(shareToken, body.name), data.attendeeToken);
      } catch {}
    }
  });
}

function openAdminLogin(event) {
  activeModalClose = closeModal;
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">私人管理區</p><h2 id="admin-login-title">管理 ${esc(event.title)}</h2>
        <p>輸入建立活動時設定的管理碼，才能查看參與者名單與 LINE 提醒。</p>
        <form id="admin-login-form">
          ${field('管理碼 <span>必填</span>', "editCode", "", 'required type="password" data-secret inputmode="text" autofocus autocomplete="current-password" spellcheck="false"')}
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

async function openAdminFromCredential(eventId, managerAuth, errorBox, returnTo = null) {
  try {
    const data = await requestJson("/admin/event", managerPayload(eventId, managerAuth));
    openAdminDashboard(data, managerAuth, returnTo);
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message || "無法開啟管理後台";
      errorBox.hidden = false;
    }
    else showNotice(error.message || "無法開啟管理後台");
  }
}

const managerReturnStorageKey = "good-days-manager-return-links";

function savedManagerReturnLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem(managerReturnStorageKey) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === "string" && typeof item.url === "string") : [];
  } catch { return []; }
}

function saveManagerReturnLink(event, url) {
  if (!url) return false;
  const entry = { id: event.id, title: event.title || "未命名活動", eventDate: event.eventDate || "", startTime: event.startTime || "", url, savedAt: Date.now() };
  const links = savedManagerReturnLinks().filter((item) => item.id !== event.id);
  links.unshift(entry);
  try { localStorage.setItem(managerReturnStorageKey, JSON.stringify(links.slice(0, 12))); return true; } catch { return false; }
}

function removeManagerReturnLink(eventId) {
  try { localStorage.setItem(managerReturnStorageKey, JSON.stringify(savedManagerReturnLinks().filter((item) => item.id !== eventId))); } catch {}
}

function openCreatorNextSteps(event, managerAuth, issuedManagerUrl = "") {
  activeModalClose = closeModal;
  const shareUrl = event.shareUrl;
  const privateManagerUrl = issuedManagerUrl || (managerAuth.type === "token" ? managerUrl(event.id, managerAuth.value) : "");
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="created-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">活動已建立</p><h2 id="created-title">下一步：分享或綁定 LINE</h2>
      <p>活動邀請已建立完成。現在就可以加入 LINE 小幫手並產生群組綁定碼。</p>
      <label>活動分享連結<input id="created-share-url" value="${esc(shareUrl)}" readonly></label>
      ${privateManagerUrl ? `<div class="line-status warning"><strong>請保存管理連結</strong><p>這個連結可修改、取消或永久刪除活動，也可管理 LINE 小幫手；請勿分享給參加者。可選擇只儲存在目前這台裝置。</p><label>管理連結<input id="created-manager-url" value="${esc(privateManagerUrl)}" readonly></label><div class="inline-actions"><button class="secondary" id="copy-manager-link">複製管理連結</button><button class="secondary" id="save-manager-return">儲存在這台裝置</button></div></div>` : ""}
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="form-actions"><button class="secondary" id="copy-created-share">複製分享連結</button><button class="primary" id="start-line-binding">現在綁定 LINE 小幫手</button></div>
    </section></div>`;
  document.querySelector("#copy-created-share").addEventListener("click", async () => {
    await navigator.clipboard.writeText(shareUrl);
    showNotice("活動分享連結已複製");
  });
  document.querySelector("#copy-manager-link")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(privateManagerUrl);
    showNotice("管理連結已複製，請妥善保存");
  });
  document.querySelector("#save-manager-return")?.addEventListener("click", (clickEvent) => {
    const saved = saveManagerReturnLink(event, privateManagerUrl);
    clickEvent.currentTarget.textContent = saved ? "已儲存於這台裝置" : "無法儲存";
    if (saved) showNotice("管理入口已儲存在這台裝置，可從「管理我的活動」直接回訪");
  });
  document.querySelector("#start-line-binding").addEventListener("click", () => {
    void openAdminFromCredential(event.id, managerAuth, document.querySelector("#form-error"));
  });
}

function openCreatorRecovery() {
  activeModalClose = closeModal;
  const savedLinks = savedManagerReturnLinks();
  const savedPanel = savedLinks.length ? `<section class="saved-manager-links"><strong>這台裝置已保存的管理入口</strong><p>僅此裝置可見；換裝置仍請用管理者名稱與管理碼找回。</p><div>${savedLinks.map((item) => `<div><span><b>${esc(item.title)}</b><small>${esc(item.eventDate ? `${formatDate(item.eventDate)} · ${item.startTime}` : "")}</small></span><button class="secondary" data-saved-manager-open="${esc(item.id)}">直接管理</button><button class="text-danger" data-saved-manager-remove="${esc(item.id)}">移除</button></div>`).join("")}</div></section>` : "";
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">管理者專用</p><h2 id="recovery-title">管理我的活動</h2>
       <p>輸入建立活動時設定的管理者名稱與管理碼，即可查看所有符合的活動。</p>${savedPanel}
      <form id="recovery-unlock-form"><label>管理者名稱<input name="creatorName" required minlength="2" autofocus autocomplete="name"></label><label>管理碼<input type="password" name="editCode" data-secret required minlength="4" autocomplete="current-password" spellcheck="false"></label><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button class="primary">查看活動</button></div></form>
    </section></div>`;
  const form = document.querySelector("#recovery-unlock-form");
  document.querySelectorAll("[data-saved-manager-open]").forEach((button) => button.addEventListener("click", () => {
    const item = savedManagerReturnLinks().find((link) => link.id === button.dataset.savedManagerOpen);
    if (item) location.href = item.url;
  }));
  document.querySelectorAll("[data-saved-manager-remove]").forEach((button) => button.addEventListener("click", () => {
    removeManagerReturnLink(button.dataset.savedManagerRemove);
    openCreatorRecovery();
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const creatorName = form.elements.creatorName.value.trim();
    const editCode = form.elements.editCode.value.trim();
    try {
      const data = await requestJson("/creator-recovery", { action: "unlock", creatorName, editCode });
      openRecoveredActivities(data.activities || [], editCode, creatorName);
    } catch (error) { showFormError(form, error.message || "無法查看活動"); }
  });
}

function isUpcomingRecoveryActivity(event) {
  const startsAt = Date.parse(`${event.eventDate}T${event.startTime}:00+08:00`);
  return event.status === "active" && Number.isFinite(startsAt) && startsAt > Date.now();
}

function recoveryCapacityLabel(event) {
  const attending = Math.max(0, Number(event.attendingPeople) || 0);
  const capacity = Number(event.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return `<div class="recovery-capacity unlimited"><strong>已報名 ${attending} 人</strong><small>不限名額</small></div>`;
  }
  const remaining = Math.max(0, capacity - attending);
  return `<div class="recovery-capacity${remaining === 0 ? " full" : ""}"><strong>${remaining === 0 ? "已額滿" : `剩餘 ${remaining} 名額`}</strong><small>已報名 ${attending}／${capacity} 人</small></div>`;
}

function recoveryOperationalStatus(event) {
  if (!isUpcomingRecoveryActivity(event)) return "";
  const statuses = [];
  if (event.unassignedPeople !== null && event.unassignedPeople !== undefined) {
    const unassigned = Math.max(0, Number(event.unassignedPeople) || 0);
    statuses.push(unassigned
      ? `<span class="recovery-status warning">尚有 ${unassigned} 人未安排</span>`
      : '<span class="recovery-status ready">安排已完成</span>');
  }
  statuses.push(event.lineGroupName
    ? `<span class="recovery-status ready" title="${esc(event.lineGroupName)}">通知群組已綁定</span>`
    : '<span class="recovery-status muted">尚未設定通知群組</span>');
  const managerTargetCount = Math.max(0, Number(event.managerTargetCount) || 0);
  statuses.push(managerTargetCount
    ? `<span class="recovery-status ready">私訊提醒 ${managerTargetCount} 人</span>`
    : '<span class="recovery-status muted">尚未啟用私訊提醒</span>');
  return `<div class="recovery-operational-status" aria-label="活動管理狀態">${statuses.join("")}</div>`;
}

function openRecoveredActivities(activities, editCode, creatorName) {
  activeModalClose = closeModal;
  const upcoming = activities.filter(isUpcomingRecoveryActivity);
  const history = activities.filter((event) => !isUpcomingRecoveryActivity(event));
  const activityCard = (event) => `<article class="recovered-activity"><div>${isUpcomingRecoveryActivity(event) ? `<label class="recovery-manager-choice"><input type="checkbox" data-recovery-manager-event="${esc(event.id)}" checked><span>啟用私訊提醒</span></label>` : ""}<strong>${esc(event.title)}</strong><span>${esc(formatDate(event.eventDate))} · ${esc(event.startTime)}${event.status === "cancelled" ? " · 已取消" : ""}</span>${recoveryCapacityLabel(event)}${recoveryOperationalStatus(event)}</div><div class="inline-actions"><button class="secondary" data-recovery-share="${esc(event.id)}">分享連結／QR</button><button class="primary" data-recovery-manage="${esc(event.id)}">管理活動</button></div></article>`;
  const upcomingCards = upcoming.map(activityCard).join("");
  const historyCards = history.map(activityCard).join("");
  const batchPanel = upcoming.length ? `
    <section class="recovery-manager-batch">
      <div><strong>批次啟用管理者私訊提醒</strong><span>可一次選取全部尚未開始的活動</span></div>
      <p>這只會設定「有人報名時私訊通知我」，不會變更通知群組。已預選所有尚未開始活動；需要時可取消個別活動。取得一組 10 分鐘有效的指令後，在與好日子小幫手的一對一私訊傳送一次，即可綁定目前這個 LINE 帳號。</p>
      <div id="recovery-manager-binding-code"></div>
      <p class="form-error" id="recovery-manager-error" role="alert" hidden></p>
      <div class="inline-actions"><button class="secondary" id="recovery-manager-select-all" type="button">全選尚未開始活動</button><button class="line-button" id="recovery-manager-batch" type="button">取得私訊綁定碼</button></div>
    </section>` : "";
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="recovered-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">已解鎖</p><h2 id="recovered-title">我的活動</h2>
       ${batchPanel}
       <section class="recovery-current"><h3>尚未開始的活動</h3><div class="recovered-activities">${upcomingCards || '<p class="form-hint">目前沒有尚未開始的活動。</p>'}</div></section>
       ${history.length ? `<details class="recovery-history"><summary>已結束／已取消活動（${history.length}）</summary><div class="recovered-activities">${historyCards}</div></details>` : ""}
    </section></div>`;
  document.querySelector("#recovery-manager-select-all")?.addEventListener("click", () => {
    document.querySelectorAll("[data-recovery-manager-event]").forEach((input) => { input.checked = true; });
  });
  document.querySelector("#recovery-manager-batch")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    const eventIds = [...document.querySelectorAll("[data-recovery-manager-event]:checked")].map((input) => input.dataset.recoveryManagerEvent);
    const errorBox = document.querySelector("#recovery-manager-error");
    if (!eventIds.length) {
      errorBox.textContent = "請先勾選至少一場尚未開始的活動";
      errorBox.hidden = false;
      return;
    }
    button.disabled = true;
    errorBox.hidden = true;
    try {
      const result = await requestJson("/creator-recovery", {
        action: "create_manager_batch_binding_code", creatorName, editCode, eventIds,
      });
      const bindingCommand = `管理綁定 ${result.code}`;
      document.querySelector("#recovery-manager-binding-code").innerHTML = `<div class="binding-code"><span>先加小幫手好友，再於私訊輸入</span><strong>${esc(bindingCommand)}</strong><button class="secondary binding-copy" id="copy-recovery-manager-binding-code" type="button">複製</button><small>會同時啟用 ${result.count} 場活動的私訊提醒；10 分鐘內有效</small></div>`;
      document.querySelector("#copy-recovery-manager-binding-code")?.addEventListener("click", async (copyEvent) => {
        const copyButton = copyEvent.currentTarget;
        try {
          await navigator.clipboard.writeText(bindingCommand);
          copyButton.textContent = "已複製";
          showNotice("批次管理提醒綁定指令已複製");
          window.setTimeout(() => { copyButton.textContent = "複製"; }, 1800);
        } catch {
          errorBox.textContent = "無法自動複製，請手動複製管理綁定指令";
          errorBox.hidden = false;
        }
      });
      button.textContent = "重新產生私訊綁定碼";
    } catch (error) {
      errorBox.textContent = error.message || "無法產生批次綁定碼";
      errorBox.hidden = false;
    } finally { button.disabled = false; }
  });
  for (const event of activities) {
    document.querySelector(`[data-recovery-share="${CSS.escape(event.id)}"]`)?.addEventListener("click", () => openSharePanel(event, () => openRecoveredActivities(activities, editCode, creatorName)));
    document.querySelector(`[data-recovery-manage="${CSS.escape(event.id)}"]`)?.addEventListener("click", () => {
      void openAdminFromCredential(event.id, { type: "code", value: editCode }, null, () => openRecoveredActivities(activities, editCode, creatorName));
    });
  }
}

function responseLabel(value) {
  return value === "attending" ? "參加" : "不參加";
}

function paymentLabel(value) {
  return value === "paid" ? "已收" : value === "waived" ? "免收" : "待收";
}

function adminRows(rsvps, feePerPerson) {
  const hasFee = feePerPerson > 0;
  if (!rsvps.length) return `<tr><td colspan="${hasFee ? 9 : 7}" class="empty-cell">尚未收到回覆</td></tr>`;
  return rsvps.map((item) => `<tr>
    <td><strong>${esc(item.name)}</strong></td><td><span class="response-pill ${esc(item.response)}">${responseLabel(item.response)}</span></td>
    <td>${item.response === "attending" ? `${item.partySize} 人` : "—"}</td><td>${esc(item.diet || "—")}</td>
    <td>${esc(item.note || "—")}</td><td>${esc(new Date(item.updatedAt).toLocaleString("zh-TW"))}</td>
    ${hasFee ? `<td>${item.response === "attending" ? formatMoney(item.partySize * feePerPerson) : "—"}</td><td>${item.response === "attending" ? `<select class="payment-status" data-rsvp-payment="${esc(item.id)}" aria-label="${esc(item.name)} 的收款狀態"><option value="unpaid" ${(item.paymentStatus || "unpaid") === "unpaid" || item.paymentStatus === "not_applicable" ? "selected" : ""}>待收</option><option value="paid" ${item.paymentStatus === "paid" ? "selected" : ""}>已收</option><option value="waived" ${item.paymentStatus === "waived" ? "selected" : ""}>免收</option></select>` : "—"}</td>` : ""}
    <td><div class="rsvp-row-actions"><button class="secondary" data-rsvp-edit="${esc(item.id)}">修改回覆</button>${item.response === "attending" ? `<button class="secondary" data-rsvp-cancel="${esc(item.id)}">取消參加</button>` : ""}<button class="text-danger" data-rsvp-delete="${esc(item.id)}">刪除</button></div></td>
  </tr>`).join("");
}

function openManagedRsvpEditor(rsvp, event, managerAuth, returnTo = null) {
  const isNew = !rsvp;
  const initial = rsvp || { name: "", response: "attending", partySize: 1, diet: "", note: "" };
  activeModalClose = returnTo || closeModal;
  modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="managed-rsvp-title">
      <button class="modal-close" data-close aria-label="關閉">×</button>
      <p class="eyebrow">建立者代為處理</p><h2 id="managed-rsvp-title">${isNew ? "代為新增報名" : `修改 ${esc(initial.name)} 的回覆`}</h2>
      <p class="form-hint">${isNew ? "可直接替親友登記，不必離開管理後台或複製活動連結。" : "可受託修改姓名、人數、飲食需求、備註與出席狀態。若改變人數或是否參加，該筆既有活動安排會清除，避免桌次人數不一致。"}</p>
      <form id="managed-rsvp-form">
        ${field("姓名", "name", initial.name, 'required maxlength="60" autofocus placeholder="例如：豆豆"')}
        <fieldset><legend>是否參加？</legend>
          <label class="choice"><input type="radio" name="response" value="attending" ${initial.response === "attending" ? "checked" : ""}><span>✓ 參加</span></label>
          <label class="choice"><input type="radio" name="response" value="not_attending" ${initial.response === "not_attending" ? "checked" : ""}><span>這次無法參加</span></label>
        </fieldset>
        <div id="managed-attending-fields">
          <label>總共幾人參加？<input name="partySize" type="number" min="1" max="999" step="1" inputmode="numeric" value="${initial.response === "attending" ? initial.partySize : 1}" required></label>
          ${event.feePerPerson > 0 ? `<p class="fee-note" id="managed-fee-total">本戶應收：${formatMoney((initial.response === "attending" ? initial.partySize : 0) * event.feePerPerson)}（每人 ${formatMoney(event.feePerPerson)}）</p>` : ""}
          ${field("飲食需求", "diet", initial.diet, 'placeholder="例如：吃素、不吃牛（可留白）"')}
          <label>想告訴主辦人<textarea name="note" rows="2" placeholder="可留白">${esc(initial.note)}</textarea></label>
        </div>
        <p class="form-error" id="form-error" role="alert" hidden></p>
        <div class="form-actions"><button type="button" class="secondary" data-close>返回</button><button type="submit" class="primary">${isNew ? "新增報名" : "儲存回覆"}</button></div>
      </form>
    </section></div>`;
  const form = document.querySelector("#managed-rsvp-form");
  const syncFields = () => {
    const attending = form.elements.response.value === "attending";
    document.querySelector("#managed-attending-fields").hidden = !attending;
    const total = document.querySelector("#managed-fee-total");
    if (total) total.textContent = `本戶應收：${formatMoney((attending ? Number(form.elements.partySize.value || 0) : 0) * event.feePerPerson)}（每人 ${formatMoney(event.feePerPerson)}）`;
  };
  form.addEventListener("change", syncFields);
  form.addEventListener("input", syncFields);
  syncFields();
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "儲存中…";
    try {
      const body = Object.fromEntries(new FormData(form));
      body.partySize = Number(body.partySize || 1);
      const result = await requestJson("/admin/event", {
        action: isNew ? "create_rsvp" : "update_rsvp", ...(isNew ? {} : { rsvpId: initial.id }), ...body, ...managerPayload(event.id, managerAuth),
      });
      if (returnTo) returnTo();
      else {
        const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
        openAdminDashboard(fresh, managerAuth);
      }
      showNotice(result.message);
    } catch (error) {
      showFormError(form, error.message || "無法更新這筆回覆");
      button.disabled = false;
      button.textContent = isNew ? "新增報名" : "儲存回覆";
    }
  });
}

async function manageRsvp(action, rsvp, event, managerAuth) {
  const isDelete = action === "delete_rsvp";
  const message = isDelete
    ? `要永久刪除「${rsvp.name}」的回覆嗎？此動作無法復原。`
    : `要取消「${rsvp.name}」的參加嗎？這筆回覆會保留，但不再計入人數。`;
  if (!confirm(message)) return;
  try {
    const result = await requestJson("/admin/event", {
      action, rsvpId: rsvp.id, ...managerPayload(event.id, managerAuth),
    });
    const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
    openAdminDashboard(fresh, managerAuth);
    showNotice(result.message);
  } catch (error) {
    const box = document.querySelector("#rsvp-error");
    if (box) { box.textContent = error.message || "無法管理這筆回覆"; box.hidden = false; }
  }
}

async function updateRsvpPayment(rsvp, nextPaymentStatus, event, managerAuth) {
  try {
    const result = await requestJson("/admin/event", {
      action: "update_payment", rsvpId: rsvp.id, paymentStatus: nextPaymentStatus, ...managerPayload(event.id, managerAuth),
    });
    const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
    openAdminDashboard(fresh, managerAuth);
    showNotice(result.message);
  } catch (error) {
    const box = document.querySelector("#rsvp-error");
    if (box) { box.textContent = error.message || "無法更新收款狀態"; box.hidden = false; }
  }
}

function linePanel(line) {
  if (!line.configured) return `
    <div class="line-status warning"><strong>LINE 機器人程式已完成，等待填入兩個 LINE 憑證</strong>
      <p>請依照 <a href="/line-bot-guide.html" target="_blank">LINE 機器人設定教學</a> 建立官方帳號，完成後即可產生群組綁定碼。</p></div>`;
  const binding = line.binding;
  const managerTargetCount = Math.max(0, Number(line.managerTargetCount) || 0);
  const commandLogs = Array.isArray(line.commandLogs) ? line.commandLogs : [];
  const commandLogText = {
    sent: "已傳送",
    fallback_sent: "已文字提示",
    failed: "傳送失敗",
    no_arrangement: "尚未建立安排",
  };
  const commandCard = binding ? `<section class="line-command-card"><strong>群組內可直接輸入</strong><div><code>活動</code><span>查看近期活動與報名連結</span></div><div><code>原神啟動 日期</code><span>查看指定日期的報名名單</span></div><div><code>安排 日期</code><span>查看指定日期的安排圖卡</span></div><p>有多場活動時，小幫手會列出每場的日期指令；日期請用 <b>20261007</b> 這類格式。</p></section>` : "";
  const logPanel = binding ? `<section class="line-command-log"><div><strong>小幫手最近紀錄</strong><span>只記錄指令結果，不保存聊天內容</span></div>${commandLogs.length ? `<ul>${commandLogs.map((item) => `<li><time>${esc(formatDateTime(item.createdAt))}</time><b>${esc(item.command)}</b><em class="line-log-${esc(item.outcome)}">${esc(commandLogText[item.outcome] || item.outcome)}</em><small>${esc(item.detail || "—")}</small></li>`).join("")}</ul>` : "<p>目前尚無可顯示的指令紀錄。</p>"}</section>` : "";
  return `
    <section class="manager-alert-panel ${managerTargetCount ? "connected" : ""}">
      <div><div><small class="line-panel-kind">只通知管理者本人</small><strong>管理者私訊提醒</strong></div><span>${managerTargetCount ? `已綁定 ${managerTargetCount} 位管理者` : "尚未啟用"}</span></div>
      <p>綁定的是 LINE 帳號，不使用管理者名稱。有人報名、取消或更動人數時，只有已綁定的管理者會在與小幫手的私訊收到提醒；不會推送到活動群組。</p>
      <div id="manager-binding-code-area"></div>
      <div class="inline-actions"><button class="line-button" id="manager-alert-code">${managerTargetCount ? "新增／重新產生綁定碼" : "啟用私訊提醒"}</button>${managerTargetCount ? '<button class="text-danger" id="manager-alert-clear">停止所有私訊提醒</button>' : ""}</div>
    </section>
    <div class="line-status ${binding ? "connected" : ""}">
      <small class="line-panel-kind">群組內公開通知</small>
      <strong>${binding ? `通知群組：${esc(binding.groupName)}` : "尚未選擇通知群組"}</strong>
      <p>${binding ? "這個群組可重複用於多場未來活動；群組成員輸入「活動」會列出近期活動，輸入「安排」會顯示安排圖卡。這與上方的私訊提醒是兩個獨立設定。" : "若同一管理碼只有一個已綁定群組，系統會自動沿用到尚未開始的活動；多個群組時才需要自行選取。這不會啟用管理者私訊提醒。"}</p>
      <div id="binding-code-area"></div>
      <div class="inline-actions">
        ${binding ? '<button class="secondary" id="line-existing">改選既有群組</button><button class="secondary" id="line-publish">合併發布近期活動</button><button class="secondary" id="line-seven-day-test">測試 7 天提醒</button><button class="secondary" id="line-one-day-test">測試 1 天提醒</button><button class="secondary" id="line-two-hour-test">測試 2 小時提醒</button><button class="text-danger" id="line-unbind">移除此活動</button>' : '<button class="secondary" id="line-existing">使用既有通知群組</button><button class="line-button" id="line-code">綁定新群組</button>'}
      </div>
    </div>
    ${commandCard}
    <fieldset class="reminder-options"><legend>自動提醒時間</legend>
      <label class="toggle"><input type="checkbox" name="sevenDays" ${line.settings.sevenDays ? "checked" : ""}><span>活動前 7 天</span></label>
      <label class="toggle"><input type="checkbox" name="oneDay" ${line.settings.oneDay ? "checked" : ""}><span>活動前 1 天</span></label>
      <label class="toggle"><input type="checkbox" name="twoHours" ${line.settings.twoHours ? "checked" : ""}><span>活動前 2 小時</span></label>
      <label class="toggle"><input type="checkbox" name="includeDiet" ${line.settings.includeDiet ? "checked" : ""}><span>「原神啟動」包含飲食需求</span></label>
      <label class="toggle"><input type="checkbox" name="includeNote" ${line.settings.includeNote ? "checked" : ""}><span>「原神啟動」包含備註</span></label>
      <p class="form-hint">群組成員都能看到廣播內容；飲食需求與備註可能包含個人資訊，請分別確認後再開啟。</p>
      <button class="secondary" id="line-settings">儲存提醒設定</button>
    </fieldset>${logPanel}`;
}

async function autoReuseLineGroup(event, managerAuth, returnTo) {
  const key = `good-days-line-auto-reuse:${event.id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const result = await requestJson("/admin/line", {
      action: "auto_reuse_group", ...managerPayload(event.id, managerAuth),
    });
    if (!result.binding) return;
    const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
    openAdminDashboard(fresh, managerAuth, returnTo);
    showNotice(result.linked > 1
      ? `已沿用既有 LINE 群組，並連結 ${result.linked} 場尚未開始的活動`
      : "已沿用既有 LINE 群組");
  } catch {
    // A group is optional. Keep the normal manual binding controls available.
  }
}

function lineEventLabel(event) {
  return `${formatShortDate(event.eventDate)} ${event.startTime}｜${event.title}`;
}

async function openLineGroupPicker(event, managerAuth, returnTo = null) {
  try {
    const result = await requestJson("/admin/line", { action: "list_groups", ...managerPayload(event.id, managerAuth) });
    const groups = result.groups || [];
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="line-groups-title"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">通知群組</p><h2 id="line-groups-title">選擇既有 LINE 群組</h2>${groups.length ? `<p>小幫手已在下列群組，不需要重新邀請。</p><div class="line-group-picker">${groups.map((group) => `<button class="secondary" data-line-group="${esc(group.groupId)}"><strong>${esc(group.groupName)}</strong><span>用作這場活動的通知群組</span></button>`).join("")}</div>` : '<p class="form-hint">目前沒有可使用的既有群組。請先在新群組加入小幫手，再回來產生綁定碼。</p>'}</section></div>`;
    activeModalClose = returnTo || closeModal;
    document.querySelectorAll("[data-line-group]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await requestJson("/admin/line", { action: "use_existing_group", groupId: button.dataset.lineGroup, ...managerPayload(event.id, managerAuth) });
        if (returnTo) returnTo();
        else {
          const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
          openAdminDashboard(fresh, managerAuth);
        }
        showNotice("已選擇通知群組；之後不必再綁定一次");
      } catch (error) { button.disabled = false; showLineError(error.message); }
    }));
  } catch (error) { showLineError(error.message); }
}

async function openLinePublish(event, managerAuth, returnTo = null) {
  try {
    const result = await requestJson("/admin/line", { action: "list_publishable", ...managerPayload(event.id, managerAuth) });
    const upcoming = result.events || [];
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="line-publish-title"><button class="modal-close" data-close aria-label="關閉">×</button><p class="eyebrow">合併發布</p><h2 id="line-publish-title">發布近期活動</h2><p>選擇後會發出一則合併公告，並把這些活動都設定為同一個通知群組。</p><form id="line-publish-form"><fieldset>${upcoming.length ? upcoming.map((item) => `<label class="choice"><input type="checkbox" name="eventIds" value="${esc(item.id)}" ${item.id === event.id ? "checked" : ""}><span><strong>${esc(item.title)}</strong><small>${esc(lineEventLabel(item))}<br>${esc(item.location)}</small></span></label>`).join("") : '<p class="form-hint">目前沒有可合併發布的未來活動。</p>'}</fieldset><p class="form-error" hidden></p><div class="form-actions"><button type="button" class="secondary" data-close>返回</button>${upcoming.length ? '<button class="primary">發布到 LINE 群組</button>' : ""}</div></form></section></div>`;
    activeModalClose = returnTo || closeModal;
    const form = document.querySelector("#line-publish-form");
    form?.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      const eventIds = new FormData(form).getAll("eventIds");
      try {
        const response = await requestJson("/admin/line", { action: "publish_events", eventIds, ...managerPayload(event.id, managerAuth) });
        if (returnTo) returnTo();
        else {
          const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
          openAdminDashboard(fresh, managerAuth);
        }
        showNotice(`已發布 ${response.count} 場近期活動`);
      } catch (error) { const box = form.querySelector(".form-error"); box.textContent = error.message; box.hidden = false; }
    });
  } catch (error) { showLineError(error.message); }
}

function mealTableId() {
  return globalThis.crypto?.randomUUID?.() || `meal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newMealTable(index, capacity = 10) {
  return {
    id: mealTableId(), name: `第 ${index + 1} 桌`, capacity,
    isReserve: false, note: "", sortOrder: index,
  };
}

function arrangementNameKey(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en-US");
}

function newAdditionalMealTable(tables, capacity = 10) {
  const existing = new Set(tables.map((table) => arrangementNameKey(table.name)));
  let index = tables.length + 1;
  while (existing.has(arrangementNameKey(`新安排區 ${index}`))) index += 1;
  return {
    id: mealTableId(), name: `新安排區 ${index}`, capacity,
    isReserve: false, note: "", sortOrder: tables.length,
  };
}

function initMealSeating(data, event, managerAuth) {
  const root = document.querySelector("#meal-seating-root");
  if (!root) return;
  const attending = data.rsvps.filter((item) => item.response === "attending");
  const rsvpById = new Map(attending.map((item) => [item.id, item]));
  const state = {
    tables: (data.mealSeating?.tables || []).map((item, index) => ({ ...item, sortOrder: index })),
    assignments: (data.mealSeating?.assignments || []).filter((item) => rsvpById.has(item.rsvpId)),
    selectedRsvpId: "",
    error: "",
  };
  const eventCapacity = Number.isInteger(event.capacity) && event.capacity > 0 ? event.capacity : null;

  const assignmentsFor = (tableId) => state.assignments.filter((item) => item.tableId === tableId);
  const tableTotal = (tableId) => assignmentsFor(tableId).reduce((sum, item) => sum + item.people, 0);
  const assignedFor = (rsvpId) => state.assignments
    .filter((item) => item.rsvpId === rsvpId).reduce((sum, item) => sum + item.people, 0);
  const unassignedFor = (rsvpId) => Math.max(0, (rsvpById.get(rsvpId)?.partySize || 0) - assignedFor(rsvpId));
  const tableById = (tableId) => state.tables.find((item) => item.id === tableId);
  const totalTableCapacity = () => state.tables.reduce((sum, table) => sum + table.capacity, 0);
  const remainingTableCapacity = () => eventCapacity === null ? Infinity : Math.max(0, eventCapacity - totalTableCapacity());

  function tableNameErrors() {
    const errors = new Map();
    const names = new Map();
    for (const table of state.tables) {
      const name = table.name.trim();
      const key = arrangementNameKey(name);
      if (!key) {
        errors.set(table.id, "請輸入安排區名稱");
        continue;
      }
      const first = names.get(key);
      if (first) {
        errors.set(first.id, `與「${name}」名稱重複`);
        errors.set(table.id, `與「${first.name}」名稱重複`);
      } else names.set(key, { id: table.id, name });
    }
    return errors;
  }

  function refreshTableNameValidation() {
    const errors = tableNameErrors();
    root.querySelectorAll("[data-seat-table-name]").forEach((input) => {
      const error = errors.get(input.dataset.seatTableName) || "";
      input.classList.toggle("input-error", Boolean(error));
      input.setAttribute("aria-invalid", String(Boolean(error)));
      const errorBox = root.querySelector(`[data-seat-table-name-error="${CSS.escape(input.dataset.seatTableName)}"]`);
      if (errorBox) { errorBox.textContent = error; errorBox.hidden = !error; }
    });
    const save = root.querySelector("#meal-save");
    if (save) save.disabled = Boolean(errors.size);
    return errors;
  }

  function message(text) {
    state.error = text;
    render();
  }

  function addToTable(rsvpId, tableId, requestedPeople = null) {
    const rsvp = rsvpById.get(rsvpId);
    const table = tableById(tableId);
    if (!rsvp || !table) return;
    const available = unassignedFor(rsvpId);
    const free = table.capacity - tableTotal(tableId);
    if (!available) return message("這筆報名已全部安排完成；請先把其中一部分移回未安排區。");
    if (free < 1) return message(`「${table.name}」已滿，請選擇其他桌次。`);
    let people = requestedPeople || available;
    if (people > free) {
      const entered = prompt(`「${rsvp.name}」尚有 ${available} 人未安排；「${table.name}」可再坐 ${free} 人。要先安排幾人？`, String(free));
      if (entered === null) return;
      people = Number(entered);
    }
    if (!Number.isInteger(people) || people < 1 || people > available || people > free) {
      return message("請輸入不超過剩餘人數與桌次空位的整數。");
    }
    const existing = state.assignments.find((item) => item.tableId === tableId && item.rsvpId === rsvpId);
    if (existing) existing.people += people;
    else state.assignments.push({ id: mealTableId(), tableId, rsvpId, people });
    state.selectedRsvpId = unassignedFor(rsvpId) > 0 ? rsvpId : "";
    state.error = "";
    render();
  }

  function moveAllocation(assignmentId, tableId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    const target = tableById(tableId);
    if (!assignment || !target || assignment.tableId === tableId) return;
    const free = target.capacity - tableTotal(tableId);
    if (assignment.people > free) return message(`移動後「${target.name}」會超過 ${target.capacity} 人上限。`);
    const matching = state.assignments.find((item) => item.id !== assignment.id && item.tableId === tableId && item.rsvpId === assignment.rsvpId);
    if (matching) {
      matching.people += assignment.people;
      state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
    } else assignment.tableId = tableId;
    state.error = "";
    render();
  }

  function swapAllocations(firstId, secondId) {
    const first = state.assignments.find((item) => item.id === firstId);
    const second = state.assignments.find((item) => item.id === secondId);
    if (!first || !second || first.tableId === second.tableId) return;
    const firstTable = tableById(first.tableId);
    const secondTable = tableById(second.tableId);
    if (!firstTable || !secondTable) return;
    const firstAfter = tableTotal(first.tableId) - first.people + second.people;
    const secondAfter = tableTotal(second.tableId) - second.people + first.people;
    if (firstAfter > firstTable.capacity || secondAfter > secondTable.capacity) {
      return message("交換後有桌次會超過人數上限，請先調整其他安排。\n");
    }
    const duplicate = state.assignments.some((item) => item.id !== first.id && item.id !== second.id && (
      (item.tableId === second.tableId && item.rsvpId === first.rsvpId)
      || (item.tableId === first.tableId && item.rsvpId === second.rsvpId)
    ));
    if (duplicate) return message("其中一家已在目標安排區有安排；請先移回未安排區後再交換。\n");
    const originalTable = first.tableId;
    first.tableId = second.tableId;
    second.tableId = originalTable;
    state.error = "";
    render();
  }

  function render() {
    const assignedPeople = state.assignments.reduce((sum, item) => sum + item.people, 0);
    const unassignedPeople = attending.reduce((sum, item) => sum + unassignedFor(item.id), 0);
    const totalCapacity = totalTableCapacity();
    const arrangementLimitReached = eventCapacity !== null && totalCapacity >= eventCapacity;
    const nameErrors = tableNameErrors();
    const unassignedCards = attending.map((rsvp) => ({ rsvp, people: unassignedFor(rsvp.id) }))
      .filter((item) => item.people > 0).map(({ rsvp, people }) => `
        <button class="meal-party-card ${state.selectedRsvpId === rsvp.id ? "selected" : ""}" type="button" draggable="true" data-seat-select="${esc(rsvp.id)}">
          <strong>${esc(rsvp.name)}</strong><span>尚待安排 ${people} ／ 共 ${rsvp.partySize} 人</span>
        </button>`).join("") || '<p class="meal-empty">所有參加者都已安排。</p>';
    const tables = state.tables.map((table) => {
      const total = tableTotal(table.id);
      const tableAssignments = assignmentsFor(table.id);
      const status = total >= table.capacity ? "full" : total > table.capacity ? "over" : "";
      const allocationRows = tableAssignments.map((assignment) => {
        const rsvp = rsvpById.get(assignment.rsvpId);
        if (!rsvp) return "";
        return `<div class="meal-assignment" draggable="true" data-seat-assignment="${esc(assignment.id)}">
          <span><strong>${esc(rsvp.name)}</strong><small>${assignment.people} 人</small></span>
          <button class="text-danger" type="button" data-seat-unassign="${esc(assignment.id)}">移回</button>
        </div>`;
      }).join("") || '<p class="meal-empty">尚未安排</p>';
      return `<article class="meal-table-card ${status}" data-seat-drop-table="${esc(table.id)}">
        <div class="meal-table-head">
          <label class="meal-table-name">安排區名稱<input class="${nameErrors.has(table.id) ? "input-error" : ""}" data-seat-table-name="${esc(table.id)}" value="${esc(table.name)}" maxlength="40" aria-invalid="${nameErrors.has(table.id)}"><small data-seat-table-name-error="${esc(table.id)}" ${nameErrors.has(table.id) ? "" : "hidden"}>${esc(nameErrors.get(table.id) || "")}</small></label>
          <label>上限<input data-seat-table-capacity="${esc(table.id)}" type="number" min="1" max="${eventCapacity || 50}" inputmode="numeric" value="${table.capacity}"></label>
          <label class="meal-reserve"><input data-seat-table-reserve="${esc(table.id)}" type="checkbox" ${table.isReserve ? "checked" : ""}>預備區</label>
        </div>
        <div class="meal-table-count"><strong>${total} / ${table.capacity}</strong><span>${total >= table.capacity ? "已滿" : `尚有 ${table.capacity - total} 位`}</span></div>
        <label class="meal-table-note">位置／分組備註<input data-seat-table-note="${esc(table.id)}" value="${esc(table.note || "")}" maxlength="80" placeholder="例如：靠近投影、方便出入、帶隊小明"></label>
        <div class="meal-assignment-list">${allocationRows}</div>
        <div class="meal-table-actions"><button class="secondary" type="button" data-seat-add-selected="${esc(table.id)}">安排選取家庭</button><button class="text-danger" type="button" data-seat-remove-table="${esc(table.id)}">移除安排區</button></div>
      </article>`;
    }).join("") || '<div class="meal-empty-state">請先設定安排區數量與每區人數上限。</div>';
    root.innerHTML = `
      <div class="meal-seating-summary">
        <div><strong>${attending.reduce((sum, item) => sum + item.partySize, 0)}</strong><span>參加人數</span></div>
        <div><strong>${assignedPeople}</strong><span>已安排</span></div>
        <div><strong>${unassignedPeople}</strong><span>未安排</span></div>
        <div><strong>${eventCapacity || "不限"}</strong><span>活動總人數</span></div>
      </div>
      <details class="meal-setup" ${state.tables.length ? "" : "open"}><summary>設定安排區與人數上限</summary>
        <div class="meal-setup-fields"><label>安排區數量<input id="meal-table-count" type="number" min="1" max="${eventCapacity || 24}" value="${state.tables.length || 1}" inputmode="numeric"></label><label>每區預設上限<input id="meal-table-capacity" type="number" min="1" max="${eventCapacity || 50}" value="${eventCapacity || 10}" inputmode="numeric"></label><button class="secondary" type="button" id="meal-build-tables">${state.tables.length ? "重新建立安排區" : "建立安排區"}</button></div>
        <p class="form-hint">${eventCapacity ? `活動人數上限為 ${eventCapacity} 人；所有安排區的容量合計不可超過 ${eventCapacity} 人。` : "重新建立會清除目前尚未儲存的安排；各區也可在下方個別調整人數與備註。"}</p>
      </details>
      <div class="meal-seating-actions"><button class="secondary" type="button" id="meal-add-table" ${arrangementLimitReached ? "disabled" : ""}>${arrangementLimitReached ? "已達活動總人數" : "＋ 新增安排區"}</button><button class="primary" type="button" id="meal-save" ${nameErrors.size ? "disabled" : ""}>儲存活動安排</button></div>
      ${state.error ? `<p class="form-error">${esc(state.error)}</p>` : ""}
      <div class="meal-workspace"><section class="meal-unassigned"><div><p class="eyebrow">先選家庭，再點桌次</p><h4>未安排</h4></div>${unassignedCards}</section><section class="meal-table-grid">${tables}</section></div>
      <p class="form-hint">電腦可把家庭卡拖到桌次；拖到另一張家庭卡可交換桌次。手機請先選家庭，再按目標桌的「安排選取家庭」。同一筆報名超過空位時，可輸入要先安排的人數。</p>`;

    const readDrag = (dragEvent) => {
      try { return JSON.parse(dragEvent.dataTransfer.getData("text/plain")); } catch { return null; }
    };
    root.querySelectorAll("[data-seat-select]").forEach((card) => {
      card.addEventListener("click", () => { state.selectedRsvpId = card.dataset.seatSelect; state.error = ""; render(); });
      card.addEventListener("dragstart", (dragEvent) => dragEvent.dataTransfer.setData("text/plain", JSON.stringify({ kind: "unassigned", id: card.dataset.seatSelect })));
    });
    root.querySelectorAll("[data-seat-assignment]").forEach((card) => {
      card.addEventListener("dragstart", (dragEvent) => dragEvent.dataTransfer.setData("text/plain", JSON.stringify({ kind: "assignment", id: card.dataset.seatAssignment })));
      card.addEventListener("dragover", (dragEvent) => dragEvent.preventDefault());
      card.addEventListener("drop", (dragEvent) => {
        dragEvent.preventDefault(); dragEvent.stopPropagation();
        const dragged = readDrag(dragEvent);
        if (dragged?.kind === "assignment") swapAllocations(dragged.id, card.dataset.seatAssignment);
      });
    });
    root.querySelectorAll("[data-seat-drop-table]").forEach((tableCard) => {
      tableCard.addEventListener("dragover", (dragEvent) => dragEvent.preventDefault());
      tableCard.addEventListener("drop", (dragEvent) => {
        dragEvent.preventDefault();
        const dragged = readDrag(dragEvent);
        if (dragged?.kind === "unassigned") addToTable(dragged.id, tableCard.dataset.seatDropTable);
        if (dragged?.kind === "assignment") moveAllocation(dragged.id, tableCard.dataset.seatDropTable);
      });
    });
    root.querySelectorAll("[data-seat-add-selected]").forEach((button) => button.addEventListener("click", () => {
      if (!state.selectedRsvpId) return message("請先從未安排區選擇一個家庭。\n");
      addToTable(state.selectedRsvpId, button.dataset.seatAddSelected);
    }));
    root.querySelectorAll("[data-seat-unassign]").forEach((button) => button.addEventListener("click", () => {
      state.assignments = state.assignments.filter((item) => item.id !== button.dataset.seatUnassign); state.error = ""; render();
    }));
    root.querySelectorAll("[data-seat-remove-table]").forEach((button) => button.addEventListener("click", () => {
      const tableId = button.dataset.seatRemoveTable;
      if (assignmentsFor(tableId).length) return message("請先把這個安排區的家庭移回未安排區或移到其他安排區。\n");
      state.tables = state.tables.filter((item) => item.id !== tableId).map((item, index) => ({ ...item, sortOrder: index })); render();
    }));
    root.querySelectorAll("[data-seat-table-name]").forEach((input) => input.addEventListener("input", () => {
      const table = tableById(input.dataset.seatTableName); if (table) table.name = input.value.slice(0, 40);
      refreshTableNameValidation();
    }));
    root.querySelectorAll("[data-seat-table-note]").forEach((input) => input.addEventListener("change", () => {
      const table = tableById(input.dataset.seatTableNote); if (table) table.note = input.value.trim().slice(0, 80);
    }));
    root.querySelectorAll("[data-seat-table-reserve]").forEach((input) => input.addEventListener("change", () => {
      const table = tableById(input.dataset.seatTableReserve); if (table) table.isReserve = input.checked;
    }));
    root.querySelectorAll("[data-seat-table-capacity]").forEach((input) => input.addEventListener("change", () => {
      const table = tableById(input.dataset.seatTableCapacity); const capacity = Number(input.value);
      const maximum = eventCapacity || 50;
      if (!table || !Number.isInteger(capacity) || capacity < 1 || capacity > maximum) return message(`每區人數上限須為 1 到 ${maximum} 的整數。\n`);
      if (capacity < tableTotal(table.id)) return message(`「${table.name}」目前已有 ${tableTotal(table.id)} 人，不能把上限設得更低。\n`);
      if (eventCapacity && totalTableCapacity() - table.capacity + capacity > eventCapacity) return message(`活動人數上限為 ${eventCapacity} 人，安排區總容量不可超過此人數。\n`);
      table.capacity = capacity; state.error = ""; render();
    }));
    root.querySelector("#meal-build-tables")?.addEventListener("click", () => {
      const count = Number(root.querySelector("#meal-table-count").value); const capacity = Number(root.querySelector("#meal-table-capacity").value);
      const maximum = eventCapacity || 50;
      const maxTables = eventCapacity || 24;
      if (!Number.isInteger(count) || count < 1 || count > maxTables || !Number.isInteger(capacity) || capacity < 1 || capacity > maximum) return message(`安排區數量請填 1 到 ${maxTables}；每區上限請填 1 到 ${maximum}。\n`);
      if (eventCapacity && count * capacity > eventCapacity) return message(`活動人數上限為 ${eventCapacity} 人，安排區總容量不可超過此人數。\n`);
      if ((state.tables.length || state.assignments.length) && !confirm("重新建立桌次會清除目前尚未儲存的安排，確定繼續嗎？")) return;
      state.tables = Array.from({ length: count }, (_, index) => newMealTable(index, capacity)); state.assignments = []; state.selectedRsvpId = ""; state.error = ""; render();
    });
    root.querySelector("#meal-add-table")?.addEventListener("click", () => {
      if (state.tables.length >= 24) return message("第一版最多可建立 24 桌。\n");
      const remaining = remainingTableCapacity();
      if (remaining < 1) return message(`活動人數上限為 ${eventCapacity} 人，不能再新增安排區。\n`);
      state.tables.push(newAdditionalMealTable(state.tables, Math.min(10, remaining))); render();
    });
    root.querySelector("#meal-save")?.addEventListener("click", async (clickEvent) => {
      if (tableNameErrors().size) return message("請先修正重複的安排區名稱。\n");
      const button = clickEvent.currentTarget;
      button.disabled = true;
      try {
        const result = await requestJson("/admin/event", {
          action: "save_meal_seating", tables: state.tables.map((table, index) => ({ ...table, sortOrder: index })),
          assignments: state.assignments.map(({ tableId, rsvpId, people }) => ({ tableId, rsvpId, people })),
          ...managerPayload(event.id, managerAuth),
        });
        const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
        openAdminDashboard(fresh, managerAuth);
        showNotice(result.message || "活動安排已儲存");
      } catch (error) { message(error.message || "無法儲存活動安排"); }
      finally { button.disabled = false; }
    });
  }
  render();
}

async function refreshAdminDashboard(eventId, managerAuth, returnTo = null) {
  try {
    const fresh = await requestJson("/admin/event", managerPayload(eventId, managerAuth));
    openAdminDashboard(fresh, managerAuth, returnTo);
  } catch (error) {
    showNotice(error.message || "無法返回活動管理後台");
  }
}

function openAdminDashboard(data, managerAuth, returnTo = null) {
  const event = data.event;
  const returnToAdmin = () => { void refreshAdminDashboard(event.id, managerAuth, returnTo); };
  activeModalClose = returnTo || closeModal;
  const remaining = event.capacity ? Math.max(0, event.capacity - data.summary.attendingPeople) : null;
  const attendingRsvps = data.rsvps.filter((item) => item.response === "attending");
  const assignedPeopleByRsvp = new Map();
  for (const assignment of data.mealSeating?.assignments || []) {
    assignedPeopleByRsvp.set(assignment.rsvpId, (assignedPeopleByRsvp.get(assignment.rsvpId) || 0) + assignment.people);
  }
  const unassignedRsvps = attendingRsvps.map((rsvp) => ({
    ...rsvp,
    unassignedPeople: Math.max(0, rsvp.partySize - (assignedPeopleByRsvp.get(rsvp.id) || 0)),
  })).filter((rsvp) => rsvp.unassignedPeople > 0);
  const unassignedPeople = unassignedRsvps.reduce((sum, rsvp) => sum + rsvp.unassignedPeople, 0);
  const arrangementStatus = unassignedPeople ? `
        <button class="arrangement-status pending" id="jump-to-arrangements" type="button">
          <span class="arrangement-status-icon" aria-hidden="true">!</span>
          <span><strong>尚有 ${unassignedPeople} 人未安排</strong><small>${unassignedRsvps.length} 筆報名等待安排座位／分組</small></span>
          <span class="arrangement-status-action">前往安排 ↓</span>
        </button>` : attendingRsvps.length ? `
        <div class="arrangement-status complete" role="status"><span class="arrangement-status-icon" aria-hidden="true">✓</span><span><strong>所有參加者都已安排</strong><small>座位／分組已完成</small></span></div>` : "";
  const fee = data.summary.fee || { feePerPerson: 0, grossAmount: 0, paidAmount: 0, unpaidAmount: 0, waivedAmount: 0 };
  const paymentOverview = fee.feePerPerson > 0 ? `
        <section class="admin-section fee-section" id="payment-management">
          <div class="admin-section-title"><div><p class="eyebrow">僅管理者可見</p><h3>收款管理</h3></div><span>每人 ${formatMoney(fee.feePerPerson)}</span></div>
          <p class="form-hint">應收金額會依各戶目前報名人數自動計算；在人名列可標記待收、已收或免收。</p>
          <div class="payment-summary">
            <div><strong>${formatMoney(fee.grossAmount)}</strong><span>報名總額</span></div>
            <div><strong>${formatMoney(fee.paidAmount)}</strong><span>已收</span></div>
            <div><strong>${formatMoney(fee.unpaidAmount)}</strong><span>待收</span></div>
            ${fee.waivedAmount ? `<div><strong>${formatMoney(fee.waivedAmount)}</strong><span>免收</span></div>` : ""}
          </div>
        </section>` : "";
  modalRoot.innerHTML = `
    <div class="modal-backdrop admin-backdrop">
      <section class="modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">活動管理後台</p><h2 id="admin-title">${esc(event.title)}</h2>
        <p class="modal-event-meta">${esc(formatShortDate(event.eventDate))} · ${esc(event.startTime)}<br>地點｜${esc(event.location)}${event.address ? `<br>地址｜${esc(event.address)}` : ""}</p>
        <div class="stats-grid">
          <div><strong>${data.summary.attendingPeople}</strong><span>參加人數</span></div>
          <div><strong>${data.summary.attendingReplies}</strong><span>參加回覆</span></div>
          <div><strong>${data.summary.notAttendingReplies}</strong><span>不參加</span></div>
          <div><strong>${remaining === null ? "不限" : remaining}</strong><span>剩餘名額</span></div>
        </div>
        ${arrangementStatus}
        <div class="admin-toolbar">
          <button class="primary" id="edit-from-admin">修改活動</button>
          <button class="secondary" id="show-share">分享連結與 QR Code</button>
          ${managerAuth.type === "token" ? '<button class="secondary" id="show-manager-link">複製管理連結</button>' : ""}
          <button class="secondary" id="export-rsvps">下載 CSV 名單</button>
        </div>
        <nav class="admin-quick-nav" aria-label="管理後台快速導覽"><strong>快速前往</strong><button type="button" data-dashboard-jump="participant-list">名單</button>${paymentOverview ? '<button type="button" data-dashboard-jump="payment-management">收款</button>' : ""}<button type="button" data-dashboard-jump="activity-arrangements">安排${unassignedPeople ? `（${unassignedPeople}）` : ""}</button><button type="button" data-dashboard-jump="line-notifications">LINE</button></nav>
        ${paymentOverview}
        <section class="admin-section" id="participant-list">
          <div class="admin-section-title"><div><p class="eyebrow">僅管理者可見</p><h3>參與者名單</h3></div><span>${data.rsvps.length} 筆回覆</span></div>
          <div class="admin-toolbar"><button class="primary" id="create-rsvp">＋ 代為新增報名</button></div>
          <p class="form-hint">可直接按「代為新增報名」替多位親友登記；要更正既有回覆時，請按該列「修改回覆」。受託取消可按「取消參加」；只有誤登或重複資料才使用「刪除」。</p>
          <div class="table-scroll"><table><thead><tr><th>姓名</th><th>回覆</th><th>人數</th><th>飲食</th><th>備註</th><th>更新時間</th>${fee.feePerPerson > 0 ? "<th>應收</th><th>收款狀態</th>" : ""}<th>管理</th></tr></thead><tbody>${adminRows(data.rsvps, fee.feePerPerson)}</tbody></table></div>
          <p class="form-error" id="rsvp-error" role="alert" hidden></p>
        </section>
        <section class="admin-section meal-section" id="activity-arrangements">
          <div class="admin-section-title"><div><p class="eyebrow">活動分組・僅管理者可見</p><h3>活動安排</h3></div><span>可拖曳、拆分與調整分組</span></div>
          <p class="form-hint">聚餐可設定桌次；桌遊、滑雪等活動可把區名改成分組或集合區。設定每區上限後，再把家庭／同行者安排到不同區；人數超過上限時，可分次安排。</p>
          <div id="meal-seating-root"></div>
        </section>
        <section class="admin-section line-section" id="line-notifications">
          <div class="admin-section-title"><div><p class="eyebrow line-eyebrow">LINE 群組</p><h3>自動提醒機器人</h3></div><a href="/line-bot-guide.html" target="_blank">查看設定教學</a></div>
          ${linePanel(data.line)}
          <p class="form-error" id="line-error" role="alert" hidden></p>
        </section>
      </section>
    </div>`;

  document.querySelector("#edit-from-admin").addEventListener("click", () => openEventForm(event, managerAuth, returnToAdmin));
  document.querySelector("#show-share").addEventListener("click", () => openSharePanel(event, returnToAdmin));
  document.querySelector("#show-manager-link")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(managerUrl(event.id, managerAuth.value));
    showNotice("管理連結已複製，請勿分享給參加者");
  });
  document.querySelector("#export-rsvps").addEventListener("click", () => exportRsvps(event, data.rsvps));
  document.querySelectorAll("[data-dashboard-jump]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.dashboardJump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelector("#jump-to-arrangements")?.addEventListener("click", () => {
    document.querySelector("#activity-arrangements")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#create-rsvp").addEventListener("click", () => openManagedRsvpEditor(null, event, managerAuth, returnToAdmin));
  document.querySelector("#line-existing")?.addEventListener("click", () => void openLineGroupPicker(event, managerAuth, returnToAdmin));
  document.querySelector("#line-publish")?.addEventListener("click", () => void openLinePublish(event, managerAuth, returnToAdmin));
  initMealSeating(data, event, managerAuth);
  document.querySelectorAll("[data-rsvp-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const rsvp = data.rsvps.find((item) => item.id === button.dataset.rsvpEdit);
      if (rsvp) openManagedRsvpEditor(rsvp, event, managerAuth, returnToAdmin);
    });
  });
  document.querySelectorAll("[data-rsvp-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const rsvp = data.rsvps.find((item) => item.id === button.dataset.rsvpCancel);
      if (rsvp) void manageRsvp("cancel_rsvp", rsvp, event, managerAuth);
    });
  });
  document.querySelectorAll("[data-rsvp-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const rsvp = data.rsvps.find((item) => item.id === button.dataset.rsvpDelete);
      if (rsvp) void manageRsvp("delete_rsvp", rsvp, event, managerAuth);
    });
  });
  document.querySelectorAll("[data-rsvp-payment]").forEach((select) => {
    select.addEventListener("change", () => {
      const rsvp = data.rsvps.find((item) => item.id === select.dataset.rsvpPayment);
      if (rsvp) void updateRsvpPayment(rsvp, select.value, event, managerAuth);
    });
  });
  document.querySelector("#manager-alert-code")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      const result = await requestJson("/admin/line", {
        action: "create_manager_binding_code", ...managerPayload(event.id, managerAuth),
      });
      const bindingCommand = `管理綁定 ${result.code}`;
      document.querySelector("#manager-binding-code-area").innerHTML = `<div class="binding-code"><span>先加小幫手好友，再於私訊輸入</span><strong>${esc(bindingCommand)}</strong><button class="secondary binding-copy" id="copy-manager-binding-code" type="button">複製</button><small>10 分鐘內有效；可交給受邀的共同管理者</small></div>`;
      document.querySelector("#copy-manager-binding-code")?.addEventListener("click", async (copyEvent) => {
        const copyButton = copyEvent.currentTarget;
        try {
          await navigator.clipboard.writeText(bindingCommand);
          copyButton.textContent = "已複製";
          showNotice("管理提醒綁定指令已複製");
          window.setTimeout(() => { copyButton.textContent = "複製"; }, 1800);
        } catch {
          showLineError("無法自動複製，請手動複製管理綁定指令");
        }
      });
      button.textContent = "重新產生綁定碼";
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector("#manager-alert-clear")?.addEventListener("click", async () => {
    if (!confirm("確定停止這場活動的所有 LINE 私訊管理提醒？日後可重新綁定。")) return;
    try {
      await requestJson("/admin/line", { action: "clear_manager_targets", ...managerPayload(event.id, managerAuth) });
      const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
      openAdminDashboard(fresh, managerAuth, returnTo);
      showNotice("已停止這場活動的私訊管理提醒");
    } catch (error) { showLineError(error.message); }
  });
  document.querySelector("#line-code")?.addEventListener("click", async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      const result = await requestJson("/admin/line", {
        action: "create_binding_code", ...managerPayload(event.id, managerAuth),
      });
      const bindingCommand = `綁定 ${result.code}`;
      document.querySelector("#binding-code-area").innerHTML = `<div class="binding-code"><span>請在群組輸入</span><strong>${esc(bindingCommand)}</strong><button class="secondary binding-copy" id="copy-binding-code" type="button">複製</button><small>15 分鐘內有效</small></div>`;
      document.querySelector("#copy-binding-code")?.addEventListener("click", async (copyEvent) => {
        const copyButton = copyEvent.currentTarget;
        try {
          await navigator.clipboard.writeText(bindingCommand);
          copyButton.textContent = "已複製";
          showNotice("綁定指令已複製");
          window.setTimeout(() => { copyButton.textContent = "複製"; }, 1800);
        } catch {
          showLineError("無法自動複製，請手動複製綁定指令");
        }
      });
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
        includeDiet: document.querySelector('[name="includeDiet"]').checked,
        includeNote: document.querySelector('[name="includeNote"]').checked,
      });
      showNotice("LINE 提醒時間已儲存");
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  });
  async function sendLineTest(clickEvent, reminderType) {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      await requestJson("/admin/line", {
        action: "send_test", reminderType, ...managerPayload(event.id, managerAuth),
      });
      const names = { seven_days: "7 天", one_day: "1 天", two_hours: "2 小時" };
      showNotice(`${names[reminderType] || ""}提醒測試已傳到 LINE 群組`);
    } catch (error) { showLineError(error.message); }
    finally { button.disabled = false; }
  }
  document.querySelector("#line-seven-day-test")?.addEventListener("click", (clickEvent) => sendLineTest(clickEvent, "seven_days"));
  document.querySelector("#line-one-day-test")?.addEventListener("click", (clickEvent) => sendLineTest(clickEvent, "one_day"));
  document.querySelector("#line-two-hour-test")?.addEventListener("click", (clickEvent) => sendLineTest(clickEvent, "two_hours"));
  document.querySelector("#line-unbind")?.addEventListener("click", async () => {
    if (!confirm("確定將這場活動移出通知群組？群組本身與其他活動不會受影響。")) return;
    try {
      await requestJson("/admin/line", { action: "unbind", ...managerPayload(event.id, managerAuth) });
      const fresh = await requestJson("/admin/event", managerPayload(event.id, managerAuth));
      openAdminDashboard(fresh, managerAuth);
      showNotice("這場活動已移出通知群組");
    } catch (error) { showLineError(error.message); }
  });
  if (data.line.configured && !data.line.binding) void autoReuseLineGroup(event, managerAuth, returnTo);
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
  const hasFee = event.feePerPerson > 0;
  const rows = [
    ["姓名", "回覆", "參加人數", "飲食需求", "備註", ...(hasFee ? ["每人費用", "應收金額", "收款狀態"] : []), "更新時間"],
    ...rsvps.map((item) => [
      item.name, responseLabel(item.response), item.response === "attending" ? item.partySize : 0, item.diet, item.note,
      ...(hasFee ? [event.feePerPerson, item.response === "attending" ? item.partySize * event.feePerPerson : 0, item.response === "attending" ? paymentLabel(item.paymentStatus) : "—"] : []),
      item.updatedAt,
    ]),
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

function openDiscardConfirmation(message, onDiscard = closeModal) {
  if (modalRoot.querySelector(".discard-confirm-backdrop")) return;
  modalRoot.insertAdjacentHTML("beforeend", `
    <div class="discard-confirm-backdrop">
      <section class="discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-confirm-title">
        <p class="eyebrow">請確認</p>
        <h2 id="discard-confirm-title">要放棄這次填寫嗎？</h2>
        <p>${esc(message)}</p>
        <div class="form-actions">
          <button type="button" class="secondary" id="keep-event-form">繼續填寫</button>
          <button type="button" class="danger" id="discard-event-form">放棄內容</button>
        </div>
      </section>
    </div>`);
  document.querySelector("#keep-event-form")?.addEventListener("click", () => {
    modalRoot.querySelector(".discard-confirm-backdrop")?.remove();
  });
  document.querySelector("#discard-event-form")?.addEventListener("click", onDiscard);
  document.querySelector("#keep-event-form")?.focus();
}

function requestModalClose() {
  if (activeModalClose) return activeModalClose();
  closeModal();
}

function closeModal() {
  activeModalClose = null;
  modalRoot.innerHTML = "";
}

async function shareEvent(event) {
  const url = event.shareUrl || `${location.origin}/?event=${encodeURIComponent(event.id)}`;
  try {
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatShortDate(event.eventDate)} ${event.startTime}｜${event.location}${event.address ? `｜${event.address}` : ""}`, url });
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

function openSharePanel(event, returnTo = null) {
  const url = event.shareUrl;
  const qr = qrDataUrl(url);
  activeModalClose = returnTo || closeModal;
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal compact-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button class="modal-close" data-close aria-label="關閉">×</button>
        <p class="eyebrow">專屬活動連結</p><h2 id="share-title">${esc(event.title || "分享活動")}</h2>
        <p>此活動有自己的頁面。${event.accessMode === "private" ? "開啟後還需要輸入參加碼。" : "把連結或 QR Code 分享給家人即可。"}</p>
        <label>分享連結<input id="share-url" value="${esc(url)}" readonly></label>
        <div class="inline-actions"><button class="primary" id="copy-share">複製連結</button><button class="secondary" id="native-share">分享…</button><button class="secondary" id="share-back">${returnTo ? "返回管理後台" : "關閉"}</button></div>
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
  document.querySelector("#share-back").addEventListener("click", requestModalClose);
}

document.addEventListener("click", (clickEvent) => {
  const create = clickEvent.target.closest("[data-create]");
  if (create) return openEventForm();
  if (clickEvent.target.closest("[data-manage-activities]")) return openCreatorRecovery();
  const close = clickEvent.target.closest("[data-close]");
  if (close) return requestModalClose();
  if (clickEvent.target.id === "retry") return loadEvents();
  const action = clickEvent.target.closest("[data-action]");
  if (!action) return;
  const event = events.find((item) => item.id === action.dataset.id);
  if (!event) return;
  if (action.dataset.action === "rsvp") openRsvpForm(event);
  if (action.dataset.action === "admin") openAdminLogin(event);
  if (action.dataset.action === "share") shareEvent(event);
});

document.addEventListener("keydown", (keyEvent) => {
  if (keyEvent.key !== "Escape" || !modalRoot.querySelector(".modal")) return;
  keyEvent.preventDefault();
  requestModalClose();
});

for (const eventName of ["copy", "cut", "dragstart"]) {
  document.addEventListener(eventName, (event) => {
    if (event.target instanceof Element && event.target.closest("[data-secret]")) event.preventDefault();
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
loadEvents();
trackSiteVisit();
const linkedManager = managerAuthFromLink();
if (linkedManager) void openAdminFromCredential(linkedManager.eventId, linkedManager);
else {
  const params = new URLSearchParams(location.search);
  if (params.get("activities") === "1" || params.get("recover") === "1") openCreatorRecovery();
}
