import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import {
  activeUitzendContract,
  listUitzendContracts,
  signUitzendContract,
} from "@/lib/agreements/uitzend-contract";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/uitzend/contract — the active contract + history.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [active, history] = await Promise.all([
      activeUitzendContract(p.userId),
      listUitzendContracts(p.userId),
    ]);
    return NextResponse.json({ active, history });
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
