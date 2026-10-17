import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { setFees } from "@/lib/bank/fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cents = z.number().int().min(0).max(100_000);
const schema = z.object({
  monthlyPersonalCents: cents,
  monthlyOrganisationCents: cents,
  cardVirtualCents: cents,
  cardPhysicalCents: cents,
});

// PUT /api/admin/bank/fees — what an account costs per month and a card once.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const fees = await setFees(schema.parse(await request.json().catch(() => ({}))));
  await recordAudit({
    category: "ADMIN",
    action: "bank.fees_changed",
    actorUserId: principal.userId,
    summary: `Bankkosten: persoonlijk ${fees.monthlyPersonalCents}c/mnd, bedrijf ${fees.monthlyOrganisationCents}c/mnd, pas ${fees.cardVirtualCents}/${fees.cardPhysicalCents}c`,
    targetType: "bank-fees",
    targetId: "bank-fees",
  });
  return NextResponse.json({ fees });
});
