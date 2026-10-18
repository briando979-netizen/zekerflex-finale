import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { exportPendingWithdrawals, markWithdrawalPaid, reverseWithdrawal } from "@/lib/bank/withdrawals";
import { kvGet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bank/withdrawals — download every pending withdrawal as one SEPA batch (pain.001),
// or ?batch=<date> — the batch the daily job already prepared (link in the finance mail).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const prepared = new URL(req.url).searchParams.get("batch");
  if (prepared) {
    if (!/^[\w-]{10,40}$/.test(prepared)) throw AppError.validation("Ongeldige batch");
    const b = await kvGet<{ xml: string }>(`bank-sepa-batch:${prepared}`);
    if (!b) throw AppError.notFound("Batch niet gevonden");
    return new NextResponse(b.xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="zekerflex-bank-opnames-${prepared}.xml"` },
    });
  }
  const { xml, count, totalCents, skipped } = await exportPendingWithdrawals();
  await recordAudit({
    category: "BILLING",
    action: "bank.withdrawals_exported",
    actorUserId: principal.userId,
    summary: `${count} opnames (${(totalCents / 100).toFixed(2)} EUR) als SEPA-batch geëxporteerd${skipped.length ? `, ${skipped.length} overgeslagen` : ""}`,
    targetType: "bank-withdrawals",
    targetId: "batch",
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="zekerflex-bank-opnames-${new Date().toISOString().slice(0, 10)}.xml"`,
      "X-Skipped": encodeURIComponent(skipped.join(" | ")).slice(0, 1000),
    },
  });
});

const schema = z.object({
  id: z.string().min(1).max(40),
  action: z.enum(["paid", "reverse"]),
  reason: z.string().trim().max(200).optional(),
});

// POST /api/admin/bank/withdrawals — mark one paid (after the bank processed the batch) or book it back.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const w = input.action === "paid" ? await markWithdrawalPaid(input.id) : await reverseWithdrawal(input.id, input.reason || "afgewezen door beheer");
  await recordAudit({
    category: "BILLING",
    action: input.action === "paid" ? "bank.withdrawal_paid" : "bank.withdrawal_reversed",
    actorUserId: principal.userId,
    summary: `Opname ${(w.amountCents / 100).toFixed(2)} EUR van ${w.holderName}: ${input.action === "paid" ? "uitbetaald" : `teruggeboekt (${w.reason})`}`,
    targetType: "bank-withdrawal",
    targetId: w.id,
  });
  return NextResponse.json({ withdrawal: w });
});
