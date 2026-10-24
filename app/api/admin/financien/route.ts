import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { financeOverview } from "@/lib/admin/finance";
import { setFinanceSettings, type FinanceSettings } from "@/lib/admin/finance-settings";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function range(period: string, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getTime() + 1000);
  if (period === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
  if (period === "all") return { from: new Date(2024, 0, 1), to };
  return { from: new Date(now.getFullYear(), 0, 1), to }; // dit jaar
}

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const period = new URL(request.url).searchParams.get("period") ?? "year";
  const { from, to } = range(period);
  const overview = await financeOverview(from, to);
  return NextResponse.json({ period, overview });
});

const schema = z.object({
  stripeFeePct: z.number().optional(),
  vatInputPct: z.number().optional(),
  operationalMonthlyCents: z.number().int().optional(),
  taxReservePct: z.number().optional(),
  uitzendMarkupRate: z.number().nullable().optional(),
});

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const input = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );
  const patch: Partial<FinanceSettings> = {};
  if (input.stripeFeePct !== undefined) patch.stripeFeePct = input.stripeFeePct;
  if (input.vatInputPct !== undefined) patch.vatInputPct = input.vatInputPct;
  if (input.operationalMonthlyCents !== undefined) patch.operationalMonthlyCents = input.operationalMonthlyCents;
  if (input.taxReservePct !== undefined) patch.taxReservePct = input.taxReservePct;
  if (input.uitzendMarkupRate !== undefined) patch.uitzendMarkupRate = input.uitzendMarkupRate;
  const settings = await setFinanceSettings(patch);
  await recordAudit({
    category: "ADMIN",
    action: "finance.settings",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Financiën-tarieven bijgewerkt",
  });
  return NextResponse.json({ settings });
});
