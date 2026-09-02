import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { validateVat } from "@/lib/integrations/kvkbase";
import { isValidIban } from "@/lib/billing/sepa";
import {
  getFiscal,
  setFiscal,
  invoiceModeFor,
  hashBsn,
  validBsn,
  type FiscalProfile,
} from "@/lib/fiscal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Filesystem only (storage/fiscal). No DB / Redis / auth changes.

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const f = await getFiscal(principal.userId);
    return NextResponse.json({ ...f, resolvedInvoiceMode: invoiceModeFor(f) });
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
  loonheffingskorting: z.boolean().optional(),
  invoiceMode: z.enum(["reverse-billing", "self-invoice", "payroll"]).optional(),
  iban: z.string().trim().min(15).max(34).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const input = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    const patch: Partial<FiscalProfile> = {
      workerKind: input.workerKind,
      vatRequested: input.vatRequested ?? false,
      korApplies: input.korApplies ?? false,
      loonheffingskorting: input.loonheffingskorting ?? true,
      ...(input.kvkNumber ? { kvkNumber: input.kvkNumber.replace(/\D/g, "") } : {}),
      ...(input.invoiceMode ? { invoiceMode: input.invoiceMode } : {}),
      ...(input.iban
        ? (() => {
            const cleanIban = input.iban.replace(/\s+/g, "").toUpperCase();
            return { iban: cleanIban, ibanValid: isValidIban(cleanIban) };
          })()
        : {}),
    };

    // BTW validation (VIES-backed, via KVKBase). Best-effort.
    if (input.vatNumber) {
      const clean = input.vatNumber.replace(/[\s.-]/g, "").toUpperCase();
      patch.vatNumber = clean;
      const looksNl = NL_VAT.test(clean);
      try {
        const res = await validateVat(clean);
        patch.vatValid = res.valid;
        patch.vatStatus = res.status ?? (res.valid ? "validated" : "unvalidated");
        patch.vatCheckedAt = new Date().toISOString();
      } catch (err) {
        logger.warn("vat validation unavailable", { error: (err as Error).message });
        patch.vatValid = false;
        patch.vatStatus = looksNl ? "format-ok-unvalidated" : "unvalidated";
        patch.vatCheckedAt = new Date().toISOString();
      }
    } else if (input.workerKind === "zzp" || (input.workerKind === "flexwerker" && !input.korApplies && !input.vatRequested)) {
      // no VAT number given where one is expected — leave invalid
      patch.vatNumber = null;
      patch.vatValid = false;
    }

    // Payroll worker → BSN (hashed only, never stored raw).
    if (input.workerKind === "uitzendkracht") {
      if (!input.bsn) throw AppError.validation("Voor verloning als uitzendkracht is je BSN nodig.");
      if (!validBsn(input.bsn)) throw AppError.validation("Dit BSN klopt niet (elfproef mislukt).");
      const { hash, last4 } = hashBsn(input.bsn);
      patch.bsnHash = hash;
      patch.bsnLast4 = last4;
    }

    const saved = await setFiscal(principal.userId, patch);
    return NextResponse.json({ ...saved, resolvedInvoiceMode: invoiceModeFor(saved) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
