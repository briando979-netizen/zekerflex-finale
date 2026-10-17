import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { payInvoiceFromBank } from "@/lib/bank/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ invoiceIds: z.array(z.string().min(1).max(40)).min(1).max(50) });

// GET /api/me/bank/pay-invoice — open invoices addressed to this account's owner.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    let where: { recipientTenantId: string } | { recipientFreelancerId: string } | null = null;
    if (account.tenantId) where = { recipientTenantId: account.tenantId };
    else if (account.userId) {
      const fp = await prisma.freelancerProfile.findUnique({ where: { userId: account.userId }, select: { id: true } });
      if (fp) where = { recipientFreelancerId: fp.id };
    }
    const invoices = where
      ? await prisma.invoice.findMany({
          where: { ...where, status: "ISSUED" },
          select: { id: true, number: true, totalCents: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : [];
    return NextResponse.json({ invoices });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/pay-invoice — pay open invoices straight from the ZekerFlex Bank balance.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { invoiceIds } = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan vanaf de bedrijfsrekening betalen");
    const paid: string[] = [];
    for (const invoiceId of invoiceIds) {
      await payInvoiceFromBank({ invoiceId, accountId: account.id, actorUserId: p.userId });
      paid.push(invoiceId);
    }
    return NextResponse.json({ paid });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
