export type Entry = { kind: string; startDate: string | null; endDate: string | null; state: string };
// Date-only comparisons in the couple's agreed Taipei time, independent of the browser clock.
export function taipeiDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function entryView(entry: Entry, today: string): string {
  if (entry.state === "cancelled") return "cancelled";
  if (entry.kind === "memory" || entry.state === "completed") return "memory";
  if (entry.kind !== "plan") return entry.kind;
  const last = entry.endDate || entry.startDate;
  return last && last < today ? "past-plan" : "plan";
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
