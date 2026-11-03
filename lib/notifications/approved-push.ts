import { prisma } from "@/lib/prisma";
import { sendUserPush } from "@/lib/notifications/push";

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

/** De tekst van het bericht; puur, zodat het te testen is. */
export function approvedPushText(r: ApprovedSummary, shiftTitle: string): { title: string; body: string } {
  const hours = (Math.round((r.billableMinutes / 60) * 100) / 100).toString().replace(".", ",");
  const next =
    r.track === "payroll"
      ? r.advance && r.advance.netCents > 0
        ? `Je voorschot van ${euro(r.advance.netCents)} is onderweg; de rest volgt met de verloning van ${r.payroll?.weekLabel ?? "deze week"}.`
        : `Je loon volgt met de verloning van ${r.payroll?.weekLabel ?? "deze week"}.`
      : r.payout && r.payout.amountCents > 0
        ? `${euro(r.payout.amountCents)} is onderweg naar je rekening.`
        : "Je uitbetaling volgt volgens de snelheid die je koos.";
  return { title: "✅ Je uren zijn goedgekeurd", body: `${shiftTitle}: ${hours} uur. ${next}` };
}

export async function pushHoursApproved(r: ApprovedSummary): Promise<void> {
  const ts = await prisma.timesheet.findUnique({
    where: { id: r.timesheetId },
    select: { freelancer: { select: { userId: true } }, assignment: { select: { shift: { select: { title: true } } } } },
  });
  if (!ts) return;
  const { title, body } = approvedPushText(r, ts.assignment?.shift.title ?? "Je klus");
  await sendUserPush([ts.freelancer.userId], {
    title,
    body,
    data: { type: "SHIFT", url: r.track === "payroll" ? "/dashboard/verloning" : "/dashboard/uitbetalingen", tag: `goedgekeurd-${r.timesheetId}` },
    ttlSeconds: 3 * 86_400,
  });
}
