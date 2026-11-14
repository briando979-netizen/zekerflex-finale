import { monthlyPlatformFeeCents } from "@/lib/pricing/tiers";

// ---------------------------------------------------------------------------
// "Stel je klus samen" (/klus-plaatsen): an employer drafts a klus before
// having an account, sees what it costs and how many people are near, and the
// draft waits in the browser until the werkgever's own NewShiftForm picks it
// up after sign-up. Pure and dependency-free, so it runs in the browser.
// ---------------------------------------------------------------------------

export const CONCEPT_KEY = "zf-klus-concept";
const MAX_AGE_MS = 14 * 24 * 3600_000;

export interface KlusConcept {
  v: 1;
  title: string;
  description: string;
  city: string;
  /** YYYY-MM-DD, local (Dutch) date */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM; earlier than start = the shift runs past midnight */
  end: string;
  breakMinutes: number;
  positions: number;
  rateCents: number;
  savedAt: number;
}

const toMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
};

/** Worked hours of one shift: end − start (past midnight when end ≤ start) − break, never negative. */
export function conceptHours(c: Pick<KlusConcept, "start" | "end" | "breakMinutes">): number {
  const s = toMinutes(c.start);
  const e = toMinutes(c.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  const span = e > s ? e - s : e + 24 * 60 - s;
  return Math.max(0, Math.round(((span - Math.max(0, c.breakMinutes)) / 60) * 100) / 100);
}

export interface ConceptCost {
  hours: number;
  totalHours: number;
  grossPerPersonCents: number;
  grossTotalCents: number;
  feeTotalCents: number;
  totalCents: number;
}

/** What the klus costs excl. btw: the workers' rate plus the platform fee (staffel over the klus's own hours). */
export function conceptCost(c: Pick<KlusConcept, "start" | "end" | "breakMinutes" | "positions" | "rateCents">): ConceptCost {
  const hours = conceptHours(c);
  const positions = Math.max(1, Math.min(50, Math.round(c.positions) || 1));
  const totalHours = Math.round(hours * positions * 100) / 100;
  const grossPerPersonCents = Math.round(hours * c.rateCents);
  const grossTotalCents = grossPerPersonCents * positions;
  const feeTotalCents = monthlyPlatformFeeCents(totalHours);
  return { hours, totalHours, grossPerPersonCents, grossTotalCents, feeTotalCents, totalCents: grossTotalCents + feeTotalCents };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The values NewShiftForm keeps in state (datetime-local strings in the browser's own time). */
export function toShiftFormValues(c: KlusConcept): {
  title: string;
  description: string;
  rateEuro: string;
  breakMin: string;
  positions: string;
  startsAt: string;
  endsAt: string;
} {
  const startsAt = `${c.date}T${c.start}`;
  let endDate = c.date;
  if (toMinutes(c.end) <= toMinutes(c.start)) {
    const [y, m, d] = c.date.split("-").map(Number);
    const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
    endDate = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }
  return {
    title: c.title,
    description: c.description,
    rateEuro: (c.rateCents / 100).toFixed(2),
    breakMin: String(c.breakMinutes),
    positions: String(c.positions),
    startsAt,
    endsAt: `${endDate}T${c.end}`,
  };
}

/** A stored draft, or null when it's missing, broken, too old or already in the past. */
export function parseConcept(raw: string | null, now = Date.now(), today = ""): KlusConcept | null {
  if (!raw) return null;
  let c: Partial<KlusConcept>;
  try {
    c = JSON.parse(raw) as Partial<KlusConcept>;
  } catch {
    return null;
  }
  const ok =
    c.v === 1 &&
    typeof c.title === "string" && c.title.trim().length >= 2 && c.title.length <= 120 &&
    typeof c.description === "string" && c.description.length <= 2000 &&
    typeof c.city === "string" && c.city.length <= 80 &&
    typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
    typeof c.start === "string" && Number.isFinite(toMinutes(c.start)) &&
    typeof c.end === "string" && Number.isFinite(toMinutes(c.end)) &&
    typeof c.breakMinutes === "number" && c.breakMinutes >= 0 && c.breakMinutes <= 240 &&
    typeof c.positions === "number" && c.positions >= 1 && c.positions <= 50 &&
    typeof c.rateCents === "number" && c.rateCents > 0 && c.rateCents <= 50_000 &&
    typeof c.savedAt === "number" && now - c.savedAt <= MAX_AGE_MS;
  if (!ok) return null;
  if (today && c.date! < today) return null;
  return c as KlusConcept;
}

/** Sector landing page (lib/seo-sectors.ts key) → the SHIFT_TEMPLATES key that fits it best. */
/**
 * Wat ontbreekt er nog voordat de klus bewaard kan worden: één Nederlandse zin, of null.
 * De knop op /klus-plaatsen staat altijd aan; wie drukt, hoort precies wat er mist (gemeten
 * 14 nov: bezoekers zagen een uitgeschakelde knop en een algemene hint, en haakten af).
 */
export function conceptOntbreekt(c: { title: string; city: string; date: string; today: string; hours: number }): string | null {
  const leeg: string[] = [];
  if (c.title.trim().length < 2) leeg.push("de functie (of een naam voor de klus)");
  if (c.city.trim().length < 2) leeg.push("de plaats");
  if (!c.date) leeg.push("een datum");
  if (leeg.length) return `Vul nog in: ${leeg.length === 1 ? leeg[0] : `${leeg.slice(0, -1).join(", ")} en ${leeg[leeg.length - 1]}`}.`;
  if (c.today && c.date < c.today) return "Kies een datum vanaf vandaag.";
  if (!(c.hours > 0)) return "De eindtijd moet na de begintijd liggen, met ruimte voor de pauze.";
  return null;
}

/** De code van het eerste wat ontbreekt (anonieme meting, lib/analytics/formulier-meting.ts); null als alles klopt. */
export function conceptOntbreektVeld(c: { title: string; city: string; date: string; today: string; hours: number }): string | null {
  if (c.title.trim().length < 2) return "functie";
  if (c.city.trim().length < 2) return "plaats";
  if (!c.date) return "datum";
  if (c.today && c.date < c.today) return "datum-verleden";
  if (!(c.hours > 0)) return "tijden";
  return null;
}

export const SECTOR_TEMPLATE: Record<string, string> = {
  horeca: "horeca",
  logistiek: "magazijn",
  schoonmaak: "schoonmaak",
  evenementen: "horeca",
  retail: "vakkenvuller",
};

/** /klus-plaatsen with the function and place already filled in, for the sector and city pages. */
export function klusUrl(opts: { sector?: string; city?: string } = {}): string {
  const q = new URLSearchParams();
  const functie = opts.sector ? SECTOR_TEMPLATE[opts.sector] : undefined;
  if (functie) q.set("functie", functie);
  if (opts.city) q.set("plaats", opts.city);
  const s = q.toString();
  return s ? `/klus-plaatsen?${s}` : "/klus-plaatsen";
}

/** Roles that may put out a dienst (lib/auth/rbac.ts, /werkgever/diensten): they skip sign-up and go straight to the form. */
const SHIFT_CREATOR_ROLES = ["LOCAL_MANAGER", "HQ_ADMIN"];

export function canPostShift(roles: unknown): boolean {
  return Array.isArray(roles) && roles.some((r) => SHIFT_CREATOR_ROLES.includes(String(r)));
}

// --- krachten in de buurt -------------------------------------------------

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** People in the anonymous supply cells (lib/shifts/supply-map.ts) whose centre lies within km of a place. */
export function supplyNear(cells: { lat: number; lng: number; count: number }[], place: { lat: number; lng: number }, km = 25): number {
  return cells.reduce((n, c) => (haversineKm(c, place) <= km ? n + c.count : n), 0);
}

/** "40+" — rounded down to tens, and nothing below 20 (a small number scares off more than it helps). */
export function supplyLabel(count: number): string | null {
  return count >= 20 ? `${Math.floor(count / 10) * 10}+` : null;
}
