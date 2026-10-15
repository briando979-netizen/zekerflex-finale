import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Finds appointments in Dutch (and plain English) text — "morgen om 8 uur",
// "dinsdag 14:30", "22 oktober om half 3", "vrijdag 9-11 uur", "next Monday
// at 10am" — relative to when the text was written, in Amsterdam time.
// Deliberately conservative: appointments go into the agenda without a
// confirmation step, so a missed one is better than a made-up one.
//   - negations / cancellations ("kan morgen niet", "gaat niet door") are skipped
//   - a date without a time only counts next to an appointment word (all-day)
//   - a time without a date needs "om …" or an appointment word, and means
//     today when still ahead, otherwise tomorrow
// ---------------------------------------------------------------------------

export interface AppointmentCandidate {
  start: Date;
  end: Date | null;
  allDay: boolean;
  phrase: string;
  confidence: "high" | "medium";
}

interface CalDate {
  year: number;
  month: number;
  day: number;
}
interface Mention<T> {
  at: number;
  end: number;
  value: T;
}
interface ClockTime {
  hour: number;
  minute: number;
  /** hour came from a bare number ("om 3", "half 3"), so part-of-day may shift it */
  vague: boolean;
  endHour?: number;
  endMinute?: number;
}

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1, februari: 2, february: 2, feb: 2, maart: 3, march: 3, mrt: 3, mar: 3, april: 4, apr: 4,
  mei: 5, may: 5, juni: 6, june: 6, jun: 6, juli: 7, july: 7, jul: 7, augustus: 8, august: 8, aug: 8, september: 9,
  sept: 9, sep: 9, oktober: 10, october: 10, okt: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const WEEKDAYS: Record<string, number> = {
  zondag: 0, sunday: 0, maandag: 1, monday: 1, dinsdag: 2, tuesday: 2, woensdag: 3, wednesday: 3,
  donderdag: 4, thursday: 4, vrijdag: 5, friday: 5, zaterdag: 6, saturday: 6,
};
const NUMBER_WORDS: Record<string, number> = {
  een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
};
const NUM = "(\\d{1,2}|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf)";
const toNum = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);

const NEGATION =
  /\b(niet|geen|afgezegd|afzeggen|geannuleerd|annuleren|annulering|verzet|verplaatst|gaat niet door|kan niet|lukt niet|cancel(?:led|ed)?|can't|cannot|won't)\b/i;
const APPOINTMENT_HINT =
  /\b(afspraak|afspreken|meeting|vergader\w*|overleg\w*|gesprek\w*|sollicitat\w*|kennismak\w*|langs\s?komen|langskomen|komen|kom|zien|bellen|bel|beginnen|begin|starten|start|dienst|werken|ophalen|levering|leveren|bezorg\w*|inwerken|training|cursus|interview|call|lunch|diner|borrel|appointment|meet|visit|tandarts|dokter|huisarts)\b/i;

const addDays = (d: CalDate, n: number): CalDate => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};
const weekdayOf = (d: CalDate) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

function findDates(text: string, today: CalDate): Mention<CalDate & { weekday?: number; strictWeekday?: boolean }>[] {
  const out: Mention<CalDate & { weekday?: number; strictWeekday?: boolean }>[] = [];
  const add = (at: number, len: number, value: CalDate & { weekday?: number; strictWeekday?: boolean }) => {
    if (!out.some((o) => at < o.end && at + len > o.at)) out.push({ at, end: at + len, value });
  };
  let m: RegExpExecArray | null;

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(text))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validDate(y, mo, d)) add(m.index, m[0].length, { year: y, month: mo, day: d });
  }

  const named = new RegExp(
    `\\b(\\d{1,2})(?:e|ste|de|st|nd|rd|th)?\\s+(${Object.keys(MONTHS).join("|")})\\.?(?:\\s+(\\d{4}))?\\b`,
    "gi",
  );
  while ((m = named.exec(text))) add(m.index, m[0].length, pickYear(Number(m[1]), MONTHS[m[2]!.toLowerCase()]!, m[3], today));
  const namedEn = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
  while ((m = namedEn.exec(text))) {
    const month = MONTHS[m[1]!.toLowerCase()]!;
    if (Number(m[2]) <= 31) add(m.index, m[0].length, pickYear(Number(m[2]), month, m[3], today));
  }

  // 15-10, 15/10, 15-10-2026, 15.10.2026 — a bare "15.10" is a time, "8-12 uur" a time range
  const numeric = /\b(\d{1,2})([-/.])(\d{1,2})(?:\2(\d{2,4}))?\b(?!\s*(?:u\b|uur|h\b|[:.]\d))/g;
  while ((m = numeric.exec(text))) {
    if (m[2] === "." && !m[4]) continue;
    const before = text.slice(Math.max(0, m.index - 8), m.index).toLowerCase();
    if (!m[4] && /(van|tussen|from)\s*$/.test(before)) continue;
    const d = Number(m[1]);
    const mo = Number(m[3]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    const y = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : undefined;
    const value = y ? { year: y, month: mo, day: d } : pickYear(d, mo, undefined, today);
    if (validDate(value.year, value.month, value.day)) add(m.index, m[0].length, value);
  }

  const relative: [RegExp, number][] = [
    [/\b(overmorgen|day after tomorrow)\b/gi, 2],
    [/(?<!'s\s)\b(morgen(?:ochtend|middag|avond)?|tomorrow)\b/gi, 1],
    [/\b(vandaag|vanavond|vanmiddag|vanochtend|today|tonight)\b/gi, 0],
  ];
  for (const [re, offset] of relative) {
    while ((m = re.exec(text))) add(m.index, m[0].length, addDays(today, offset));
  }

  const weekday = new RegExp(
    `\\b(?:(volgende\\s+week|komende|aanstaande|volgende|deze|next|this)\\s+)?(${Object.keys(WEEKDAYS).join("|")})(?:ochtend|middag|avond|morgen)?\\b`,
    "gi",
  );
  while ((m = weekday.exec(text))) {
    const target = WEEKDAYS[m[2]!.toLowerCase()]!;
    const mod = (m[1] ?? "").toLowerCase().replace(/\s+/g, " ");
    const current = weekdayOf(today);
    let ahead = (target - current + 7) % 7;
    if (mod === "volgende week") {
      // the given weekday in next calendar week (weeks start on Monday)
      const toNextMonday = ((8 - current) % 7) || 7;
      ahead = toNextMonday + ((target + 6) % 7);
    } else if (mod === "volgende" || mod === "next") {
      if (ahead === 0) ahead = 7;
    }
    add(m.index, m[0].length, { ...addDays(today, ahead), weekday: target, strictWeekday: ahead === 0 && mod !== "deze" && mod !== "this" });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A date without a year: this year, unless that's more than a week ago — then next year. */
function pickYear(day: number, month: number, year: string | undefined, today: CalDate): CalDate {
  if (year) return { year: Number(year), month, day };
  const thisYear = Date.UTC(today.year, month - 1, day);
  const weekAgo = Date.UTC(today.year, today.month - 1, today.day - 7);
  return { year: thisYear < weekAgo ? today.year + 1 : today.year, month, day };
}

function findTimes(text: string): Mention<ClockTime>[] {
  const out: Mention<ClockTime>[] = [];
  const add = (at: number, len: number, value: ClockTime) => {
    if (!out.some((o) => at < o.end && at + len > o.at)) out.push({ at, end: at + len, value });
  };
  let m: RegExpExecArray | null;

  const ampm = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\.?\b/gi;
  while ((m = ampm.exec(text))) {
    let h = Number(m[1]);
    if (h < 1 || h > 12) continue;
    const pm = m[3]!.toLowerCase() === "p";
    h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
    add(m.index, m[0].length, { hour: h, minute: Number(m[2] ?? 0), vague: false });
  }
  const clock = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?:\s*(?:uur|u)\b)?/g;
  while ((m = clock.exec(text))) add(m.index, m[0].length, { hour: Number(m[1]), minute: Number(m[2]), vague: false });
  const uShort = /\b([01]?\d|2[0-3])u([0-5]\d)\b/g;
  while ((m = uShort.exec(text))) add(m.index, m[0].length, { hour: Number(m[1]), minute: Number(m[2]), vague: false });
  const half = new RegExp(`\\bhalf\\s+${NUM}\\b`, "gi");
  while ((m = half.exec(text))) {
    const h = toNum(m[1]!);
    if (h >= 1 && h <= 12) add(m.index, m[0].length, { hour: h === 1 ? 12 : h - 1, minute: 30, vague: true });
  }
  const quarter = new RegExp(`\\bkwart\\s+(over|voor)\\s+${NUM}\\b`, "gi");
  while ((m = quarter.exec(text))) {
    const h = toNum(m[2]!);
    if (h < 1 || h > 12) continue;
    if (m[1]!.toLowerCase() === "over") add(m.index, m[0].length, { hour: h, minute: 15, vague: true });
    else add(m.index, m[0].length, { hour: h === 1 ? 12 : h - 1, minute: 45, vague: true });
  }
  const uur = new RegExp(`\\b${NUM}\\s*(?:uur|u)\\b`, "gi");
  while ((m = uur.exec(text))) {
    const h = toNum(m[1]!);
    if (h >= 0 && h <= 23) add(m.index, m[0].length, { hour: h, minute: 0, vague: h <= 12 });
  }
  const om = /\b(?:om|at)\s+(\d{1,2})\b(?![:.\d]|\s*(?:uur|u)\b|[-/])/gi;
  while ((m = om.exec(text))) {
    const h = Number(m[1]);
    const at = m.index + m[0].length - m[1]!.length;
    if (h >= 1 && h <= 23) add(at, m[1]!.length, { hour: h, minute: 0, vague: h <= 12 });
  }

  // "9-11 uur", "14:00 - 16:00", "van 9 tot 17", "tussen 10 en 12": second time becomes the end
  const sorted = out.sort((a, b) => a.at - b.at);
  const merged: Mention<ClockTime>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1];
    if (next && /^\s*(?:-|–|tot|t\/m|en|to|until)\s*$/i.test(text.slice(cur.end, next.at))) {
      merged.push({ at: cur.at, end: next.end, value: { ...cur.value, endHour: next.value.hour, endMinute: next.value.minute } });
      i++;
    } else {
      merged.push(cur);
    }
  }
  // bare-number ranges the patterns above don't see as two times: "9-11 uur", "van 9 tot 17"
  const bareRange = /\b(?:van\s+)?(\d{1,2})\s*(?:-|–|tot)\s*(\d{1,2})\s*(?:uur|u)\b/gi;
  while ((m = bareRange.exec(text))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 23 || b > 24 || b <= a) continue;
    const at = m.index;
    const end = m.index + m[0].length;
    for (let i = merged.length - 1; i >= 0; i--) if (merged[i]!.at < end && merged[i]!.end > at) merged.splice(i, 1);
    merged.push({ at, end, value: { hour: a, minute: 0, vague: a <= 12, endHour: b, endMinute: 0 } });
  }
  const between = /\btussen\s+(\d{1,2})\s+en\s+(\d{1,2})\b/gi;
  while ((m = between.exec(text))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 23 || b > 24 || b <= a) continue;
    const at = m.index;
    const end = m.index + m[0].length;
    for (let i = merged.length - 1; i >= 0; i--) if (merged[i]!.at < end && merged[i]!.end > at) merged.splice(i, 1);
    merged.push({ at, end, value: { hour: a, minute: 0, vague: a <= 12, endHour: b, endMinute: 0 } });
  }
  return merged.sort((a, b) => a.at - b.at);
}

/** Bare hours: "om 3" in a work chat means 15:00, "om 8" means 08:00 — unless a part of day says otherwise. */
function resolveHour(hour: number, vague: boolean, context: string): number {
  if (!vague || hour >= 13 || hour === 0) return hour;
  if (/'s\s*(ochtends|morgens)|ochtend|morgens|morning|\bam\b/i.test(context)) return hour === 12 ? 12 : hour;
  if (/'s\s*(middags|avonds)|middag|avond|afternoon|evening|tonight/i.test(context)) return hour === 12 ? 12 : hour < 12 ? hour + 12 : hour;
  return hour <= 6 ? hour + 12 : hour;
}

function splitUnits(text: string): string[] {
  const clean = text.replace(/\r/g, "");
  if (clean.length <= 320) return [clean.replace(/\s+/g, " ").trim()];
  return clean
    .split(/\n{2,}|\n(?=\s*[-•*])/)
    .flatMap((p) => (p.length > 400 ? p.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/) : [p]))
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function extractAppointments(text: string, writtenAt: Date): AppointmentCandidate[] {
  const now = amsterdamParts(writtenAt);
  const today: CalDate = { year: now.year, month: now.month, day: now.day };
  const results: AppointmentCandidate[] = [];

  for (const unit of splitUnits(text)) {
    if (!unit || NEGATION.test(unit)) continue;
    const dates = findDates(unit, today);
    const times = findTimes(unit);
    const hinted = APPOINTMENT_HINT.test(unit);
    const usedDates = new Set<number>();

    for (const t of times) {
      // nearest date mention, preferring one before the time
      let best: (typeof dates)[number] | null = null;
      let bestDistance = Infinity;
      dates.forEach((d) => {
        const distance = d.end <= t.at ? t.at - d.end : d.at - t.end + 25;
        if (distance < bestDistance) {
          best = d;
          bestDistance = distance;
        }
      });
      const hour = resolveHour(t.value.hour, t.value.vague, unit);
      let date: CalDate;
      let confidence: AppointmentCandidate["confidence"] = "high";
      if (best) {
        const chosen = best as (typeof dates)[number];
        usedDates.add(chosen.at);
        date = chosen.value;
        // "donderdag 3 uur" said on a Thursday morning: today if still ahead, else next week
        if (chosen.value.strictWeekday) {
          const startToday = amsterdamToUtc(today.year, today.month, today.day, hour, t.value.minute);
          if (startToday.getTime() <= writtenAt.getTime()) date = addDays(today, 7);
        }
      } else {
        const precededByOm = /\b(om|at)\s*$/i.test(unit.slice(Math.max(0, t.at - 4), t.at));
        if (!hinted && !precededByOm) continue;
        const startToday = amsterdamToUtc(today.year, today.month, today.day, hour, t.value.minute);
        date = startToday.getTime() > writtenAt.getTime() + 30 * 60_000 ? today : addDays(today, 1);
        confidence = "medium";
      }
      const start = amsterdamToUtc(date.year, date.month, date.day, hour, t.value.minute);
      let end: Date | null = null;
      if (t.value.endHour !== undefined) {
        let endHour = resolveHour(t.value.endHour, t.value.vague, unit);
        if (endHour <= hour && endHour + 12 <= 24) endHour += 12;
        end = amsterdamToUtc(date.year, date.month, date.day, endHour, t.value.endMinute ?? 0);
        if (end.getTime() <= start.getTime()) end = null;
      }
      if (start.getTime() < writtenAt.getTime() - 60 * 60_000) continue;
      results.push({ start, end, allDay: false, phrase: unit.slice(0, 280), confidence });
    }

    if (hinted) {
      for (const d of dates) {
        if (usedDates.has(d.at)) continue;
        const date = d.value.strictWeekday ? addDays(today, 7) : d.value;
        const start = amsterdamToUtc(date.year, date.month, date.day, 0, 0);
        if (start.getTime() < amsterdamToUtc(today.year, today.month, today.day, 0, 0).getTime()) continue;
        results.push({ start, end: null, allDay: true, phrase: unit.slice(0, 280), confidence: "medium" });
      }
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.start.toISOString()}|${r.allDay}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
