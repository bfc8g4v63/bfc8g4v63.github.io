/**
 * Normalise text commands sent from LINE before comparing them.
 *
 * 「啟」and「啓」look nearly identical but have different Unicode code points;
 * accepting both avoids silently ignoring a family member's command.
 */
export function normalizeLineCommand(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]+/gu, "")
    .replaceAll("啓", "啟");
}
