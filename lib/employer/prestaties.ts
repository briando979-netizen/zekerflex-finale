import { prisma } from "@/lib/prisma";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { isEigenTestBedrijf } from "@/lib/admin/eigen-test-regel";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";
import {
  GEEN_PRESTATIES,
  actieveRegios,
  alGematchtOpDag,
  ervaringIn,
  gewerkteUrenBij,
  telPrestaties,
  type PrestatieRij,
  type Prestaties,
  type Regio,
} from "@/lib/employer/prestaties-kern";

// ---------------------------------------------------------------------------
// De cijfers per werker voor de reactietabel van een klus (app/werkgever/diensten/[shiftId]), in één zoekopdracht voor
// alle werkers die reageerden. Het rekenen staat in prestaties-kern.ts (puur, getest); hier alleen het ophalen.
// ---------------------------------------------------------------------------

export interface WerkerCijfers {
  prestaties: Prestaties;
  /** uren die de werker in 12 maanden zelf bij dit bedrijf werkte */
  urenBijBedrijf: number;
  /** plaatsen waar de werker in 12 maanden via ZekerFlex werkte */
  regios: Regio[];
  /** gecontroleerde KVK-inschrijving */
  kvk: boolean;
  zelfdeSector: boolean;
  zelfdeFunctie: boolean;
  /** die dag al bij dit bedrijf ingepland op een andere klus */
  gematchtDieDag: boolean;
}

export const GEEN_CIJFERS: WerkerCijfers = {
  prestaties: GEEN_PRESTATIES,
  urenBijBedrijf: 0,
  regios: [],
  kvk: false,
  zelfdeSector: false,
  zelfdeFunctie: false,
  gematchtDieDag: false,
};

/** De select van een inplanning waar alle cijfers uit komen. */
export const PRESTATIE_SELECT = {
  shiftId: true,
  cancelledAt: true,
  cancelReason: true,
  timesheet: { select: { status: true, actualStart: true, billableMinutes: true } },
  shift: {
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      requiredSkill: { select: { name: true } },
      branch: { select: { tenantId: true, city: true, latitude: true, longitude: true } },
    },
  },
} as const;

interface RuweRij {
  shiftId: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  timesheet: { status: string; actualStart: Date | null; billableMinutes: number } | null;
  shift: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    breakMinutes: number;
    requiredSkill: { name: string } | null;
    branch: { tenantId: string; city: string; latitude: number; longitude: number };
  };
}

export function naarPrestatieRij(a: RuweRij): PrestatieRij {
  return {
    shiftId: a.shiftId,
    tenantId: a.shift.branch.tenantId,
    cancelledAt: a.cancelledAt,
    cancelReason: a.cancelReason,
    timesheet: a.timesheet,
    shift: {
      title: a.shift.title,
      skill: a.shift.requiredSkill?.name ?? null,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
      breakMinutes: a.shift.breakMinutes,
      city: a.shift.branch.city,
      lat: a.shift.branch.latitude,
      lng: a.shift.branch.longitude,
    },
  };
}

/**
 * De bedrijven waarvan deze kijker niets mag zien in de cijfers van een werker: eigen-testbedrijven, tenzij het bedrijf
 * dat kijkt er zelf een is (lib/admin/eigen-test-regel.ts).
 */
export async function verborgenVoorBedrijf(tenantId: string): Promise<Set<string>> {
  const et = await leesEigenTest().catch(() => null);
  if (!et || isEigenTestBedrijf(et, tenantId)) return new Set();
  return new Set(Object.keys(et.tenants));
}

export async function werkerCijfersVoor(
  userIds: string[],
  klus: { id: string; tenantId: string; title: string; skill: string | null; startsAt: Date },
  now = new Date(),
): Promise<Map<string, WerkerCijfers>> {
  const uit = new Map<string, WerkerCijfers>();
  if (userIds.length === 0) return uit;
  const [profielen, verborgen] = await Promise.all([
    prisma.freelancerProfile.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        kvkValid: true,
        assignments: { select: PRESTATIE_SELECT, orderBy: { acceptedAt: "desc" }, take: 400 },
      },
    }),
    verborgenVoorBedrijf(klus.tenantId),
  ]);
  const dagStart = amsterdamStartOfDay(klus.startsAt);
  const dagEind = amsterdamStartOfDay(klus.startsAt, 1);
  for (const p of profielen) {
    const rijen = (p.assignments ?? []).map(naarPrestatieRij);
    const ervaring = ervaringIn(rijen, klus, now);
    uit.set(p.userId, {
      prestaties: telPrestaties(rijen, now),
      urenBijBedrijf: gewerkteUrenBij(rijen, klus.tenantId, now),
      regios: actieveRegios(rijen, now, verborgen).slice(0, 60),
      kvk: Boolean(p.kvkValid),
      zelfdeSector: ervaring.sector,
      zelfdeFunctie: ervaring.functie,
      gematchtDieDag: alGematchtOpDag(rijen, klus, dagStart, dagEind),
    });
  }
  return uit;
}
