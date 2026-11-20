export type PreferencePerson = "nelson" | "yandy";
export function readPreference(category: string, authorRole: string): {person: PreferencePerson; category: string} {
  const match = /^pref:(nelson|yandy):(.*)$/.exec(category);
  return match ? {person: match[1] as PreferencePerson, category: match[2]} : {person: authorRole === "owner" ? "nelson" : "yandy", category};
}
export function writePreference(person: unknown, category: string): string | null {
  if (person !== "nelson" && person !== "yandy") return null;
  if (!["喜歡", "不喜歡", "不太喜歡", "看情況", "想嘗試", "希望你知道"].includes(category)) return null;
  return `pref:${person}:${category}`;
}
export function splitPreferenceTitles(value: unknown): string[] | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  const titles = [...new Set(value.split(/[、，,;；\n]+/u).map(s => s.trim()).filter(Boolean))];
  return titles.length && titles.length <= 30 && titles.every(s => s.length <= 120) ? titles : null;
}
