import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { getSavingsRates, setSavingsRates } from "@/lib/bank/pots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// { "1": 150, "3": 200 } — term in years → interest in basis points per year (0–10%).
const schema = z.object({ rates: z.record(z.string().regex(/^([1-9]|[12][0-9]|30)$/), z.number().int().min(0).max(1000)) });

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ rates: await getSavingsRates() }));

// PUT /api/admin/bank/rates — savings terms and rates for new deposits (running ones keep their rate).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { rates } = schema.parse(await request.json().catch(() => ({})));
  const saved = await setSavingsRates(rates);
  await recordAudit({
    category: "ADMIN",
    action: "bank.savings_rates",
    actorUserId: principal.userId,
    summary: `Spaarrentes: ${Object.entries(saved).map(([y, b]) => `${y}j ${(b / 100).toFixed(2)}%`).join(", ")}`,
    targetType: "bank-rates",
    targetId: "bank-savings-rates",
  });
  return NextResponse.json({ rates: saved });
});
