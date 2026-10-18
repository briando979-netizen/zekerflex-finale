import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { resendDelivery } from "@/lib/webhooks/manage";
import type { ProposalAction } from "@/lib/ai-teams";

async function hqAdmins(tenantId: string): Promise<{ email: string; name: string }[]> {
  const rows = await prisma.membership.findMany({ where: { tenantId, role: "HQ_ADMIN" }, select: { user: { select: { email: true, fullName: true } } } });
  return rows.map((r) => ({ email: r.user.email, name: r.user.fullName }));
}

/** Executes an approved team proposal. Returns a short result line for the report. */
export async function executeProposal(action: ProposalAction): Promise<string> {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  if (action.type === "resend-webhook") {
    const r = await resendDelivery(action.deliveryId);
    return r.ok ? `opnieuw verstuurd (HTTP ${r.status})` : `nog steeds mislukt${r.status ? ` (HTTP ${r.status})` : ""}`;
  }
  const admins = await hqAdmins(action.tenantId);
  if (!admins.length) return "geen hoofdbeheerder met e-mailadres gevonden";
  for (const a of admins) {
    const first = a.name.split(" ")[0] ?? "";
    if (action.type === "timesheet-reminder") {
      await sendMail({
        to: a.email,
        subject: "Er wachten uren op je goedkeuring",
        text: `Hoi ${first},\n\nEr staan uren van een kracht al een paar dagen klaar voor goedkeuring. Keur ze goed (of pas ze aan) zodat de uitbetaling door kan:\n${base}/werkgever/uren\n\nGroet,\nTeam ZekerFlex`,
        kind: "timesheet-reminder",
      });
    } else {
      await sendMail({
        to: a.email,
        subject: "We missen je bij ZekerFlex",
        text: `Hoi ${first},\n\nHet is even stil geweest bij jullie op ZekerFlex. Wist je dat je nu staffelkorting krijgt bij meer uren, en dat je krachten snelle uitbetaling kunt aanbieden (klussen worden dan sneller ingevuld)?\n\nPlaats je volgende dienst in een minuut: ${base}/werkgever/diensten\n\nGroet,\nTeam ZekerFlex`,
        kind: "reactivation",
      });
    }
  }
  return `mail verstuurd naar ${admins.length} beheerder(s)`;
}
