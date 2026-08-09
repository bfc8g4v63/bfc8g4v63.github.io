(() => {
  "use strict";

  const storageKey = "fairy_supply_rating_v1";
  const collectButton = document.querySelector("#collect-supply");
  const rewardCard = document.querySelector("#reward-card");
  const ratingButtons = [...document.querySelectorAll("[data-rating]")];
  const ratingMessage = document.querySelector("#rating-message");
  const requestForm = document.querySelector("#fairy-request");
  const requestMessage = document.querySelector("#request-message");
  const API = "https://good-days-family-events.x0925234139.chatgpt.site/api";

  window.setTimeout(() => document.documentElement.classList.add("is-ready"), 1500);

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
    button.addEventListener("click", () => {
      const rating = button.dataset.rating;
      setRating(rating, true);
      try {
        window.localStorage.setItem(storageKey, rating);
      } catch {
        // Never block the little interaction because storage is disabled.
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
      };
      if (!payload.coffee && !payload.chat && !payload.carriageSong && !payload.date && !payload.activity) {
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
