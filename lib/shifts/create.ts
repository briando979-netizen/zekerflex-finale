import { z } from "zod";
import type { Principal } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { runMatchingForShift } from "@/lib/matching/engine";
import { listPools } from "@/lib/pools/store";

export interface ShiftTemplate {
  key: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string;
  skillName: string | null;
}

/** Minimum uurtarief (bruto) dat een opdrachtgever mag instellen. */
export const MIN_SHIFT_RATE_CENTS = env.MIN_SHIFT_RATE_CENTS;

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { key: "vakkenvuller", label: "Vakkenvuller", hourlyRateCents: 1620, breakMinutes: 30, description: "Vakken vullen, schappen aanvullen en netjes houden tijdens de dienst.", skillName: null },
  { key: "kassa", label: "Kassamedewerker", hourlyRateCents: 1650, breakMinutes: 30, description: "Klanten gastvrij afrekenen en de kassa bemannen.", skillName: null },
  { key: "magazijn", label: "Magazijnmedewerker", hourlyRateCents: 1700, breakMinutes: 30, description: "Goederen ontvangen, orderpicken en het magazijn op orde houden.", skillName: null },
  { key: "schoonmaak", label: "Schoonmaakmedewerker", hourlyRateCents: 1650, breakMinutes: 15, description: "Schoonmaakronde volgens checklist: sanitair, kantines en algemene ruimtes.", skillName: null },
  { key: "horeca", label: "Bediening / horeca", hourlyRateCents: 1700, breakMinutes: 30, description: "Gasten bedienen, bestellingen opnemen en uitserveren.", skillName: null },
  { key: "receptie", label: "Receptiemedewerker", hourlyRateCents: 1800, breakMinutes: 30, description: "Bezoekers ontvangen, telefoon en post afhandelen.", skillName: null },
];

/** A one-off klus-locatie (e.g. an offsite demo) instead of a saved vestiging. */
export const adHocAddressSchema = z.object({
  label: z.string().trim().min(3).max(200),
  postalCode: z.string().trim().min(4).max(12),
  city: z.string().trim().min(2).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const createShiftSchema = z
  .object({
    branchId: z.string().min(1).max(128).optional(),
    adHocAddress: adHocAddressSchema.optional(),
    templateKey: z.string().max(40).optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  dresscode: z.string().trim().max(500).optional(),
  viaUitzendbureau: z.coerce.boolean().default(false),
  startsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  endsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  hourlyRateCents: z.coerce
    .number()
    .int()
    .min(env.MIN_SHIFT_RATE_CENTS, {
      message: `Het minimum uurtarief is € ${(env.MIN_SHIFT_RATE_CENTS / 100).toFixed(2).replace(".", ",")}`,
    })
    .max(20000),
  positions: z.coerce.number().int().min(1).max(50).default(1),
  /** extra calendar dates (yyyy-mm-dd) — the same time window is repeated on each */
  extraDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(30).optional(),
  /** Privately invite this favorite pool instead of going straight to the open marketplace. */
  poolId: z.string().min(1).max(128).optional(),
  })
  .refine((v) => Boolean(v.branchId) !== Boolean(v.adHocAddress), {
    message: "Kies een vestiging óf een eenmalige locatie (niet beide, niet geen van beide).",
    path: ["branchId"],
  });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export interface CreateShiftResult {
  shiftId: string;
  matchedCandidates: number | null;
  daysCreated: number;
}

export async function createShift(
  principal: Principal,
  input: CreateShiftInput,
): Promise<CreateShiftResult> {
  const scope = await resolveEmployerScope(principal);

  let branch: { id: string; name: string; matchingConfig: unknown; tenantId: string };
  if (input.adHocAddress) {
    // One-off klus-locatie (e.g. an offsite demo): no pre-registered vestiging
    // needed. A wider default geofence than a permanent branch's 150m, since
    // staff are checking in somewhere unfamiliar.
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.forbidden("Geen organisatie gekoppeld aan je account.");
    branch = await prisma.branch.create({
      data: {
        tenantId,
        kind: "AD_HOC",
        name: `Eenmalige locatie — ${input.adHocAddress.label}`,
        addressLine: input.adHocAddress.label,
        postalCode: input.adHocAddress.postalCode,
        city: input.adHocAddress.city,
        latitude: input.adHocAddress.latitude,
        longitude: input.adHocAddress.longitude,
        geofenceRadiusMeters: 300,
      },
      select: { id: true, name: true, matchingConfig: true, tenantId: true },
    });
  } else {
    if (!input.branchId) throw AppError.validation("Kies een vestiging of een eenmalige locatie.");
    const scopeWhere = scope.branchIds
      ? { id: { in: scope.branchIds } }
      : { tenantId: { in: scope.tenantIds } };
    const found = await prisma.branch.findFirst({
      where: { AND: [{ id: input.branchId }, scopeWhere] },
      select: { id: true, name: true, matchingConfig: true, tenantId: true },
    });
    if (!found) throw AppError.forbidden("Je hebt geen toegang tot deze vestiging.");
    branch = found;
  }

  let pool: { id: string; name: string } | null = null;
  if (input.poolId) {
    const found = (await listPools(branch.tenantId)).find((p) => p.id === input.poolId);
    if (!found) throw AppError.forbidden("Deze pool bestaat niet (meer) voor jouw organisatie.");
    pool = { id: found.id, name: found.name };
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw AppError.validation("Ongeldige datum/tijd.");
  }
  if (endsAt <= startsAt) throw AppError.validation("De eindtijd moet na de starttijd liggen.");
  if (startsAt.getTime() < Date.now() - 60_000) throw AppError.validation("De starttijd ligt in het verleden.");

  // Build the full set of (start, end) windows: the primary one + any extra
  // dates, each repeating the same time-of-day and duration.
  const windows: { startsAt: Date; endsAt: Date }[] = [{ startsAt, endsAt }];
  const seenDays = new Set<string>([startsAt.toISOString().slice(0, 10)]);
  const durationMs = endsAt.getTime() - startsAt.getTime();
  for (const iso of input.extraDates ?? []) {
    if (seenDays.has(iso)) continue;
    seenDays.add(iso);
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    const ws = new Date(startsAt);
    ws.setFullYear(y, m - 1, d);
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
            viaUitzendbureau: input.viaUitzendbureau,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            breakMinutes: input.breakMinutes,
            hourlyRateCents: input.hourlyRateCents,
            positions: input.positions,
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

  return { shiftId: shift.id, matchedCandidates, daysCreated: created.length };
}
