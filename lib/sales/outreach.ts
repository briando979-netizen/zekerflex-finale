import type { SalesLead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import {
  NA_GESPREK_SYSTEM,
  OUTREACH_STEP_SYSTEM,
  OUTREACH_SYSTEM,
  zekerflexPitch,
} from "@/lib/sales/prompts";
import { beschikbareWerkers } from "@/lib/marketing/beschikbare-werkers";
import type { BelUitkomst } from "@/lib/sales/bellijst";
import { zonderIntroContacten } from "@/lib/introducties/lead";
import { CAMPAGNE_TEKST_MODEL, invullingVoor, maakCampagneMail, type CampagneTekst } from "@/lib/sales/campagne-tekst";
import { leesCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";

// ---------------------------------------------------------------------------
// LLM-drafted outreach. A draft is generated on demand. In REVIEW mode a human
// reviews / edits / approves it and the recruiter motor (or the human) sends
// it via lib/sales/send.ts. In AUTOPILOT mode the engine approves + sends
// automatically within the campaign's hard caps.
// ---------------------------------------------------------------------------

interface DraftShape {
  subject: string;
  body: string;
}

/** Een concept dat nog op een mens of op de verzending wacht: daar komt geen tweede naast (de motor en de knop delen dit). */
export const OPEN_CONCEPT = ["DRAFT", "SCHEDULED", "APPROVED"] as const;

/**
 * Hand-written fallback per sequence step, personalised with what we know.
 * Used when the model is unreachable or returns nothing usable, so the
 * recruiter motor keeps running instead of stalling on every lead.
 */
export function templateDraft(
  lead: { companyName: string; contactName: string | null; city: string | null; sector: string | null; vacancySignal: string | null },
  step: number,
): DraftShape {
  const hi = lead.contactName ? `Beste ${lead.contactName.split(" ")[0]},` : `Beste team van ${lead.companyName},`;
  const where = lead.city ? ` in ${lead.city}` : "";
  const sector = lead.sector ? ` in de ${lead.sector.toLowerCase()}` : "";
  const hook = lead.vacancySignal
    ? `Ik zag dat jullie op zoek zijn naar mensen (${lead.vacancySignal.slice(0, 120)}).`
    : `Veel bedrijven${sector}${where} hebben moeite om pieken en uitval op te vangen.`;
  const sign = "\n\nMet vriendelijke groet,\nTeam ZekerFlex\nzekerflex.com";
  if (step === 1) {
    return {
      subject: `Nog even over flexibele krachten voor ${lead.companyName}`,
      body: `${hi}\n\nVorige week stuurde ik je een bericht over ZekerFlex. Misschien is het ondergesneeuwd, dus kort: je plaatst een dienst en passende zzp'ers en uitzendkrachten uit de buurt kunnen reageren — zonder inschrijfkosten, je betaalt alleen per gewerkt uur.\n\nZal ik je een proefaccount klaarzetten? Dan kun je deze week nog je eerste dienst plaatsen.${sign}`,
    };
  }
  if (step >= 2) {
    return {
      subject: `Zal ik ${lead.companyName} van de lijst halen?`,
      body: `${hi}\n\nIk wil je niet blijven mailen als het nu niet speelt. Als jullie later toch snel mensen nodig hebben, staat ZekerFlex klaar: diensten plaatsen is gratis en je betaalt alleen voor gewerkte uren.\n\nLaat het gerust weten als ik je mag helpen — anders hoor je niets meer van me.${sign}`,
    };
  }
  return {
    subject: `Snel personeel voor ${lead.companyName}${where}`,
    body: `${hi}\n\n${hook}\n\nMet ZekerFlex plaats je een dienst en kunnen passende zzp'ers en uitzendkrachten uit de buurt reageren als ze beschikbaar zijn. Contracten, uren en facturen regelen we automatisch, en je betaalt alleen per gewerkt uur — geen abonnement, geen inschrijfkosten.\n\nZin om het te proberen? Ik zet graag een gratis account voor je klaar.${sign}`,
  };
}

/**
 * Generate a draft for a given sequence step (0 = intro, 1 = reminder,
 * 2 = breakup). Falls back to the generic prompt for out-of-range steps.
 */
export async function draftOutreach(
  leadId: string,
  actorUserId: string | null,
  stepIndex = 0,
  /** de motor las de vaste tekst van de campagne al (één keer per tick) en geeft hem mee; null = de campagne heeft er geen */
  opties: { campagneTekst?: CampagneTekst | null } = {},
) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden.");

  // Nooit een tweede open concept voor dezelfde lead (18 nov 2026): in REVIEW maakte elke tick een nieuw vervolgconcept
  // zolang het vorige nog op een mens wachtte. Staat er al een klaar, dan is dát het concept (ook voor de knop in de pijplijn).
  const open = await prisma.salesOutreach.findFirst({
    where: { leadId, status: { in: [...OPEN_CONCEPT] } },
    orderBy: { createdAt: "desc" },
  });
  if (open) return open;

  const step = Math.max(0, Math.min(OUTREACH_STEP_SYSTEM.length - 1, stepIndex));
  const system = OUTREACH_STEP_SYSTEM[step] ?? OUTREACH_SYSTEM;

  // Een campagne met een vaste tekst (lib/sales/campagne-tekst.ts): geen model, de tekst van de eigenaar met de naam van
  // het bedrijf erin. Het is één aanbodmail: een herinnering of afscheidsmail komt er niet achteraan.
  const vast =
    opties.campagneTekst !== undefined ? opties.campagneTekst : lead.campaignId ? await leesCampagneTekst(lead.campaignId) : null;
  if (vast) {
    if (step >= 1) throw AppError.precondition("Deze campagne heeft één vaste mail; er komt geen vervolgmail.");
    return bewaarConcept(lead, actorUserId, step, maakCampagneMail(vast, invullingVoor(lead)), CAMPAGNE_TEKST_MODEL);
  }

  // zonder de contacten van een introductie (lib/introducties/lead.ts): een voorgestelde persoon komt nooit in een automatische mail
  const enrichment = zonderIntroContacten(lead.enrichmentJson);
  let model = "self-hosted-llm";
  const draft = await chatJson<DraftShape>({
    messages: [
      { role: "system", content: `${system}\n\nContext over ZekerFlex:\n${zekerflexPitch(await beschikbareWerkers().catch(() => null))}` },
      {
        role: "user",
        content: JSON.stringify({
          companyName: lead.companyName,
          contactName: lead.contactName,
          city: lead.city,
          sector: lead.sector,
          vacancySignal: lead.vacancySignal,
          stepIndex: step,
          enrichment,
        }),
      },
    ],
    temperature: 0.4,
    maxTokens: 500,
    purpose: "sales-outreach",
    retry: false,
  }).catch((err) => {
    logger.warn("outreach draft fell back to template", { leadId, error: (err as Error).message });
    model = "template";
    return templateDraft(lead, step);
  });

  let subject = String(draft.subject ?? "").trim().slice(0, 200);
  let body = String(draft.body ?? "").trim().slice(0, 4000);
  if (!subject || !body) {
    ({ subject, body } = templateDraft(lead, step));
    model = "template";
  }

  return bewaarConcept(lead, actorUserId, step, { subject, body }, model);
}

/** Het concept vastleggen: de rij, de status van de lead en het auditspoor (voor het model, het sjabloon en de vaste tekst hetzelfde). */
async function bewaarConcept(
  lead: Pick<SalesLead, "id" | "companyName" | "status">,
  actorUserId: string | null,
  step: number,
  mail: DraftShape,
  model: string,
) {
  const [outreach] = await prisma.$transaction([
    prisma.salesOutreach.create({
      data: {
        leadId: lead.id,
        subject: mail.subject,
        body: mail.body,
        stepIndex: step,
        status: "DRAFT",
        generatedByModel: model,
      },
    }),
    prisma.salesLead.update({
      where: { id: lead.id },
      data: {
        status: ["SENT", "REPLIED", "WON"].includes(lead.status) ? lead.status : "DRAFTED",
      },
    }),
  ]);

  await recordAudit({
    category: "SALES",
    action: "sales.outreach.drafted",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Concept-outreach (stap ${step + 1}) gegenereerd voor ${lead.companyName}`,
    targetType: "salesOutreach",
    targetId: outreach.id,
  });
  return outreach;
}

/**
 * Hand-written fallback voor de vervolgmail ná een telefoontje (interesse of terugbellen),
 * gebruikt als het model onbereikbaar is of niets bruikbaars teruggeeft. Belooft niets wat
 * nu niet kan en noemt geen manier van betalen (die staat nog niet open).
 */
export function templateNaGesprek(
  lead: { companyName: string; contactName: string | null },
  uitkomst: BelUitkomst,
): DraftShape {
  const hi = lead.contactName ? `Beste ${lead.contactName.split(" ")[0]},` : `Beste team van ${lead.companyName},`;
  const sign = "\n\nMet vriendelijke groet,\nTeam ZekerFlex\nzekerflex.com";
  if (uitkomst === "terugbellen") {
    return {
      subject: `Ik bel je terug over ZekerFlex`,
      body: `${hi}\n\nFijn dat ik je net even sprak. Zoals afgesproken bel ik je op een beter moment terug. Heb je er alvast vragen over, mail ze gerust, dan beantwoord ik ze meteen.\n\nKort ter herinnering: met ZekerFlex plaats je een dienst en kunnen passende zzp'ers en uitzendkrachten uit de buurt reageren. Je betaalt alleen voor gewerkte uren.${sign}`,
    };
  }
  return {
    subject: `Fijn dat we elkaar spraken, ZekerFlex voor ${lead.companyName}`,
    body: `${hi}\n\nFijn dat we elkaar net aan de telefoon spraken en dat ZekerFlex je aansprak. Kort ter herinnering: je plaatst een dienst en passende zzp'ers en uitzendkrachten uit de buurt kunnen reageren. Uren keur je goed in ZekerFlex en de factuur volgt vanzelf; je betaalt alleen voor gewerkte uren.\n\nZal ik een gratis proefaccount voor je klaarzetten, dan kun je je eerste dienst plaatsen?${sign}`,
  };
}

/**
 * Vervolgmail ná een telefoontje uit de bellijst (uitkomst "interesse" of "terugbellen"):
 * één kort concept (REVIEW) via het eigen/gratis model, met het sjabloon als terugval. Verandert
 * de status van de lead niet (dat doet de bel-uitkomst zelf) en maakt geen tweede concept als er al
 * een open concept klaarstaat. Geeft het concept terug, of null als er al een klaarstond.
 */
export async function draftNaGesprek(
  leadId: string,
  actorUserId: string | null,
  uitkomst: Extract<BelUitkomst, "interesse" | "terugbellen">,
) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden.");

  const open = await prisma.salesOutreach.findFirst({
    where: { leadId, status: { in: [...OPEN_CONCEPT] } },
    select: { id: true },
  });
  if (open) return null;

  let model = "self-hosted-llm";
  const draft = await chatJson<DraftShape>({
    messages: [
      { role: "system", content: `${NA_GESPREK_SYSTEM}\n\nContext over ZekerFlex:\n${zekerflexPitch(await beschikbareWerkers().catch(() => null))}` },
      {
        role: "user",
        content: JSON.stringify({
          companyName: lead.companyName,
          contactName: lead.contactName,
          city: lead.city,
          sector: lead.sector,
          uitkomst,
        }),
      },
    ],
    temperature: 0.4,
    maxTokens: 400,
    purpose: "sales-outreach",
    retry: false,
  }).catch((err) => {
    logger.warn("na-gesprek draft fell back to template", { leadId, error: (err as Error).message });
    model = "template";
    return templateNaGesprek(lead, uitkomst);
  });

  let subject = String(draft.subject ?? "").trim().slice(0, 200);
  let body = String(draft.body ?? "").trim().slice(0, 4000);
  if (!subject || !body) {
    ({ subject, body } = templateNaGesprek(lead, uitkomst));
    model = "template";
  }

  const outreach = await prisma.salesOutreach.create({
    data: { leadId, subject, body, stepIndex: 0, status: "DRAFT", generatedByModel: model },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.drafted",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Vervolgmail na telefoon (${uitkomst}) gegenereerd voor ${lead.companyName}`,
    targetType: "salesOutreach",
    targetId: outreach.id,
  });
  return outreach;
}

export interface EditOutreachInput {
  subject?: string;
  body?: string;
}

export async function editOutreach(
  id: string,
  patch: EditOutreachInput,
  actorUserId: string,
) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach niet gevonden.");
  if (outreach.status !== "DRAFT") {
    throw AppError.precondition("Alleen concepten kunnen worden bewerkt");
  }
  const updated = await prisma.salesOutreach.update({
    where: { id },
    data: {
      ...(patch.subject !== undefined
        ? { subject: patch.subject.trim().slice(0, 200) }
        : {}),
      ...(patch.body !== undefined
        ? { body: patch.body.trim().slice(0, 4000) }
        : {}),
      editedByHuman: true,
    },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.edited",
    actorUserId,
    actorLabel: "user",
    summary: `Concept-outreach bewerkt (${updated.id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

export async function approveOutreach(id: string, actorUserId: string | null) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach niet gevonden.");
  if (outreach.status !== "DRAFT") {
    throw AppError.precondition("Alleen een concept kan worden goedgekeurd");
  }
  const [updated] = await prisma.$transaction([
    prisma.salesOutreach.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actorUserId, approvedAt: new Date() },
    }),
    prisma.salesLead.update({
      where: { id: outreach.leadId },
      data: { status: "APPROVED" },
    }),
  ]);
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.approved",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    severity: "info",
    summary: `Outreach goedgekeurd voor verzending (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

/** Drop a draft/approved/scheduled outreach without sending it. */
export async function discardOutreach(id: string, actorUserId: string | null) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach niet gevonden.");
  if (["SENT"].includes(outreach.status)) {
    throw AppError.precondition("Een verzonden mail kan niet worden weggegooid");
  }
  const updated = await prisma.salesOutreach.update({
    where: { id },
    data: { status: "DISCARDED" },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.discarded",
    actorUserId,
    actorLabel: actorUserId ? "user" : "sales-ai",
    summary: `Concept-outreach weggegooid (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}

/** Record that a human sent this outreach. The platform never sends mail. */
export async function markOutreachSent(id: string, actorUserId: string) {
  const outreach = await prisma.salesOutreach.findUnique({ where: { id } });
  if (!outreach) throw AppError.notFound("Outreach niet gevonden.");
  if (outreach.status !== "APPROVED") {
    throw AppError.precondition(
      "Alleen goedgekeurde outreach kan als verzonden worden gemarkeerd",
    );
  }
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.salesOutreach.update({
      where: { id },
      data: { status: "SENT", sentById: actorUserId, sentAt: now },
    }),
    prisma.salesLead.update({
      where: { id: outreach.leadId },
      data: { status: "SENT", lastContactedAt: now },
    }),
  ]);
  await recordAudit({
    category: "SALES",
    action: "sales.outreach.sent",
    actorUserId,
    actorLabel: "user",
    summary: `Outreach gemarkeerd als verzonden (${id})`,
    targetType: "salesOutreach",
    targetId: id,
  });
  return updated;
}
