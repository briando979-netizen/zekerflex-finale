import type { SalesLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { addSuppression, normaliseEmail } from "@/lib/sales/suppression";
import { cancelOpenOutreach } from "@/lib/sales/reply";
import { optoutKey, recordOptOut } from "@/lib/telephony/consent";
import {
  BEL_KLAAR,
  BEL_MIN_SCORE,
  belLabel,
  belNotitie,
  belRang,
  opBelLijst,
  telHref,
  vergelijkBelRang,
  voegNotitieToe,
  volgendeWerkdag10,
  waaromPast,
  type BelRegel,
  type BelStand,
  type BelUitkomst,
} from "@/lib/sales/bellijst";

// ---------------------------------------------------------------------------
// De bellijst op de server (zie lib/sales/bellijst.ts): de leads ophalen, de belstand en de niet-bellen-lijst erbij,
// en een uitkomst vastleggen. De belstand staat apart in de KV ("sales-bel:<leadId>", per bedrijf, geen persoon), zodat
// "terugbellen" nooit nextActionAt raakt: dat veld plant de volgende mail van de motor.
// ---------------------------------------------------------------------------

const belSleutel = (leadId: string) => `sales-bel:${leadId}`;

export async function belLijst(nu = new Date(), limiet = 100): Promise<BelRegel[]> {
  const rows = await prisma.salesLead.findMany({
    where: { suppressed: false, contactPhone: { not: null }, score: { gte: BEL_MIN_SCORE }, status: { notIn: [...BEL_KLAAR] as SalesLeadStatus[] } },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      companyName: true,
      city: true,
      sector: true,
      score: true,
      contactPhone: true,
      contactEmail: true,
      discoveredEmail: true,
      status: true,
      suppressed: true,
      vacancySignal: true,
      source: true,
      scoreRationale: true,
      createdAt: true,
    },
  });
  const [standen, nietBellen] = await Promise.all([
    kvGetMany<BelStand>(rows.map((r) => belSleutel(r.id))).catch(() => new Map<string, BelStand>()),
    kvGetMany<unknown>(rows.map((r) => optoutKey(r.contactPhone ?? ""))).catch(() => new Map<string, unknown>()),
  ]);
  return rows
    .map((r) => ({ r, stand: standen.get(belSleutel(r.id)) ?? null }))
    .filter(({ r, stand }) => opBelLijst(r, stand, nu, nietBellen.has(optoutKey(r.contactPhone ?? ""))))
    .sort((a, b) => vergelijkBelRang(belRang(a.r.createdAt, a.stand), belRang(b.r.createdAt, b.stand)))
    .slice(0, limiet)
    .map(({ r, stand }) => ({
      id: r.id,
      companyName: r.companyName,
      city: r.city,
      sector: r.sector,
      score: r.score,
      waarom: waaromPast(r),
      telefoon: r.contactPhone ?? "",
      telHref: telHref(r.contactPhone),
      heeftMail: Boolean(r.contactEmail || r.discoveredEmail),
      status: r.status,
      pogingen: stand?.pogingen ?? 0,
      laatste: stand?.laatste ? { ...stand.laatste, label: belLabel(stand.laatste.uitkomst) } : null,
      terugbellenOp: stand?.terugbellenOp ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
}

/**
 * De uitkomst van een telefoontje: in de belstand, als regel in de notities, lastContactedAt, en een audit.
 *   interesse      → "Reactie ontvangen" (REPLIED): open mails vervallen, een mens neemt het over
 *   geen interesse → "Verloren", onderdrukt: geen mail meer (ook het adres) en het nummer op de niet-bellen-lijst
 *   terugbellen    → van de lijst tot de volgende werkdag 10:00
 *   geen gehoor    → blijft op de lijst, achter wie nog nooit gebeld is
 */
export async function legBelUitkomstVast(leadId: string, uitkomst: BelUitkomst, actorUserId: string, notitie?: string | undefined, nu = new Date()) {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead niet gevonden.");
  const oud = await kvGet<BelStand>(belSleutel(leadId)).catch(() => null);
  const stand: BelStand = {
    pogingen: (oud?.pogingen ?? 0) + 1,
    laatste: { at: nu.toISOString(), uitkomst },
    ...(uitkomst === "terugbellen" ? { terugbellenOp: volgendeWerkdag10(nu).toISOString() } : {}),
  };
  await kvSet(belSleutel(leadId), stand);

  if (uitkomst === "interesse" || uitkomst === "geen-interesse") await cancelOpenOutreach(leadId);
  if (uitkomst === "geen-interesse") {
    const email = lead.contactEmail || lead.discoveredEmail;
    if (email) await addSuppression(normaliseEmail(email), "manual", actorUserId);
    if (lead.contactPhone) await recordOptOut(lead.contactPhone, "geen interesse (gebeld vanuit de bellijst)").catch(() => undefined);
  }
  const eind =
    uitkomst === "interesse"
      ? { status: "REPLIED" as const, repliedAt: nu, nextActionAt: null }
      : uitkomst === "geen-interesse"
        ? { status: "LOST" as const, suppressed: true, suppressedReason: "geen interesse (telefonisch)", nextActionAt: null }
        : {};
  const updated = await prisma.salesLead.update({
    where: { id: leadId },
    data: { notes: voegNotitieToe(lead.notes, belNotitie(uitkomst, nu, notitie)), lastContactedAt: nu, ...eind },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.lead.gebeld",
    actorUserId,
    actorLabel: "user",
    summary: `Gebeld: ${lead.companyName}, ${belLabel(uitkomst).toLowerCase()}`,
    targetType: "salesLead",
    targetId: leadId,
    metadata: { uitkomst, pogingen: stand.pogingen },
  });
  return { lead: updated, stand };
}
