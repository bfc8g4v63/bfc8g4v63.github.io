(() => {
  "use strict";

  const storageKey = "fairy_supply_rating_v1";
  const collectButton = document.querySelector("#collect-supply");
  const rewardCard = document.querySelector("#reward-card");
  const ratingButtons = [...document.querySelectorAll("[data-rating]")];
  const ratingMessage = document.querySelector("#rating-message");
  const ratingNote = document.querySelector("#rating-note");
  const requestForm = document.querySelector("#fairy-request");
  const requestMessage = document.querySelector("#request-message");
  const quickReplies = [...document.querySelectorAll("[data-reply]")];
  const quickReplyMessage = document.querySelector("#quick-reply-message");
  const demonRuleCard = document.querySelector("#demon-rule-card");
  const demonRuleToggle = document.querySelector("#demon-rule-toggle");
  const demonRuleDetails = document.querySelector("#demon-rule-details");
  const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";
  const accessGate = document.querySelector("#access-gate");
  const accessForm = document.querySelector("#access-form");
  const accessPassword = document.querySelector("#access-password");
  const accessMessage = document.querySelector("#access-message");
  const mainContent = document.querySelector("#main-content");
  const accessKey = "fairy_access_v1_4";
  const accessHash = "207fd47ed6a8671043e9f79626bb8826c1d306f0ca5ac300e10d53094fe206d0";
  const backgroundMusic = document.querySelector("#fairy-bgm");
  const backgroundMusicToggle = document.querySelector("#bgm-toggle");
  const backgroundMusicVolume = document.querySelector("#bgm-volume");
  const backgroundMusicStatus = document.querySelector("#bgm-status");

  function unlockStation() {
    document.body.classList.remove("gate-locked", "detector-active");
    mainContent?.removeAttribute("aria-hidden");
    if (mainContent && "inert" in mainContent) mainContent.inert = false;
    accessGate?.setAttribute("aria-hidden", "true");
    try {
      window.sessionStorage.setItem(accessKey, "open");
    } catch {
      // The gate still works when storage is unavailable; it simply asks again after refresh.
    }
  }

  async function hashAccessCode(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  if (mainContent && "inert" in mainContent) mainContent.inert = true;

  function openAccessGate() {
    document.body.classList.remove("detector-active");
    accessGate?.removeAttribute("aria-hidden");
    window.setTimeout(() => accessPassword?.focus(), 300);
  }

  function hasStationAccess() {
    try {
      return window.sessionStorage.getItem(accessKey) === "open";
    } catch {
      return false;
    }
  }

  // Every visit begins with the detector screen, even when this session is already verified.
  accessGate?.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    document.documentElement.classList.add("is-ready");
    if (hasStationAccess()) {
      unlockStation();
    } else {
      openAccessGate();
    }
  }, 1500);

  if (accessForm && accessPassword && accessMessage) {
    accessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = accessForm.querySelector('button[type="submit"]');
      const code = accessPassword.value.trim();
      if (!/^\d{4}$/.test(code)) {
        accessMessage.textContent = "請輸入四位數通關密碼。";
        accessPassword.focus();
        return;
      }
      button.disabled = true;
      accessMessage.textContent = "月光正在核對身分…";
      try {
        if (await hashAccessCode(code) !== accessHash) {
          accessMessage.textContent = "星光對不上，再想一下。";
          accessPassword.select();
          return;
        }
        accessMessage.textContent = "仙女通過，南瓜馬車開門中…";
        unlockStation();
      } catch {
        accessMessage.textContent = "鑑別暫時失靈，請重新整理後再試。";
      } finally {
        button.disabled = false;
      }
    });
  }

  function updateBackgroundMusicUi() {
    if (!backgroundMusic || !backgroundMusicToggle || !backgroundMusicStatus) return;
    const isAudible = !backgroundMusic.paused && !backgroundMusic.muted && backgroundMusic.volume > 0;
    backgroundMusicToggle.setAttribute("aria-pressed", String(isAudible));
    backgroundMusicToggle.setAttribute("aria-label", isAudible ? "靜音背景音樂" : "開啟背景音樂");
    backgroundMusicStatus.textContent = isAudible
      ? "正在播放，想低調一點可以拉小聲。"
      : "預設靜音，想聽再打開就好。";
  }

  if (backgroundMusic && backgroundMusicToggle && backgroundMusicVolume) {
    backgroundMusic.volume = Number(backgroundMusicVolume.value);
    backgroundMusic.muted = true;
    updateBackgroundMusicUi();

    backgroundMusicToggle.addEventListener("click", async () => {
      if (backgroundMusic.paused) {
        backgroundMusic.muted = false;
        try {
          await backgroundMusic.play();
        } catch {
          backgroundMusic.muted = true;
          if (backgroundMusicStatus) backgroundMusicStatus.textContent = "音樂還沒能出發，請再點一次喇叭。";
          return;
        }
      } else {
        backgroundMusic.muted = !backgroundMusic.muted;
      }
      updateBackgroundMusicUi();
    });

    backgroundMusicVolume.addEventListener("input", () => {
      backgroundMusic.volume = Number(backgroundMusicVolume.value);
      if (!backgroundMusic.paused && backgroundMusic.volume > 0) backgroundMusic.muted = false;
      updateBackgroundMusicUi();
    });

    backgroundMusic.addEventListener("ended", updateBackgroundMusicUi);
  }

  if (demonRuleCard && demonRuleToggle && demonRuleDetails) {
    demonRuleToggle.addEventListener("click", () => {
      const isOpen = demonRuleToggle.getAttribute("aria-expanded") !== "true";
      demonRuleToggle.setAttribute("aria-expanded", String(isOpen));
      demonRuleDetails.setAttribute("aria-hidden", String(!isOpen));
      demonRuleCard.classList.toggle("is-open", isOpen);
    });
  }

  function setRating(value, announce = false) {
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    ratingButtons.forEach((button) => {
      const selected = Number(button.dataset.rating) <= rating;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(Number(button.dataset.rating) === rating));
    });
    if (ratingMessage && announce) {
      ratingMessage.textContent = rating === 5
        ? "已收到仙女五星好評，少卿決定繼續營業。"
        : "收到，本店會繼續修煉 😂";
    }
  }

  async function sendFairyFeedback(payload) {
    const response = await fetch(`${API}/fairy/reaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "小幫手暫時塞車了");
  }

  if (collectButton && rewardCard) {
    collectButton.addEventListener("click", () => {
      rewardCard.hidden = false;
      collectButton.disabled = true;
      collectButton.setAttribute("aria-expanded", "true");
      collectButton.innerHTML = "今日補給已領取 <span aria-hidden=\"true\">✦</span>";
      rewardCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, { once: true });
  }

  try {
    const savedRating = window.localStorage.getItem(storageKey);
    if (savedRating) setRating(savedRating);
  } catch {
    // Rating remains usable when browser storage is unavailable.
  }

  ratingButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const rating = button.dataset.rating;
      setRating(rating);
      try {
        window.localStorage.setItem(storageKey, rating);
      } catch {
        // Never block the little interaction because storage is disabled.
      }
      ratingButtons.forEach((item) => { item.disabled = true; });
      if (ratingMessage) ratingMessage.textContent = "正在交給 LINE 小幫手…";
      try {
        await sendFairyFeedback({ type: "rating", rating: Number(rating), note: ratingNote?.value.trim().slice(0, 240) || "" });
        if (ratingNote) ratingNote.value = "";
        if (ratingMessage) ratingMessage.textContent = `${rating} 星已透過小幫手私訊回傳。`;
      } catch (error) {
        if (ratingMessage) ratingMessage.textContent = error instanceof Error ? error.message : "小幫手暫時塞車了。";
      } finally {
        ratingButtons.forEach((item) => { item.disabled = false; });
      }
    });
  });

  quickReplies.forEach((button) => {
    button.addEventListener("click", async () => {
      const reply = button.dataset.reply || "";
      quickReplies.forEach((item) => { item.disabled = true; });
      if (quickReplyMessage) quickReplyMessage.textContent = "正在交給 LINE 小幫手…";
      try {
        await sendFairyFeedback({ type: "quick-reply", reply });
        quickReplies.forEach((item) => item.classList.toggle("is-selected", item === button));
        if (quickReplyMessage) quickReplyMessage.textContent = `已透過小幫手回傳：「${reply}」。`;
      } catch (error) {
        if (quickReplyMessage) quickReplyMessage.textContent = error instanceof Error ? error.message : "小幫手暫時塞車了。";
      } finally {
        quickReplies.forEach((item) => { item.disabled = false; });
      }
    });
  });

  if (requestForm && requestMessage) {
    const dateInput = requestForm.querySelector('input[name="date"]');
    if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = requestForm.querySelector('button[type="submit"]');
      const values = new FormData(requestForm);
      const payload = {
        coffee: String(values.get("coffee") || ""),
        chat: values.get("chat") === "on",
        carriageSong: String(values.get("carriageSong") || ""),
        date: String(values.get("date") || ""),
        activity: String(values.get("activity") || ""),
        note: String(values.get("note") || ""),
      };
      if (!payload.coffee && !payload.chat && !payload.carriageSong && !payload.date && !payload.activity && !payload.note.trim()) {
        requestMessage.textContent = "先挑一個小願望就好，空白小卡不用急著送出。";
        return;
      }
      button.disabled = true;
      requestMessage.textContent = "小馬車正在把小卡送給配送員…";
      try {
        const response = await fetch(`${API}/fairy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "配送暫時塞車了");
        requestMessage.textContent = "小卡已交給配送員，群組完全不會收到內容 ✦";
        requestForm.reset();
      } catch (error) {
        requestMessage.textContent = error instanceof Error ? error.message : "配送暫時塞車了，晚一點再試。";
      } finally {
        button.disabled = false;
      }
    });
  }
})();
