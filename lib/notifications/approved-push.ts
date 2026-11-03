import { prisma } from "@/lib/prisma";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { WORKER_PUSH, type WorkerPushTexts } from "@/lib/i18n/worker-push";

// "✅ Je uren zijn goedgekeurd" — het moment waarop een werker op zijn geld
// wacht. Eén bericht per goedkeuring (ook bij een automatische via de autopilot),
// met wat er nu gebeurt: uitbetaling onderweg, of loon via de weekverloning.

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export interface ApprovedSummary {
  timesheetId: string;
  billableMinutes: number;
  track: "invoice" | "payroll";
  payout: { amountCents: number } | null;
  payroll: { weekLabel: string } | null;
  advance: { netCents: number } | null;
}

/** De tekst van het bericht, in de taal van `t` (standaard Nederlands); puur, zodat het te testen is. */
export function approvedPushText(r: ApprovedSummary, shiftTitle: string, t: WorkerPushTexts = WORKER_PUSH.nl): { title: string; body: string } {
  const hours = (Math.round((r.billableMinutes / 60) * 100) / 100).toString().replace(".", ",");
  const week = r.payroll?.weekLabel ?? "";
  const next =
    r.track === "payroll"
      ? r.advance && r.advance.netCents > 0
        ? t.approvedAdvance(euro(r.advance.netCents), week)
        : t.approvedPayroll(week)
      : r.payout && r.payout.amountCents > 0
        ? t.approvedPaid(euro(r.payout.amountCents))
        : t.approvedSpeed;
  return { title: t.approvedTitle, body: `${shiftTitle}: ${hours} ${t.hours}. ${next}` };
}

export async function pushHoursApproved(r: ApprovedSummary): Promise<void> {
  const ts = await prisma.timesheet.findUnique({
    where: { id: r.timesheetId },
    select: { freelancer: { select: { userId: true } }, assignment: { select: { shift: { select: { title: true } } } } },
  });
  if (!ts) return;
  const shiftTitle = ts.assignment?.shift.title ?? "ZekerFlex";
  await sendLocalizedPush([ts.freelancer.userId], (t) => ({
    ...approvedPushText(r, shiftTitle, t),
    data: { type: "SHIFT", url: r.track === "payroll" ? "/dashboard/verloning" : "/dashboard/uitbetalingen", tag: `goedgekeurd-${r.timesheetId}` },
    ttlSeconds: 3 * 86_400,
  }));
}
