import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { setPayoutDestination } from "@/lib/bank/earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ destination: z.enum(["iban", "bank"]) });

// PUT /api/me/bank/payout-destination — receive approved hours on the own IBAN or on ZekerFlex Bank.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { destination } = schema.parse(await request.json().catch(() => ({})));
    const { role } = await accountForPrincipal(p);
    if (role !== "personal") throw AppError.forbidden("Alleen voor persoonlijke rekeningen");
    await setPayoutDestination(p.userId, destination);
    await recordAudit({
      category: "BILLING",
      action: "bank.payout_destination",
      actorUserId: p.userId,
      summary: destination === "bank" ? "Verdiensten voortaan op ZekerFlex Bank" : "Verdiensten voortaan op eigen IBAN",
      targetType: "user",
      targetId: p.userId,
    });
    return NextResponse.json({ destination });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
