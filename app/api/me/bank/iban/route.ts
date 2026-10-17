import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { isValidIban } from "@/lib/billing/sepa";
import { accountForPrincipal } from "@/lib/bank/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ iban: z.string().trim().max(40), name: z.string().trim().min(2).max(70) });

// PUT /api/me/bank/iban — the own bank account withdrawals go to.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => ({})));
    const iban = input.iban.replace(/\s+/g, "").toUpperCase();
    if (!isValidIban(iban)) throw AppError.validation("Dit IBAN klopt niet — controleer het nummer");
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan het uitbetaal-IBAN wijzigen");
    await prisma.bankAccount.update({ where: { id: account.id }, data: { payoutIban: iban, payoutName: input.name } });
    await recordAudit({
      category: "SECURITY",
      action: "bank.payout_iban_changed",
      actorUserId: p.userId,
      summary: `Uitbetaal-IBAN gewijzigd naar …${iban.slice(-4)}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ ok: true, payoutIban: iban, payoutName: input.name });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
