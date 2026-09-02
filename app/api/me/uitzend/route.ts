import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";
import { getFiscal, setFiscal, type FiscalProfile } from "@/lib/fiscal/store";
import { isValidIban } from "@/lib/billing/sepa";

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
        iban: fiscal.iban,
        ibanValid: fiscal.ibanValid,
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
});

// PUT /api/me/uitzend — quick fiscal toggles for the uitzend panel.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const input = putSchema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));

    const patch: Partial<FiscalProfile> = {};
    if (input.loonheffingskorting !== undefined) patch.loonheffingskorting = input.loonheffingskorting;
    if (input.iban !== undefined) {
      const clean = input.iban.replace(/\s+/g, "").toUpperCase();
      patch.iban = clean;
      patch.ibanValid = isValidIban(clean);
    }
    const saved = await setFiscal(p.userId, patch);
    return NextResponse.json({
      loonheffingskorting: saved.loonheffingskorting,
      iban: saved.iban,
      ibanValid: saved.ibanValid,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
