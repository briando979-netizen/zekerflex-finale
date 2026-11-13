import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";
import { getFiscal, setFiscal, type FiscalProfile } from "@/lib/fiscal/store";
import { isValidIban } from "@/lib/billing/sepa";
import { invalidateBankDoc } from "@/lib/compliance/documents";
import { bevestigIbanWijziging } from "@/lib/fiscal/iban-bevestiging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend — ABU phase, StiPP, contract hours + fiscal toggles.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [status, fiscal] = await Promise.all([getUitzendStatus(p.userId), getFiscal(p.userId)]);
    return NextResponse.json({
      status,
      fiscal: {
        loonheffingskorting: fiscal.loonheffingskorting,
        // zonder uitdrukkelijke keuze geldt geen korting; het paneel vraagt dan om een keuze
        loonheffingskortingGekozen: fiscal.loonheffingskortingGekozen === true,
        iban: fiscal.iban,
        ibanValid: fiscal.ibanValid,
        ibanPendingVerification: fiscal.ibanPendingVerification,
        bsnLast4: fiscal.bsnLast4,
        workerKind: fiscal.workerKind,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const putSchema = z.object({
  loonheffingskorting: z.boolean().optional(),
  iban: z.string().trim().min(15).max(34).optional(),
  /** Bevestigingscode bij een gewijzigd IBAN: uit de mail, of uit de verificatie-app bij 2FA. */
  ibanCode: z.string().trim().max(32).optional(),
});

// PUT /api/me/uitzend — quick fiscal toggles for the uitzend panel.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const input = putSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }));

    const patch: Partial<FiscalProfile> = {};
    let ibanChanged = false;
    if (input.loonheffingskorting !== undefined) patch.loonheffingskorting = input.loonheffingskorting;
    // Het profiel van een zzp'er of flexwerker: daar leest de uitbetaling het IBAN (lib/timesheets/approve.ts).
    // Het IBAN staat op één plek in te vullen (Verificatie, "Bankrekening bevestigen") en komt hier
    // in beide bronnen: de fiscale gegevens en het profiel.
    let profielIban: string | null = null;
    let heeftProfiel = false;
    if (input.iban !== undefined) {
      const clean = input.iban.replace(/\s+/g, "").toUpperCase();
      const before = await getFiscal(p.userId);
      const profiel = await prisma.freelancerProfile.findUnique({ where: { userId: p.userId }, select: { payoutIban: true } });
      heeftProfiel = Boolean(profiel);
      profielIban = profiel?.payoutIban ?? null;
      // Only a CHANGE to an already-set IBAN needs re-verification — the
      // first time a worker ever sets one is not a "change". Een IBAN dat al op het
      // profiel staat (vanuit de oude onboarding) telt ook als "al ingesteld".
      const huidig = profielIban || before.iban;
      ibanChanged = Boolean(huidig) && huidig !== clean;
      // Een gewijzigd rekeningnummer vraagt een tweede bewijs (mailcode of 2FA), net
      // als in /api/me/fiscal. Zonder bevestiging wordt er niets opgeslagen: 423 met
      // een eigen code (nooit 403: CrowdSec). Een eerste IBAN blijft vrij.
      if (ibanChanged) {
        const bevestiging = await bevestigIbanWijziging(p.userId, clean, input.ibanCode);
        if (!bevestiging.ok) {
          return NextResponse.json(
            { error: { code: bevestiging.code, message: bevestiging.message } },
            { status: bevestiging.status },
          );
        }
      }
      patch.iban = clean;
      patch.ibanValid = isValidIban(clean);
      if (ibanChanged) patch.ibanPendingVerification = true;
    }
    const saved = await setFiscal(p.userId, patch);
    if (ibanChanged) await invalidateBankDoc(p.userId).catch(() => undefined);
    if (input.iban !== undefined && heeftProfiel && saved.iban && (ibanChanged || profielIban !== saved.iban)) {
      await prisma.freelancerProfile
        .update({
          where: { userId: p.userId },
          data: { payoutIban: saved.iban, ...(ibanChanged ? { payoutIbanPendingVerification: true } : {}) },
        })
        .catch(() => undefined);
    }
    return NextResponse.json({
      loonheffingskorting: saved.loonheffingskorting,
      loonheffingskortingGekozen: saved.loonheffingskortingGekozen === true,
      iban: saved.iban,
      ibanValid: saved.ibanValid,
      ibanPendingVerification: saved.ibanPendingVerification,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
