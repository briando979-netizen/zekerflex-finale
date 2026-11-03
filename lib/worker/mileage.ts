import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { haversineMeters } from "@/lib/geo/geofencing";
import { amsterdamDayKey, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Kilometer- en rittenregistratie: elke gewerkte dienst is een rit van huis
// naar de vestiging en terug. De afstand is een schatting (hemelsbreed × de
// omrijfactor uit lib/geo/travel-time); de werker past per rit de echte
// kilometers aan of zet een rit uit (bv. met de fiets of het OV gegaan).
// Aanpassingen staan in KV `ritten:<userId>` — geen schemawijziging nodig.
// Bedragen zijn indicatief, geen belastingadvies.
// ---------------------------------------------------------------------------

/** € 0,23 per zakelijke km met een privéauto (aftrek zzp / onbelaste vergoeding), 2026 indicatief. */
export const KM_RATE_CENTS = 23;
/** Zelfde omrijfactor als de reistijd-schatting voor de auto (lib/geo/travel-time.ts). */
const DRIVING_DETOUR = 1.35;
const MAX_KM = 2000;

const COUNTED = ["SUBMITTED", "APPROVED", "PAID"] as const;

export interface Trip {
  timesheetId: string;
  day: string; // "2026-11-03", Amsterdamse kalenderdag
  company: string;
  shiftTitle: string;
  destination: string;
  /** Geschatte km heen + terug; null als je thuisadres onbekend is. */
  estimatedKm: number | null;
  /** Wat telt: jouw aanpassing, anders de schatting. */
  km: number;
  edited: boolean;
  excluded: boolean;
}

export interface MileageLog {
  year: number;
  isPayroll: boolean;
  homeKnown: boolean;
  homePostalCode: string;
  ratePerKmCents: number;
  trips: Trip[];
  totals: { trips: number; km: number; amountCents: number };
}

type Override = { km?: number; excluded?: boolean };
type Overrides = Record<string, Override>;

const kvKey = (userId: string) => `ritten:${userId}`;

/** Afstand heen + terug in km, één decimaal. */
export function roundTripKm(home: { latitude: number; longitude: number }, dest: { latitude: number; longitude: number }): number {
  const oneWay = (haversineMeters(home, dest) * DRIVING_DETOUR) / 1000;
  return Math.round(oneWay * 2 * 10) / 10;
}

export function totalsFor(trips: Pick<Trip, "km" | "excluded">[]): MileageLog["totals"] {
  const counted = trips.filter((t) => !t.excluded);
  const km = Math.round(counted.reduce((s, t) => s + t.km, 0) * 10) / 10;
  return { trips: counted.length, km, amountCents: Math.round(km * KM_RATE_CENTS) };
}

function homeIsKnown(p: { homeLatitude: number; homeLongitude: number; homePostalCode: string }): boolean {
  return Boolean(p.homePostalCode.trim()) && !(p.homeLatitude === 0 && p.homeLongitude === 0);
}

export async function getMileageLog(userId: string, year: number): Promise<MileageLog | null> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, homeLatitude: true, homeLongitude: true, homePostalCode: true },
  });
  if (!profile) return null;

  const [fiscal, overrides, timesheets] = await Promise.all([
    getFiscal(userId),
    kvGet<Overrides>(kvKey(userId)),
    prisma.timesheet.findMany({
      where: {
        freelancerId: profile.id,
        status: { in: [...COUNTED] },
        scheduledStart: { gte: amsterdamToUtc(year, 1, 1), lt: amsterdamToUtc(year + 1, 1, 1) },
      },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true,
        scheduledStart: true,
        actualStart: true,
        assignment: { select: { shift: { select: { title: true } } } },
        branch: { select: { addressLine: true, postalCode: true, city: true, latitude: true, longitude: true, tenant: { select: { name: true } } } },
      },
    }),
  ]);

  const homeKnown = homeIsKnown(profile);
  const home = { latitude: profile.homeLatitude, longitude: profile.homeLongitude };
  const trips: Trip[] = timesheets.map((t) => {
    const estimatedKm = homeKnown ? roundTripKm(home, t.branch) : null;
    const o = overrides?.[t.id];
    const km = o?.km ?? estimatedKm ?? 0;
    return {
      timesheetId: t.id,
      day: amsterdamDayKey(t.actualStart ?? t.scheduledStart),
      company: t.branch.tenant.name,
      shiftTitle: t.assignment.shift.title,
      destination: `${t.branch.addressLine}, ${t.branch.postalCode} ${t.branch.city}`,
      estimatedKm,
      km,
      edited: o?.km !== undefined,
      excluded: o?.excluded === true,
    };
  });

  return {
    year,
    isPayroll: invoiceModeFor(fiscal) === "payroll",
    homeKnown,
    homePostalCode: profile.homePostalCode,
    ratePerKmCents: KM_RATE_CENTS,
    trips,
    totals: totalsFor(trips),
  };
}

/** Pas één rit aan: eigen km (null = terug naar de schatting) en/of uitzetten. */
export async function setTripOverride(userId: string, timesheetId: string, change: { km?: number | null; excluded?: boolean }): Promise<void> {
  const owned = await prisma.timesheet.findFirst({
    where: { id: timesheetId, freelancer: { userId } },
    select: { id: true },
  });
  if (!owned) throw AppError.notFound("Deze rit hoort niet bij jouw diensten");
  if (change.km != null && (!Number.isFinite(change.km) || change.km < 0 || change.km > MAX_KM)) {
    throw AppError.validation(`Vul een afstand in tussen 0 en ${MAX_KM} km`);
  }

  const all = (await kvGet<Overrides>(kvKey(userId))) ?? {};
  const next: Override = { ...all[timesheetId] };
  if (change.km === null) delete next.km;
  else if (change.km !== undefined) next.km = Math.round(change.km * 10) / 10;
  if (change.excluded === false) delete next.excluded;
  else if (change.excluded === true) next.excluded = true;

  if (next.km === undefined && next.excluded === undefined) delete all[timesheetId];
  else all[timesheetId] = next;
  await kvSet(kvKey(userId), all);
}

/** Jaarlijst voor de boekhouder (puntkomma's + BOM, opent direct goed in Excel). */
export function mileageCsv(log: MileageLog): string {
  const e = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const k = (km: number) => km.toFixed(1).replace(".", ",");
  const cell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["Datum;Van (postcode);Naar;Opdrachtgever;Doel;Km heen en terug;Bedrag;Meegeteld"];
  for (const t of log.trips) {
    lines.push(
      [
        t.day,
        cell(log.homePostalCode),
        cell(t.destination),
        cell(t.company),
        cell(`Dienst: ${t.shiftTitle}`),
        k(t.km),
        e(t.excluded ? 0 : Math.round(t.km * log.ratePerKmCents)),
        t.excluded ? "nee" : "ja",
      ].join(";"),
    );
  }
  lines.push(["Totaal", "", "", "", `${log.totals.trips} ${log.totals.trips === 1 ? "rit" : "ritten"}`, k(log.totals.km), e(log.totals.amountCents), ""].join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Huidig jaar in Amsterdam (de server draait in UTC). */
export function currentYear(now = new Date()): number {
  return amsterdamParts(now).year;
}
