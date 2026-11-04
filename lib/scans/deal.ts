import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { BASIS, BUNDEL } from "@/lib/horeca/modules";
import { extensie } from "@/lib/domeinen/extensies";
import { proposalOffer } from "@/lib/sales/website-proposal";
import { createLead } from "@/lib/sales/leads";
import { maakLeadWarm } from "@/lib/scans/lead";
import { getScanLog, koppel, logStap } from "@/lib/scans/store";
import { dealEuro, dealOpties, dealTotaal, isTestEmail, isTestHost, schoneKeuze, SOORT_LABEL, type DealInput, type DealOptie, type DealPrijzen, type ScanLog, type ScanSoort } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Het voorstel op maat bij een gratis scan (/deal/<id>): met de bedrijfsgegevens
// en wat de scan vond, de opties die bij hén passen, met echte prijzen (de prijzen
// van de websitevoorstellen, website-beheer, het horeca-pakket, telefonie en de
// platformfee). Het bedrijf vinkt aan wat het wil en zegt ja; dat wordt een warme
// lead met een melding aan sales. Er wordt niets automatisch afgeschreven.
//   KV "scan-deal:<id>" — het voorstel (het niet te raden id in de link is de sleutel)
// ---------------------------------------------------------------------------

export const DEAL_DAGEN = 30;
const KEY = (id: string) => `scan-deal:${id}`;
export const isDealId = (id: string) => /^[a-f0-9]{16}$/.test(id);

export interface Deal {
  id: string;
  scan: { soort: ScanSoort; scanId: string };
  at: string;
  geldigTot: string;
  bedrijf: { naam: string; host: string | null; plaats: string | null };
  score: number;
  samenvatting: string;
  rapport: string;
  siteSlug: string | null;
  opties: DealOptie[];
  status: "open" | "bekeken" | "akkoord";
  keuze: string[];
  akkoord?: { at: string; naam: string; email: string; telefoon: string | null } | undefined;
}

/** De echte prijzen van vandaag (die de eigenaar in beheer instelt). */
export async function dealPrijzen(): Promise<DealPrijzen> {
  const o = await proposalOffer();
  return {
    websiteCent: o.website.cents,
    websiteKortingCent: o.website.kortingCents,
    beheer: o.plannen.map((p) => ({ key: p.key, label: p.label, maandCent: p.priceCentsPerMonth })),
    horecaBasisCent: BASIS.prijsCentPerMaand,
    horecaBundelCent: BUNDEL.prijsCentPerMaand,
    telefoonCent: o.telefonieVanafCents,
    uurfeeCent: o.feePerUurCents,
    domeinNlCent: extensie("nl")?.prijsCent,
  };
}

export async function maakDeal(log: ScanLog, input: DealInput, now = new Date()): Promise<Deal> {
  const opties = dealOpties(input, await dealPrijzen());
  const deal: Deal = {
    id: randomBytes(8).toString("hex"),
    scan: { soort: log.soort, scanId: log.scanId },
    at: now.toISOString(),
    geldigTot: new Date(now.getTime() + DEAL_DAGEN * 86_400_000).toISOString(),
    bedrijf: { naam: log.naam, host: log.host, plaats: log.plaats },
    score: log.score,
    samenvatting: log.samenvatting,
    rapport: log.rapport,
    siteSlug: log.siteSlug,
    opties,
    status: "open",
    keuze: opties.filter((o) => o.aanbevolen).map((o) => o.id),
  };
  await kvSet(KEY(deal.id), deal);
  return deal;
}

export async function getDeal(id: string): Promise<Deal | null> {
  if (!isDealId(id)) return null;
  return kvGet<Deal>(KEY(id)).catch(() => null);
}

export const dealVerlopen = (d: Deal, now = Date.now()) => Date.parse(d.geldigTot) < now && d.status !== "akkoord";

/** Veel voorstellen in één keer (voor beheer). */
export async function getDeals(ids: readonly string[]): Promise<Map<string, Deal>> {
  const geldig = [...new Set(ids.filter(isDealId))];
  const rijen = await kvGetMany<Deal>(geldig.map(KEY)).catch(() => new Map<string, Deal>());
  return new Map([...rijen.values()].filter((d) => d && typeof d.id === "string").map((d) => [d.id, d]));
}

/** De bezoeker opende het voorstel (vanuit de browser, zodat linkvoorbeelden niet meetellen). */
export async function dealBekeken(id: string): Promise<void> {
  const d = await getDeal(id);
  if (!d || d.status !== "open") return;
  await kvSet(KEY(id), { ...d, status: "bekeken" });
  await logStap(d.scan.soort, d.scan.scanId, "deal-bekeken");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Ja, dit wil ik": keuze vastleggen, lead warm (of nieuw), sales een melding, het bedrijf een bevestiging. */
export async function dealAkkoord(id: string, persoon: { naam: string; email: string; telefoon?: string | undefined }, keuzeRuw: readonly unknown[]): Promise<Deal> {
  const d = await getDeal(id);
  if (!d) throw AppError.notFound("Dit voorstel bestaat niet (meer).");
  if (dealVerlopen(d)) throw AppError.validation("Dit voorstel is verlopen. Doe de scan opnieuw voor een nieuw voorstel.");
  const keuze = schoneKeuze(d.opties, keuzeRuw);
  if (keuze.length === 0) throw AppError.validation("Kies minstens één optie.");
  const totaal = dealTotaal(d.opties, keuze);
  const now = new Date().toISOString();
  const next: Deal = { ...d, status: "akkoord", keuze, akkoord: { at: now, naam: persoon.naam, email: persoon.email, telefoon: persoon.telefoon ?? null } };
  await kvSet(KEY(id), next);

  // een test (testbedrijf of testadres): wel vastleggen, maar geen lead en geen mail naar sales of de klant
  if (isTestHost(d.bedrijf.host) || isTestEmail(persoon.email)) {
    await logStap(d.scan.soort, d.scan.scanId, "deal-akkoord", `${keuze.join(",")} (test)`);
    return next;
  }
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const gekozen = d.opties.filter((o) => keuze.includes(o.id));
  const regels = gekozen.map((o) => `${o.naam}${o.eenmaligCent ? ` (${dealEuro(o.eenmaligCent)} eenmalig)` : ""}${o.maandCent ? ` (${dealEuro(o.maandCent)} per maand)` : ""}${!o.eenmaligCent && !o.maandCent && o.prijsTekst ? ` (${o.prijsTekst})` : ""}`);
  const notitie = `[voorstel op maat] Akkoord: ${regels.join("; ")}. Totaal ${dealEuro(totaal.eenmaligCent)} eenmalig + ${dealEuro(totaal.maandCent)} per maand. ${base}/deal/${id}`;
  const log = await getScanLog(d.scan.soort, d.scan.scanId);
  const warm = await maakLeadWarm(log?.leadId ?? null, persoon, "voorstel-op-maat", notitie);
  if (!warm) {
    const lead = await createLead({
      companyName: d.bedrijf.naam,
      contactName: persoon.naam,
      contactEmail: persoon.email,
      contactPhone: persoon.telefoon || undefined,
      city: d.bedrijf.plaats ?? undefined,
      source: "voorstel-op-maat",
      sourceUrl: d.bedrijf.host ? `https://${d.bedrijf.host}/` : undefined,
      notes: notitie.slice(0, 900),
      createdById: null,
    }).catch(() => null);
    if (lead) await koppel(d.scan.soort, d.scan.scanId, { leadId: lead.id });
  }
  await logStap(d.scan.soort, d.scan.scanId, "deal-akkoord", keuze.join(","));

  await sendMail({
    to: CONTACTS.sales,
    replyTo: persoon.email,
    kind: "voorstel-op-maat-akkoord",
    subject: `Ja op voorstel op maat: ${d.bedrijf.naam}`,
    text: `${d.bedrijf.naam} (${d.bedrijf.host ?? "geen website"}) zegt ja op het voorstel op maat na een ${SOORT_LABEL[d.scan.soort].toLowerCase()}.\n\n${regels.map((r) => `- ${r}`).join("\n")}\n\nTotaal: ${dealEuro(totaal.eenmaligCent)} eenmalig + ${dealEuro(totaal.maandCent)} per maand.\n\n${persoon.naam} · ${persoon.email}${persoon.telefoon ? ` · ${persoon.telefoon}` : ""}\n\nVoorstel: ${base}/deal/${id}\nRapport: ${base}${d.rapport}`,
    html: mailShell(
      "Ja op een voorstel op maat",
      `<p style="margin:0 0 6px"><strong>${esc(d.bedrijf.naam)}</strong>${d.bedrijf.host ? ` · ${esc(d.bedrijf.host)}` : ""}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(persoon.naam)} · ${esc(persoon.email)}${persoon.telefoon ? ` · ${esc(persoon.telefoon)}` : ""}</p>
       <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#3C4A42">${regels.map((r) => `<li style="margin:0 0 4px">${esc(r)}</li>`).join("")}</ul>
       <p style="margin:0 0 12px;font-size:14px"><strong>Totaal:</strong> ${dealEuro(totaal.eenmaligCent)} eenmalig + ${dealEuro(totaal.maandCent)} per maand</p>
       <p style="margin:0">${mailButton(`${base}/deal/${id}`, "Bekijk het voorstel")}</p>`,
    ),
  }).catch((e) => logger.warn("voorstel op maat: melding mislukt", { error: (e as Error).message }));
  await sendMail({
    to: persoon.email,
    from: env.MAIL_FROM,
    replyTo: CONTACTS.sales,
    kind: "voorstel-op-maat-bevestiging",
    subject: `Je voorstel voor ${d.bedrijf.naam}`,
    text: `Hoi ${persoon.naam},\n\nBedankt! We hebben je keuze ontvangen en nemen binnen één werkdag contact met je op. Er wordt niets afgeschreven voordat we samen alles hebben doorgenomen.\n\nJe keuze:\n${regels.map((r) => `- ${r}`).join("\n")}\n\nJe voorstel: ${base}/deal/${id}\n\nGroet,\nZekerFlex`,
    html: mailShell(
      "We hebben je keuze ontvangen",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(persoon.naam)}, bedankt! We nemen binnen één werkdag contact met je op. Er wordt niets afgeschreven voordat we samen alles hebben doorgenomen.</p>
       <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#3C4A42">${regels.map((r) => `<li style="margin:0 0 4px">${esc(r)}</li>`).join("")}</ul>
       <p style="margin:0">${mailButton(`${base}/deal/${id}`, "Bekijk je voorstel")}</p>`,
    ),
  }).catch(() => undefined);
  return next;
}
