import { z } from "zod";
import type { Principal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { runMatchingForShift } from "@/lib/matching-engine";

export interface ShiftTemplate {
  key: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string;
  skillName: string | null;
}

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { key: "vakkenvuller", label: "Vakkenvuller", hourlyRateCents: 1450, breakMinutes: 30, description: "Vakken vullen, schappen aanvullen en netjes houden tijdens de dienst.", skillName: null },
  { key: "kassa", label: "Kassamedewerker", hourlyRateCents: 1500, breakMinutes: 30, description: "Klanten gastvrij afrekenen en de kassa bemannen.", skillName: null },
  { key: "magazijn", label: "Magazijnmedewerker", hourlyRateCents: 1600, breakMinutes: 30, description: "Goederen ontvangen, orderpicken en het magazijn op orde houden.", skillName: null },
  { key: "schoonmaak", label: "Schoonmaakmedewerker", hourlyRateCents: 1550, breakMinutes: 15, description: "Schoonmaakronde volgens checklist: sanitair, kantines en algemene ruimtes.", skillName: null },
  { key: "horeca", label: "Bediening / horeca", hourlyRateCents: 1600, breakMinutes: 30, description: "Gasten bedienen, bestellingen opnemen en uitserveren.", skillName: null },
  { key: "receptie", label: "Receptiemedewerker", hourlyRateCents: 1700, breakMinutes: 30, description: "Bezoekers ontvangen, telefoon en post afhandelen.", skillName: null },
];

export const createShiftSchema = z.object({
  branchId: z.string().min(1).max(128),
  templateKey: z.string().max(40).optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  endsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  hourlyRateCents: z.coerce.number().int().min(500).max(20000),
  positions: z.coerce.number().int().min(1).max(50).default(1),
  /** extra calendar dates (yyyy-mm-dd) — the same time window is repeated on each */
  extraDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(30).optional(),
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

  const scopeWhere = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };
  const branch = await prisma.branch.findFirst({
    where: { AND: [{ id: input.branchId }, scopeWhere] },
    select: { id: true, name: true, matchingConfig: true },
  });
  if (!branch) throw AppError.forbidden("Je hebt geen toegang tot deze vestiging.");

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

  const created = await prisma.$transaction(
    windows.map((w) =>
      prisma.shift.create({
        data: {
          branchId: branch.id,
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          breakMinutes: input.breakMinutes,
          hourlyRateCents: input.hourlyRateCents,
          positions: input.positions,
          status: "OPEN",
        },
        select: { id: true },
      }),
    ),
  );
  const shift = created[0]!;

  await recordAudit({
    category: "MATCHING",
    action: "shift.created",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Dienst "${input.title}" uitgezet bij ${branch.name} (${input.positions}x${
      windows.length > 1 ? `, ${windows.length} dagen` : ""
    })`,
    targetType: "shift",
    targetId: shift.id,
    metadata: {
      branchId: branch.id,
      hourlyRateCents: input.hourlyRateCents,
      template: input.templateKey ?? null,
      days: windows.length,
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
