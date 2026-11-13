import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { checkVies } from "@/lib/integrations/vies";
import { isValidIban } from "@/lib/billing/sepa";
import { flagIbanChanged } from "@/lib/compliance/documents";
import { bevestigIbanWijziging } from "@/lib/fiscal/iban-bevestiging";
import {
  getFiscal,
  setFiscal,
  invoiceModeFor,
  hashBsn,
  validBsn,
  fiscaalVoorKlant,
  type FiscalProfile,
} from "@/lib/fiscal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Filesystem only (storage/fiscal). No DB / Redis / auth changes.

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const f = await getFiscal(principal.userId);
    return NextResponse.json({ ...fiscaalVoorKlant(f), resolvedInvoiceMode: invoiceModeFor(f) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const NL_VAT = /^NL\d{9}B\d{2}$/i;

const schema = z.object({
  workerKind: z.enum(["zzp", "flexwerker", "uitzendkracht"]),
  vatNumber: z.string().trim().max(20).optional(),
  vatRequested: z.boolean().optional(),
  kvkNumber: z.string().trim().max(20).optional(),
  korApplies: z.boolean().optional(),
  bsn: z.string().trim().max(14).optional(),
  /** "Ja, klopt" op het BSN dat van het ID is gelezen (lib/kyc/bsn-uit-document.ts) */
  bsnVoorstelOk: z.literal(true).optional(),
  loonheffingskorting: z.boolean().optional(),
  invoiceMode: z.enum(["reverse-billing", "self-invoice", "payroll"]).optional(),
  iban: z.string().trim().min(15).max(34).optional(),
  /** Bevestigingscode bij een gewijzigd IBAN: uit de mail, of uit de verificatie-app bij 2FA. */
  ibanCode: z.string().trim().max(32).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const input = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.").metSleutel("common.verzoek");
      }),
    );

    // Eerst de huidige stand. Een sleutel die niet is meegestuurd, blijft zoals hij was (13 nov 2026): GegevensMist stuurt
    // alleen de btw-, KOR- en KVK-velden, en een oudere stand in de browser mag een nieuwere keuze (zoals de
    // loonheffingskorting) nooit stil terugzetten. FiscalForm stuurt alles expliciet mee. Ook nodig voor de BSN-check en
    // het IBAN-wijzigsignaal verderop.
    const before = await getFiscal(principal.userId);
    const vatRequested = input.vatRequested ?? before.vatRequested;
    const korApplies = input.korApplies ?? before.korApplies;

    const patch: Partial<FiscalProfile> = {
      workerKind: input.workerKind,
      ...(input.vatRequested !== undefined ? { vatRequested: input.vatRequested } : {}),
      ...(input.korApplies !== undefined ? { korApplies: input.korApplies } : {}),
      ...(input.loonheffingskorting !== undefined ? { loonheffingskorting: input.loonheffingskorting } : {}),
      ...(input.kvkNumber ? { kvkNumber: input.kvkNumber.replace(/\D/g, "") } : {}),
      ...(input.invoiceMode ? { invoiceMode: input.invoiceMode } : {}),
      ...(input.iban
        ? (() => {
            const cleanIban = input.iban.replace(/\s+/g, "").toUpperCase();
            return { iban: cleanIban, ibanValid: isValidIban(cleanIban) };
          })()
        : {}),
    };

    // Load the current profile first — needed for the VAT check (keep a valid number valid while VIES is down), the
    // BSN-reuse check and the IBAN-changed flag further down.
    const before = await getFiscal(principal.userId);

    // Btw-nummer: VIES, de officiële en gratis dienst van de EU, voor elk EU-land (zelfde als de onboarding,
    // lib/onboarding/verify.ts). Tot 13 nov ging dit via KVKBase, en viel die weg (limiet, storing), dan werd het nummer
    // "niet geldig" en viel een zzp'er bij een gewone wijziging uit de onboarding. Nu: is VIES even onbereikbaar, dan
    // blijft een eerder geldig, ongewijzigd nummer geldig; een nieuw nummer wacht op een volgende controle.
    if (input.vatNumber) {
      const clean = input.vatNumber.replace(/[\s.-]/g, "").toUpperCase();
      patch.vatNumber = clean;
      const res = await checkVies(clean);
      const nu = new Date().toISOString();
      if (res.status === "unavailable") {
        const blijftGeldig = before.vatValid && before.vatNumber === res.vatNumber;
        patch.vatValid = blijftGeldig;
        patch.vatStatus = blijftGeldig ? (before.vatStatus ?? "validated") : NL_VAT.test(clean) ? "format-ok-unvalidated" : "unvalidated";
        if (!blijftGeldig) patch.vatCheckedAt = nu;
      } else {
        patch.vatNumber = res.vatNumber;
        patch.vatValid = res.status === "valid";
        patch.vatStatus = res.status === "valid" ? "validated" : res.status;
        patch.vatCheckedAt = nu;
      }
    } else if (input.workerKind === "zzp" || (input.workerKind === "flexwerker" && !korApplies && !vatRequested)) {
      // no VAT number given where one is expected — leave invalid
      patch.vatNumber = null;
      patch.vatValid = false;
    }

    // Payroll worker → BSN (hashed only, never stored raw). Switching TO
    // uitzendkracht requires a BSN; someone who already has one on file
    // (bsnHash) may re-save other fields — or switch away and back — without
    // retyping it.
    if (input.workerKind === "uitzendkracht") {
      if (!input.bsn && input.bsnVoorstelOk && before.bsnVoorstelHash && before.bsnVoorstelLast4) {
        // het BSN van het ID, door de werker zelf bevestigd
        patch.bsnHash = before.bsnVoorstelHash;
        patch.bsnLast4 = before.bsnVoorstelLast4;
      } else if (input.bsn) {
        if (!validBsn(input.bsn)) throw AppError.validation("Dit BSN klopt niet. Controleer de 9 cijfers: je BSN staat op een Nederlands paspoort, ID-kaart of verblijfsdocument, of in de brief van de gemeente. Kom je uit het buitenland, dan staat het in de brief van het RNI-loket.").metSleutel("fiscal.bsnFout");
        const { hash, last4 } = hashBsn(input.bsn);
        patch.bsnHash = hash;
        patch.bsnLast4 = last4;
      } else if (!before.bsnHash) {
        throw AppError.validation("Voor verloning als uitzendkracht is je BSN nodig. Kom je uit het buitenland en heb je nog geen BSN? Dan vraag je het aan bij een RNI-loket van een gemeente, met je paspoort of ID-kaart.").metSleutel("fiscal.bsnNodig");
      }
      // bevestigd of zelf ingevuld: het voorstel is niet meer nodig
      if (patch.bsnHash) {
        patch.bsnVoorstelHash = null;
        patch.bsnVoorstelLast4 = null;
        patch.bsnVoorstelAt = null;
      }
    }

    // Een gewijzigd rekeningnummer vraagt een tweede bewijs (mailcode of 2FA):
    // een gekaapte sessie mag uitbetalingen niet kunnen omleiden. Een eerste
    // IBAN (onboarding) en ongewijzigd opslaan blijven vrij. Zonder bevestiging
    // wordt er niets opgeslagen: 423 met een eigen code (nooit 403: CrowdSec).
    if (patch.iban && before.iban && before.iban !== patch.iban) {
      const bevestiging = await bevestigIbanWijziging(principal.userId, patch.iban, input.ibanCode);
      if (!bevestiging.ok) {
        return NextResponse.json(
          { error: { code: bevestiging.code, message: bevestiging.message } },
          { status: bevestiging.status },
        );
      }
    }

    // A new rekeningnummer must be confirmed again (bank login / statement)
    // before payouts go to it — the old check proves nothing about it.
    const saved = await setFiscal(principal.userId, patch);
    if (patch.iban && before.iban && before.iban !== patch.iban) {
      await flagIbanChanged(principal.userId).catch(() => undefined);
    }
    return NextResponse.json({ ...fiscaalVoorKlant(saved), resolvedInvoiceMode: invoiceModeFor(saved) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
