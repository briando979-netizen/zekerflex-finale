import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import {
  activeUitzendContract,
  listUitzendContracts,
  signUitzendContract,
  verouderdUitzendContract,
} from "@/lib/agreements/uitzend-contract";
import { UITZEND_NIEUW } from "@/lib/agreements/uitzend-nieuw-teksten";
import { getLocale } from "@/lib/i18n/server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend/contract — the active contract + history. `nieuw`: alleen als er nog een geldige overeenkomst in een oudere versie
// is en geen huidige (de werker moet opnieuw tekenen): de melding in zijn app-taal.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [active, history, verouderd] = await Promise.all([
      activeUitzendContract(p.userId),
      listUitzendContracts(p.userId),
      verouderdUitzendContract(p.userId),
    ]);
    const nieuw = !active && verouderd ? UITZEND_NIEUW[await getLocale()] : null;
    return NextResponse.json({ active, history, nieuw: nieuw ? { titel: nieuw.titel, tekst: nieuw.tekst } : null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/uitzend/contract — "Ondertekenen": auto-generate + sign.
export async function POST(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");

    const fiscal = await getFiscal(p.userId);
    if (invoiceModeFor(fiscal) !== "payroll") {
      throw AppError.precondition("Alleen uitzendkrachten ondertekenen een uitzendovereenkomst.");
    }

    const { contract, created } = await signUitzendContract(p.userId, p.fullName);
    if (created) {
      await recordAudit({
        category: "AGREEMENT",
        action: "uitzendcontract.signed",
        actorUserId: p.userId,
        actorLabel: "user",
        summary: `Uitzendovereenkomst ${contract.reference} elektronisch ondertekend (geldig tot ${contract.validUntil.slice(0, 10)})`,
        targetType: "uitzendContract",
        targetId: contract.id,
        metadata: { reference: contract.reference, phase: contract.phase },
      }).catch(() => undefined);
    }
    return NextResponse.json({ contract, created }, { status: created ? 201 : 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
