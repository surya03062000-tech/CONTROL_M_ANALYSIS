// Shared, dependency-free helpers for the Leave module (safe in client + server).
export const LEAVE_TYPES = ["Holiday", "Unplanned", "Sick", "Planned"] as const;
export type LeaveType = typeof LEAVE_TYPES[number];

export const DAY_PARTS = [
  { v: "full", label: "Full day" },
  { v: "half-am", label: "Half day (AM)" },
  { v: "half-pm", label: "Half day (PM)" },
] as const;

export function isHalf(dp: string): boolean { return dp.startsWith("half"); }
export function dayPartLabel(dp: string): string {
  return DAY_PARTS.find((d) => d.v === dp)?.label || (isHalf(dp) ? "Half day" : "Full day");
}
export function computeDays(start: string, end: string, dp: string): number {
  if (isHalf(dp)) return 0.5;
  const s = new Date(start), e = new Date(end || start);
  const d = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return d > 0 ? d : 1;
}
export function genRequestId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `LR-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
export function expandDates(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00"), e = new Date((end || start) + "T00:00:00");
  for (let t = s.getTime(); t <= e.getTime(); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export function isWeekend(dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00").getDay();
  return d === 0 || d === 6; // Sun / Sat
}
// Dates that actually count as leave: weekdays that aren't company holidays.
export function workingDates(start: string, end: string, holidays?: Set<string>): string[] {
  return expandDates(start, end).filter((d) => !isWeekend(d) && !(holidays?.has(d)));
}
// Leave days excluding weekends + holidays (half-day = 0.5 only if that day counts).
export function computeWorkingDays(start: string, end: string, dayPart: string, holidays?: Set<string>): number {
  if (isHalf(dayPart)) return workingDates(start, start, holidays).length ? 0.5 : 0;
  return workingDates(start, end, holidays).length;
}
export function typeColor(t: string): string {
  return ({ Holiday: "#DA291C", Unplanned: "#d97706", Sick: "#0891b2", Planned: "#16a34a" } as Record<string, string>)[t] || "#64748b";
}
export function rangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}
