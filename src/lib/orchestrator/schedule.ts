// Suggests a calendar slot honouring house rules: one post per creator per day, >=90 min between any two creators.
import type { CalendarEntry } from "@/lib/db/records";
import type { TalentCode } from "@/lib/domain/types";

const SLOTS = ["09:00", "11:00", "13:30", "16:00", "19:00", "21:00"];
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function suggestSlot(existing: Pick<CalendarEntry, "talent" | "date" | "time">[], talent: TalentCode, from = new Date()): { date: string; time: string } {
  for (let day = 1; day < 60; day++) {
    const d = new Date(from); d.setUTCDate(d.getUTCDate() + day);
    const date = iso(d);
    const today = existing.filter((e) => e.date === date);
    if (today.some((e) => e.talent === talent)) continue;
    const time = SLOTS.find((s) => today.every((e) => Math.abs(mins(e.time) - mins(s)) >= 90));
    if (time) return { date, time };
  }
  return { date: iso(new Date(from.getTime() + 61 * 864e5)), time: SLOTS[0] };
}
