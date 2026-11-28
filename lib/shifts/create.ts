import { meldEersteKlusVanNieuwBedrijf } from "@/lib/company/eerste-klus";
import { z } from "zod";
import type { Principal } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { runMatchingForShift } from "@/lib/matching/engine";
import { notifyFollowersOfShifts } from "@/lib/worker/follows";
import { notifyJobAlerts } from "@/lib/matching/job-alerts";
import { isUrgent, notifyStandby } from "@/lib/matching/standby";
import { listPools } from "@/lib/pools/store";
import { dedupePlaceParts } from "@/lib/shifts/place-label";
import { amsterdamDayKey, amsterdamParts, amsterdamToUtc, parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { shiftLengthProblem } from "@/lib/shifts/shift-length";
import { ANNULEER_TERMIJNEN, isAnnuleerTermijn, STANDAARD_ANNULEER_UREN } from "@/lib/shifts/annuleertermijn";
import { zetKlusAutoAccept } from "@/lib/shifts/auto-accept";
import { isUitzendPartnerTenant } from "@/lib/uitzend/partners";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";
import { isBelgischeKlus, type BelgischContract } from "@/lib/belgie/klus-kern";
import { BELGIE_ONDERGRENS_CENTS, belgischLoonOordeel } from "@/lib/belgie/lonen";
import { zetBelgieKeuzeBijPlaatsen } from "@/lib/belgie/klus";

// The fixed klus-templates live in a pure module (lib/shifts/catalogus.ts) so the
// browser forms can read them too; re-exported here for the existing imports.
export { SHIFT_TEMPLATES, type ShiftTemplate } from "@/lib/shifts/catalogus";

/** Minimum uurtarief (bruto) dat een opdrachtgever mag instellen. */
export const MIN_SHIFT_RATE_CENTS = env.MIN_SHIFT_RATE_CENTS;

/** A one-off klus-locatie (e.g. an offsite demo) instead of a saved vestiging. */
export const adHocAddressSchema = z.object({
  label: z.string().trim().min(3).max(200),
  postalCode: z.string().trim().min(4).max(12),
  city: z.string().trim().min(2).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const minimumTekst = (cents: number) => `Het minimum uurtarief is € ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Het schema van een nieuwe klus, met de ondergrens van het uurtarief als enige knop. Nederland: MIN_SHIFT_RATE_CENTS, zoals
 * altijd (createShiftSchema). Een werklocatie in België (28 nov 2026): de Nederlandse ondergrens geldt daar niet, dus
 * createShiftSchemaBelgie met de laagste Belgische grens (lib/belgie/lonen.ts); createShift kijkt daarna naar de soort contract.
 */
function maakCreateShiftSchema(minRateCents: number) {
  return z
  .object({
    branchId: z.string().min(1).max(128).optional(),
    adHocAddress: adHocAddressSchema.optional(),
    templateKey: z.string().max(40).optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  dresscode: z.string().trim().max(500).optional(),
  extraInfo: z.string().trim().max(1000).optional(),
  viaUitzendbureau: z.coerce.boolean().default(false),
  startsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  endsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  hourlyRateCents: z.coerce
    .number()
    .int()
    .min(minRateCents, {
      message: minimumTekst(minRateCents),
    })
    .max(20000),
  positions: z.coerce.number().int().min(1).max(50).default(1),
  /** annuleringstermijn in uren vóór aanvang (lib/shifts/annuleertermijn.ts); zonder keuze de standaard */
  annuleerUren: z.coerce
    .number()
    .int()
    .refine(isAnnuleerTermijn, { message: `Kies een annuleringstermijn van ${ANNULEER_TERMIJNEN.join(", ")} uur.` })
    .default(STANDAARD_ANNULEER_UREN),
  /** extra calendar dates (yyyy-mm-dd) — the same time window is repeated on each */
  extraDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(30).optional(),
  /** Privately invite this favorite pool instead of going straight to the open marketplace. */
  poolId: z.string().min(1).max(128).optional(),
  /** favorieten die reageren tegen het geplaatste tarief staan meteen ingepland (lib/shifts/auto-accept.ts) */
  autoAcceptFavorieten: z.coerce.boolean().default(false),
  /** kostenplaats / PO-nummer voor de boekhouding (een van OrgProfileExtra.costCentres) */
  kostenplaats: z.string().trim().max(60).optional(),
  /** vrije vaardigheidstags — max 10, elk max 60 tekens */
  vaardigheden: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  })
  .refine((v) => Boolean(v.branchId) !== Boolean(v.adHocAddress), {
    message: "Kies een vestiging óf een eenmalige locatie (niet beide, niet geen van beide).",
    path: ["branchId"],
  });
}

export const createShiftSchema = maakCreateShiftSchema(env.MIN_SHIFT_RATE_CENTS);
/** Alleen voor een klus op een Belgische werklocatie (app/werkgever/diensten/nieuw/actions.ts kiest het juiste schema). */
export const createShiftSchemaBelgie = maakCreateShiftSchema(BELGIE_ONDERGRENS_CENTS);
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

/** De keuze van het bedrijf bij een klus in België (components/werkgever/BelgieKlusKeuze.tsx). */
export interface BelgieKlusInvoer {
  soort: BelgischContract;
  horeca: boolean;
}

export interface CreateShiftResult {
  shiftId: string;
  matchedCandidates: number | null;
  daysCreated: number;
}

export async function createShift(
  principal: Principal,
  input: CreateShiftInput,
  /** alleen bij een klus in België: het soort contract; zonder (een andere weg dan het klusformulier) kiest het bedrijf het later op de kluspagina */
  belgie?: BelgieKlusInvoer | null,
): Promise<CreateShiftResult> {
  const scope = await resolveEmployerScope(principal);

  let branch: { id: string; name: string; matchingConfig: unknown; tenantId: string; postalCode: string };
  if (input.adHocAddress) {
    // One-off klus-locatie (e.g. an offsite demo): no pre-registered vestiging
    // needed. A wider default geofence than a permanent branch's 150m, since
    // staff are checking in somewhere unfamiliar.
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.forbidden("Geen organisatie gekoppeld aan je account.");
    // plaatsen is vrij voor elk bedrijf (23 nov 2026): de controle komt pas bij het inplannen (lib/company/gecontroleerd.ts)
    branch = await prisma.branch.create({
      data: {
        tenantId,
        kind: "AD_HOC",
        name: `Eenmalige locatie — ${dedupePlaceParts(input.adHocAddress.label)}`,
        addressLine: dedupePlaceParts(input.adHocAddress.label),
        postalCode: input.adHocAddress.postalCode,
        city: input.adHocAddress.city,
        latitude: input.adHocAddress.latitude,
        longitude: input.adHocAddress.longitude,
        geofenceRadiusMeters: 300,
      },
      select: { id: true, name: true, matchingConfig: true, tenantId: true, postalCode: true },
    });
  } else {
    if (!input.branchId) throw AppError.validation("Kies een vestiging of een eenmalige locatie.");
    const scopeWhere = scope.branchIds
      ? { id: { in: scope.branchIds } }
      : { tenantId: { in: scope.tenantIds } };
    const found = await prisma.branch.findFirst({
      where: { AND: [{ id: input.branchId }, scopeWhere] },
      select: { id: true, name: true, matchingConfig: true, tenantId: true, postalCode: true },
    });
    if (!found) throw AppError.forbidden("Je hebt geen toegang tot deze vestiging.");
    branch = found;
  }

  // Een uitzendpartner (lib/uitzend/partners-kern.ts) plaatst altijd uitzendklussen: het bureau is de werkgever. Een gewoon
  // bedrijf niet meer: ZekerFlex is zelf geen uitzender (lib/uitzend/model.ts); uitzendkrachten lopen via een bureau.
  const viaUitzendbureau = (await isUitzendPartnerTenant(branch.tenantId)) || (ZEKERFLEX_UITZENDER && input.viaUitzendbureau);

  let pool: { id: string; name: string } | null = null;
  if (input.poolId) {
    const found = (await listPools(branch.tenantId)).find((p) => p.id === input.poolId);
    if (!found) throw AppError.forbidden("Deze pool bestaat niet (meer) voor jouw organisatie.");
    pool = { id: found.id, name: found.name };
  }

  // The form sends datetime-local values ("2026-11-05T09:00"): Dutch time, while the server runs in UTC.
  const startsAt = parseAmsterdamLocal(input.startsAt);
  const endsAt = parseAmsterdamLocal(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw AppError.validation("Ongeldige datum/tijd.");
  }
  if (endsAt <= startsAt) throw AppError.validation("De eindtijd moet na de starttijd liggen.");
  const lengthProblem = shiftLengthProblem({ startsAt, endsAt, breakMinutes: input.breakMinutes, viaUitzendbureau });
  if (lengthProblem) throw AppError.validation(lengthProblem);
  if (startsAt.getTime() < Date.now() - 60_000) throw AppError.validation("De starttijd ligt in het verleden.");

  // Een werklocatie in België (lib/belgie/klus-kern.ts): het uurloon volgt de Belgische regels (lib/belgie/lonen.ts), met de
  // soort contract die het bedrijf koos. Elders blijft het Nederlandse minimum gelden, ook als iemand het Belgische schema stuurde.
  const belgisch = isBelgischeKlus(branch.postalCode);
  const belgieKeuze = belgisch && belgie ? belgie : null;
  if (!belgisch && input.hourlyRateCents < env.MIN_SHIFT_RATE_CENTS) throw AppError.validation(minimumTekst(env.MIN_SHIFT_RATE_CENTS));
  if (belgisch) {
    const oordeel = belgischLoonOordeel({
      soort: belgieKeuze?.soort ?? null,
      horeca: belgieKeuze?.horeca ?? false,
      uurloonCents: input.hourlyRateCents,
      dag: amsterdamDayKey(startsAt),
    });
    if (oordeel.blokkade) throw AppError.validation(minimumTekst(oordeel.minimumCents));
  }

  // Build the full set of (start, end) windows: the primary one + any extra
  // dates, each repeating the same Dutch time-of-day (also across a DST switch)
  // and duration.
  const windows: { startsAt: Date; endsAt: Date }[] = [{ startsAt, endsAt }];
  const seenDays = new Set<string>([amsterdamDayKey(startsAt)]);
  const durationMs = endsAt.getTime() - startsAt.getTime();
  const at = amsterdamParts(startsAt);
  for (const iso of input.extraDates ?? []) {
    if (seenDays.has(iso)) continue;
    seenDays.add(iso);
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    const ws = amsterdamToUtc(y, m, d, at.hour, at.minute);
    if (ws.getTime() < Date.now() - 60_000) continue;
    windows.push({ startsAt: ws, endsAt: new Date(ws.getTime() + durationMs) });
  }
  windows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const w of windows) {
      rows.push(
        await tx.shift.create({
          data: {
            branchId: branch.id,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.dresscode ? { dresscode: input.dresscode } : {}),
            ...(input.extraInfo ? { extraInfo: input.extraInfo } : {}),
            viaUitzendbureau,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            breakMinutes: input.breakMinutes,
            hourlyRateCents: input.hourlyRateCents,
            positions: input.positions,
            annuleerUren: input.annuleerUren,
            ...(input.kostenplaats ? { kostenplaats: input.kostenplaats } : {}),
            ...((input.vaardigheden ?? []).length > 0 ? { vaardigheden: input.vaardigheden } : {}),
            status: "OPEN",
            visibility: pool ? "POOL_ONLY" : "PUBLIC",
          },
          select: { id: true },
        }),
      );
    }
    if (pool) {
      await tx.shiftPoolInvite.createMany({
        data: rows.map((r) => ({ shiftId: r.id, poolId: pool!.id })),
      });
    }
    return rows;
  });
  const shift = created[0]!;

  // de soort contract van een klus in België, per dag (lib/belgie/klus.ts); een storing kost de klus niet: dan kiest het bedrijf
  // de soort opnieuw op de kluspagina
  if (belgieKeuze) {
    await zetBelgieKeuzeBijPlaatsen(created.map((c) => c.id), belgieKeuze).catch((err) =>
      logger.warn("belgie: soort contract bewaren na plaatsen mislukt", { shiftId: shift.id, error: (err as Error).message }),
    );
  }

  if (input.autoAcceptFavorieten) {
    for (const c of created) await zetKlusAutoAccept(c.id, true).catch(() => undefined);
  }

  await recordAudit({
    category: "MATCHING",
    action: "shift.created",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Dienst "${input.title}" uitgezet bij ${branch.name} (${input.positions}x${
      windows.length > 1 ? `, ${windows.length} dagen` : ""
    })${pool ? ` — privé uitgenodigd: pool "${pool.name}"` : ""}`,
    targetType: "shift",
    targetId: shift.id,
    metadata: {
      branchId: branch.id,
      hourlyRateCents: input.hourlyRateCents,
      template: input.templateKey ?? null,
      days: windows.length,
      poolId: pool?.id ?? null,
    },
  });
  // een bedrijf dat nog niet is gecontroleerd staat nu live: Beheer ziet het (melding bij de eerste klus, nooit een fout hier)
  await meldEersteKlusVanNieuwBedrijf(branch.tenantId, input.title, created.length);

  let matchedCandidates: number | null = null;
  for (const c of created) {
    try {
      const result = await runMatchingForShift(c.id);
      if (c.id === shift.id) {
        matchedCandidates =
          (result as { rankedCount?: number; candidates?: unknown[] }).rankedCount ??
          (Array.isArray((result as { candidates?: unknown[] }).candidates)
            ? (result as { candidates: unknown[] }).candidates.length
            : null);
      }
    } catch (err) {
      logger.warn("matching kickoff after shift create failed (non-fatal)", {
        shiftId: c.id,
        error: (err as Error).message,
      });
    }
  }

  // Volgers van dit bedrijf krijgen een seintje (alleen bij een openbare dienst).
  if (!pool) {
    await notifyFollowersOfShifts(created.map((c) => c.id)).catch((err) =>
      logger.warn("follower notify after shift create failed (non-fatal)", { shiftId: shift.id, error: (err as Error).message }),
    );
    // Werkers met een passende job-alert (lib/matching/job-alerts) ook.
    await notifyJobAlerts(created.map((c) => c.id)).catch((err) =>
      logger.warn("job alert notify after shift create failed (non-fatal)", { shiftId: shift.id, error: (err as Error).message }),
    );
    // Begint binnen 24 uur: werkers op standby horen het meteen (lib/matching/standby).
    for (const c of created.filter((_, i) => { const w = windows[i]; return w ? isUrgent(w.startsAt) : false; })) {
      await notifyStandby(c.id).catch((err) =>
        logger.warn("standby notify after shift create failed (non-fatal)", { shiftId: c.id, error: (err as Error).message }),
      );
    }
  }

  return { shiftId: shift.id, matchedCandidates, daysCreated: created.length };
}
