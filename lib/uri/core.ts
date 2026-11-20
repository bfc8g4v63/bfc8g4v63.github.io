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

export type DatePart = "year" | "month" | "day";
export function monthDays(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function changeDatePart(current: string, part: DatePart, next: string, today: string): string {
  if (!next) return "";
  const baseline = validDate(current) ? current : today;
  if (!validDate(baseline)) return "";
  const pieces = baseline.split("-").map(Number);
  const value = Number(next);
  if (!Number.isInteger(value)) return current;
  if (part === "year") { if (value < 1 || value > 9999) return current; pieces[0] = value; }
  if (part === "month") { if (value < 1 || value > 12) return current; pieces[1] = value; }
  if (part === "day") { if (value < 1 || value > monthDays(pieces[0], pieces[1])) return current; pieces[2] = value; }
  pieces[2] = Math.min(pieces[2], monthDays(pieces[0], pieces[1]));
  return `${String(pieces[0]).padStart(4,"0")}-${String(pieces[1]).padStart(2,"0")}-${String(pieces[2]).padStart(2,"0")}`;
}

export function shiftCalendarMonth(current: string, delta: number): string {
  if (!validDate(current) || !Number.isInteger(delta)) return current;
  const [year,month]=current.split("-").map(Number);
  const shifted=(year-1)*12+(month-1)+delta;
  if(shifted<0 || shifted>=9999*12) return current;
  const targetYear=Math.floor(shifted/12)+1,targetMonth=shifted%12+1;
  const day=Math.min(Number(current.slice(8,10)),monthDays(targetYear,targetMonth));
  return `${String(targetYear).padStart(4,"0")}-${String(targetMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
export function firstWeekday(year: number,month: number):number {
  const date=new Date(0);date.setUTCFullYear(year,month-1,1);date.setUTCHours(0,0,0,0);return date.getUTCDay();
}
