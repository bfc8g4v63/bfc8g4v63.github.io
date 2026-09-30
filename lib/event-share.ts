const EVENT_SHARE_ORIGIN = "https://bfc8g4v63.github.io/e/?s=";

// A 48-bit, URL-safe identifier is short enough for chat messages while still
// being impractical to guess. The full UUID remains accepted for old links.
export function shortShareCode(shareToken: string) {
  return shareToken.replaceAll("-", "").toLowerCase().slice(0, 12);
}

export function eventShareUrl(shareCode: string, legacyShareToken = "") {
  const identifier = shareCode || legacyShareToken;
  return `${EVENT_SHARE_ORIGIN}${encodeURIComponent(identifier)}`;
}
