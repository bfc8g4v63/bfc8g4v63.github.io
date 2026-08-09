(() => {
  "use strict";

  const storageKey = "fairy_supply_rating_v1";
  const collectButton = document.querySelector("#collect-supply");
  const rewardCard = document.querySelector("#reward-card");
  const ratingButtons = [...document.querySelectorAll("[data-rating]")];
  const ratingMessage = document.querySelector("#rating-message");

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
})();
