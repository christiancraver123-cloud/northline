// "What do I do tonight?" (ported from the original Command Center): today's calendar slots, missed slots, nightly steps.
// Pure. Calendar date/time are New York wall-clock values.
import type { CalendarEntry, Production } from "@/lib/db/records";

export const TZ = "America/New_York";
export function nyDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function nyOffset(d: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 60000);
}
/** Instant for a New York wall-clock date ("YYYY-MM-DD") and time ("HH:MM"). */
export function nyInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm || 0));
  return new Date(guess.getTime() - nyOffset(guess) * 60000);
}

type Entry = Pick<CalendarEntry, "id" | "productionId" | "talent" | "date" | "time" | "state">;
const open = (e: Entry) => e.state !== "PUBLISHED";

/** Slots on today's New York date that aren't posted yet, earliest first. */
export function tonightSlots<T extends Entry>(entries: T[], now = new Date()): T[] {
  const today = nyDay(now);
  return entries.filter((e) => open(e) && e.date === today).sort((a, b) => a.time.localeCompare(b.time));
}
/** Slots that passed more than `graceMin` ago without being posted (excluding today's, which show as tonight). */
export function missedSlots<T extends Entry>(entries: T[], now = new Date(), graceMin = 60): T[] {
  const today = nyDay(now);
  return entries.filter((e) => open(e) && e.date < today && nyInstant(e.date, e.time).getTime() < now.getTime() - graceMin * 60000).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export interface Step { label: string; done: boolean }
/** The nightly checklist for one production. */
export function nightSteps(p: Pick<Production, "status">, hasImage: boolean): Step[] {
  const approved = ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(p.status);
  return [
    { label: "Image made or imported", done: hasImage },
    { label: "Approved", done: approved },
    { label: "Posted on Instagram (exact caption)", done: p.status === "PUBLISHED" },
  ];
}
