import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { resendDelivery } from "@/lib/webhooks/manage";
import type { ProposalAction } from "@/lib/ai-teams";
import { notifyPendingReactions, setTenantApproval } from "@/lib/company/verified";
import { commitInvestment } from "@/lib/ai-teams/invest";
import { appendMessage, getConversation } from "@/lib/chat/webchat";

async function hqAdmins(tenantId: string): Promise<{ email: string; name: string }[]> {
  const rows = await prisma.membership.findMany({ where: { tenantId, role: "HQ_ADMIN" }, select: { user: { select: { email: true, fullName: true } } } });
  return rows.map((r) => ({ email: r.user.email, name: r.user.fullName }));
}

/** Executes an approved team proposal. Returns a short result line for the report. */
export async function executeProposal(action: ProposalAction, by = "ai-team"): Promise<string> {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  if (action.type === "resend-webhook") {
    const r = await resendDelivery(action.deliveryId);
    return r.ok ? `opnieuw verstuurd (HTTP ${r.status})` : `nog steeds mislukt${r.status ? ` (HTTP ${r.status})` : ""}`;
  }
  if (action.type === "rematch-shift") {
    const { dispatchNextWave } = await import("@/lib/notifications/dispatcher");
    const n = await dispatchNextWave(action.shiftId);
    return n > 0 ? `${n} extra flexkracht(en) benaderd` : "geen nieuwe passende flexkrachten gevonden";
  }
  if (action.type === "investment") {
    return commitInvestment(action.title, action.budgetCents, action.firstStep);
  }
  if (action.type === "webchat-antwoord") {
    // de Servicedesk: het goedgekeurde concept komt als antwoord van ZekerFlex in de websitechat
    const c = await getConversation(action.conversationId);
    if (!c) return "het gesprek bestaat niet meer; niets geplaatst";
    if (c.status === "closed") return "het gesprek is gesloten; niets geplaatst";
    await appendMessage(action.conversationId, { role: "agent", content: action.tekst, by: "ZekerFlex" });
    return "antwoord in de websitechat geplaatst";
  }
  if (action.type === "info-antwoord") {
    // de Aanvragen-beantwoorder: het concept-antwoord aan een bedrijf, pas na Uitvoeren, vanaf de postbus zelf (info@)
    const aan = action.aan.trim().toLowerCase();
    if (!/^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/.test(aan)) return "geen geldig adres; niets verstuurd";
    if (/@([a-z0-9-]+\.)*zekerflex\.(com|nl)$/i.test(aan)) return "dit is een eigen adres; niets verstuurd";
    const { infoVan } = await import("@/lib/mail/info-ronde-db");
    const van = infoVan();
    const uit = await sendMail({
      to: aan,
      subject: action.onderwerp.slice(0, 200),
      text: action.tekst,
      kind: "info-antwoord",
      ...(van ? { from: van, replyTo: van } : {}),
      ...(action.inReplyTo ? { inReplyTo: action.inReplyTo } : {}),
    });
    return uit.delivered ? "antwoord verstuurd vanaf info@" : "versturen mislukt; het antwoord staat in de uitgaande post";
  }
  if (action.type === "welkom-opvolging") {
    // de Welkomstcoach: alleen als het bedrijf nog steeds geen klus heeft
    const klussen = await prisma.shift.count({ where: { branch: { tenantId: action.tenantId } } });
    if (klussen > 0) return "het bedrijf plaatste intussen een klus; niets verstuurd";
    const tenant = await prisma.tenant.findUnique({ where: { id: action.tenantId }, select: { name: true } });
    const admins = await hqAdmins(action.tenantId);
    if (!admins.length) return "geen hoofdbeheerder met e-mailadres gevonden";
    for (const a of admins) {
      const first = a.name.split(" ")[0] ?? "";
      await sendMail({
        to: a.email,
        subject: "Hulp bij je eerste klus op ZekerFlex?",
        text: `Hoi ${first},\n\nJe hebt ${tenant?.name ?? "je bedrijf"} een tijdje geleden aangemeld bij ZekerFlex, maar er staat nog geen klus. Zal ik je helpen met de eerste? Een klus zet je in een paar minuten uit via:\n${base}/werkgever/diensten\n\nLiever even overleggen? Antwoord op deze mail, dan nemen we contact met je op.\n\nGroet,\nTeam ZekerFlex`,
        kind: "onboarding-reminder",
      });
    }
    return `welkomstmail verstuurd naar ${admins.length} beheerder(s)`;
  }
  if (action.type === "approve-company") {
    await setTenantApproval(action.tenantId, true, by);
    const told = await notifyPendingReactions(action.tenantId);
    return `bedrijf goedgekeurd, ${told} freelancer(s) een melding gestuurd`;
  }
  const admins = await hqAdmins(action.tenantId);
  if (!admins.length) return "geen hoofdbeheerder met e-mailadres gevonden";
  for (const a of admins) {
    const first = a.name.split(" ")[0] ?? "";
    if (action.type === "rate-advice") {
      const shift = await prisma.shift.findUnique({ where: { id: action.shiftId }, select: { title: true, hourlyRateCents: true } });
      if (!shift) return "klus bestaat niet meer";
      const eur = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
      await sendMail({
        to: a.email,
        subject: `Tip: "${shift.title}" sneller gevuld`,
        text: `Hoi ${first},\n\nJe klus "${shift.title}" staat op ${eur(shift.hourlyRateCents)} per uur. Vergelijkbare klussen op ZekerFlex betalen meestal rond ${eur(action.suggestedCents)} per uur — daardoor reageren er minder flexkrachten op jouw klus.\n\nMet een tarief rond het marktgemiddelde is je klus doorgaans veel sneller gevuld. Je past het tarief aan via:\n${base}/werkgever/diensten/${action.shiftId}\n\nGroet,\nTeam ZekerFlex`,
        kind: "rate-advice",
      });
    } else if (action.type === "timesheet-reminder") {
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
