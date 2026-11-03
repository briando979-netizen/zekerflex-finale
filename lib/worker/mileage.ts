import { randomUUID } from "node:crypto";
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
// Ritten voor werk buiten ZekerFlex voegt de werker zelf toe, zodat dit één
// complete rittenadministratie is.
//   KV `ritten:<userId>`       → { [timesheetId]: { km?, excluded? } }
//   KV `ritten-eigen:<userId>` → ManualTrip[]
// Geen schemawijziging nodig. Bedragen zijn indicatief, geen belastingadvies.
// ---------------------------------------------------------------------------

/** € 0,23 per zakelijke km met een privéauto (aftrek zzp / onbelaste vergoeding), 2026 indicatief. */
export const KM_RATE_CENTS = 23;
/** Zelfde omrijfactor als de reistijd-schatting voor de auto (lib/geo/travel-time.ts). */
const DRIVING_DETOUR = 1.35;
const MAX_KM = 2000;
const MAX_MANUAL = 1500;

const COUNTED = ["SUBMITTED", "APPROVED", "PAID"] as const;

export interface Trip {
  /** timesheetId, of "m-…" voor een rit die je zelf hebt toegevoegd. */
  id: string;
  manual: boolean;
  day: string; // "2026-11-03", Amsterdamse kalenderdag
  company: string;
  /** Titel van de dienst, of het doel dat je zelf invulde. */
  purpose: string;
  destination: string;
  /** Geschatte km heen + terug; null als je thuisadres onbekend is of bij een eigen rit. */
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

export interface ManualTrip {
  id: string;
  day: string;
  destination: string;
  company: string;
  purpose: string;
  km: number;
  createdAt: string;
}

const kvKey = (userId: string) => `ritten:${userId}`;
const manualKey = (userId: string) => `ritten-eigen:${userId}`;
const isManualId = (id: string) => id.startsWith("m-");

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

function assertKm(km: number): void {
  if (!Number.isFinite(km) || km < 0 || km > MAX_KM) throw AppError.validation(`Vul een afstand in tussen 0 en ${MAX_KM} km`);
}

const roundKm = (km: number) => Math.round(km * 10) / 10;

function manualToTrip(m: ManualTrip): Trip {
  return { id: m.id, manual: true, day: m.day, company: m.company, purpose: m.purpose, destination: m.destination, estimatedKm: null, km: m.km, edited: false, excluded: false };
}

export async function getMileageLog(userId: string, year: number): Promise<MileageLog | null> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, homeLatitude: true, homeLongitude: true, homePostalCode: true },
  });
  if (!profile) return null;

  const [fiscal, overrides, manual, timesheets] = await Promise.all([
    getFiscal(userId),
    kvGet<Overrides>(kvKey(userId)),
    kvGet<ManualTrip[]>(manualKey(userId)),
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
  const fromShifts: Trip[] = timesheets.map((t) => {
    const estimatedKm = homeKnown ? roundTripKm(home, t.branch) : null;
    const o = overrides?.[t.id];
    const km = o?.km ?? estimatedKm ?? 0;
    return {
      id: t.id,
      manual: false,
      day: amsterdamDayKey(t.actualStart ?? t.scheduledStart),
      company: t.branch.tenant.name,
      purpose: t.assignment.shift.title,
      destination: `${t.branch.addressLine}, ${t.branch.postalCode} ${t.branch.city}`,
      estimatedKm,
      km,
      edited: o?.km !== undefined,
      excluded: o?.excluded === true,
    };
  });
  const own = (manual ?? []).filter((m) => m.day.startsWith(`${year}-`)).map(manualToTrip);
  // Stabiel op dag: diensten staan al op begintijd, eigen ritten komen achter de diensten van die dag.
  const trips = [...fromShifts, ...own].sort((a, b) => a.day.localeCompare(b.day));

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
export async function setTripOverride(userId: string, tripId: string, change: { km?: number | null; excluded?: boolean }): Promise<void> {
  if (change.km != null) assertKm(change.km);

  if (isManualId(tripId)) {
    // Een eigen rit heeft geen schatting en wordt verwijderd in plaats van uitgezet.
    if (change.km == null) throw AppError.validation("Vul de kilometers van deze rit in");
    const list = (await kvGet<ManualTrip[]>(manualKey(userId))) ?? [];
    const trip = list.find((m) => m.id === tripId);
    if (!trip) throw AppError.notFound("Deze rit bestaat niet meer");
    trip.km = roundKm(change.km);
    await kvSet(manualKey(userId), list);
    return;
  }

  const owned = await prisma.timesheet.findFirst({
    where: { id: tripId, freelancer: { userId } },
    select: { id: true },
  });
  if (!owned) throw AppError.notFound("Deze rit hoort niet bij jouw diensten");

  const all = (await kvGet<Overrides>(kvKey(userId))) ?? {};
  const next: Override = { ...all[tripId] };
  if (change.km === null) delete next.km;
  else if (change.km !== undefined) next.km = roundKm(change.km);
  if (change.excluded === false) delete next.excluded;
  else if (change.excluded === true) next.excluded = true;

  if (next.km === undefined && next.excluded === undefined) delete all[tripId];
  else all[tripId] = next;
  await kvSet(kvKey(userId), all);
}

export interface NewManualTrip {
  day: string;
  destination: string;
  company: string;
  purpose: string;
  km: number;
}

/** Voeg een rit toe voor werk buiten ZekerFlex (of een rit die niet bij een dienst hoort). */
export async function addManualTrip(userId: string, input: NewManualTrip, now = new Date()): Promise<Trip> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw AppError.validation("Kies een datum");
  const [y, m, d] = input.day.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw AppError.validation("Die datum bestaat niet");
  if (y < 2020 || input.day > amsterdamDayKey(now)) throw AppError.validation("Kies een datum vanaf 2020 en niet in de toekomst");
  assertKm(input.km);
  if (input.km <= 0) throw AppError.validation("Vul de kilometers van deze rit in");
  const destination = input.destination.trim();
  if (!destination) throw AppError.validation("Vul in waar je naartoe reed");

  const list = (await kvGet<ManualTrip[]>(manualKey(userId))) ?? [];
  if (list.length >= MAX_MANUAL) throw AppError.validation("Je hebt het maximum aantal eigen ritten bereikt");
  const trip: ManualTrip = {
    id: `m-${randomUUID()}`,
    day: input.day,
    destination: destination.slice(0, 160),
    company: input.company.trim().slice(0, 120),
    purpose: input.purpose.trim().slice(0, 160),
    km: roundKm(input.km),
    createdAt: now.toISOString(),
  };
  list.push(trip);
  await kvSet(manualKey(userId), list);
  return manualToTrip(trip);
}

export async function deleteManualTrip(userId: string, tripId: string): Promise<void> {
  if (!isManualId(tripId)) throw AppError.validation("Een rit van een dienst kun je uitzetten, niet verwijderen");
  const list = (await kvGet<ManualTrip[]>(manualKey(userId))) ?? [];
  const next = list.filter((m) => m.id !== tripId);
  if (next.length === list.length) throw AppError.notFound("Deze rit bestaat niet meer");
  await kvSet(manualKey(userId), next);
}

/** Jaarlijst voor de boekhouder (puntkomma's + BOM, opent direct goed in Excel). */
export function mileageCsv(log: MileageLog): string {
  const e = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const k = (km: number) => km.toFixed(1).replace(".", ",");
  const cell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["Datum;Van (postcode);Naar;Opdrachtgever;Doel;Km heen en terug;Bedrag;Meegeteld;Bron"];
  for (const t of log.trips) {
    lines.push(
      [
        t.day,
        cell(log.homePostalCode),
        cell(t.destination),
        cell(t.company),
        cell(t.manual ? t.purpose : `Dienst: ${t.purpose}`),
        k(t.km),
        e(t.excluded ? 0 : Math.round(t.km * log.ratePerKmCents)),
        t.excluded ? "nee" : "ja",
        t.manual ? "zelf ingevoerd" : "ZekerFlex-dienst",
      ].join(";"),
    );
  }
  lines.push(["Totaal", "", "", "", `${log.totals.trips} ${log.totals.trips === 1 ? "rit" : "ritten"}`, k(log.totals.km), e(log.totals.amountCents), "", ""].join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Huidig jaar in Amsterdam (de server draait in UTC). */
export function currentYear(now = new Date()): number {
  return amsterdamParts(now).year;
}
