import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { getProducts, listPolicies, productsFor, requestPolicy } from "@/lib/bank/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ productId: z.string().min(1).max(40) });

// GET /api/me/bank/insurance — insurances on offer for this holder and their own policies.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account, role } = await accountForPrincipal(p);
    if (role === "platform") return NextResponse.json({ products: [], policies: [] });
    const [products, policies] = await Promise.all([getProducts(), listPolicies({ accountId: account.id })]);
    return NextResponse.json({ products: productsFor(products, role), policies });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/insurance — request a policy; ZekerFlex confirms it with the insurer.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { productId } = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Alleen de rekeninghouder kan een verzekering aanvragen");
    const policy = await requestPolicy({ accountId: account.id, holderName: account.holderName, userId: p.userId, role, productId });
    await recordAudit({
      category: "BILLING",
      action: "bank.insurance_requested",
      actorUserId: p.userId,
      summary: `Verzekering aangevraagd: ${policy.productName} (${policy.insurer})`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
