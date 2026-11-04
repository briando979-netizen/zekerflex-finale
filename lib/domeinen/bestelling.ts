import type Stripe from "stripe";
import type { DomeinBestelling, DomeinBestelStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { isReservedTestAddress, sendMail } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { getStripeClient } from "@/lib/billing/stripe";
import { BUNDEL_TLDS, euroPrijs, extensie, metBtw } from "@/lib/domeinen/extensies";
import { leesDomein } from "@/lib/domeinen/naam";
import { beschikbaarheid } from "@/lib/domeinen/beschikbaar";

// Een bedrijf bestelt een domeinnaam en betaalt met Stripe Checkout (iDEAL of
// kaart). De webhook (app/api/webhooks/stripe, metadata.domeinBestellingId)
// zet hem op BETAALD; ZekerFlex registreert hem (voorlopig met de hand in
// TransIP) en vinkt hem af in Admin → Domeinen. Met een websiteabonnement is
// één .nl/.com/.eu/.be het eerste jaar inbegrepen (de bundel).

const BUNDEL_STATUSSEN = ["ONBOARDING", "SUBMITTED", "ACTIVE"] as const;
/** Bestellingen die een domein "bezet houden" (een tweede bestelling is dan niet nodig). */
const LOPEND: DomeinBestelStatus[] = ["OPEN", "BETAALD", "GEREGISTREERD"];

/** Heeft dit bedrijf recht op de bundel voor deze extensie? (websiteabonnement, nog niet eerder gebruikt) */
export async function bundelVoor(tenantId: string, tld: string): Promise<boolean> {
  if (!(BUNDEL_TLDS as readonly string[]).includes(tld)) return false;
  const [site, eerder] = await Promise.all([
    prisma.managedWebsite.findUnique({ where: { tenantId }, select: { status: true } }),
    prisma.domeinBestelling.count({ where: { tenantId, bundel: true, status: { not: "GEANNULEERD" } } }),
  ]);
  return Boolean(site && (BUNDEL_STATUSSEN as readonly string[]).includes(site.status)) && eerder === 0;
}

export interface Besteller {
  tenantId: string;
  userId: string;
  email: string;
}

export type StartUitkomst = { soort: "betalen"; url: string } | { soort: "bundel"; id: string };

/** Waar je na de betaalpagina terugkomt: alleen deze eigen pagina's (geen open doorverwijzing). */
export const TERUG_PADEN = ["/domeinnaam", "/werkgever/website/bouwer", "/studio", "/studio/instellingen"] as const;
export const terugPad = (pad: unknown): string => (typeof pad === "string" && (TERUG_PADEN as readonly string[]).includes(pad) ? pad : "/domeinnaam");

/** Stelt de terugkeer-URL samen: pad + ?bestelling=…&domein=… */
export const terugMet = (pad: string, uitkomst: "gelukt" | "geannuleerd", domein: string): string =>
  `${terugPad(pad)}?${new URLSearchParams({ bestelling: uitkomst, domein }).toString()}`;

export async function startBestelling(b: Besteller, invoer: string, terugUrl: (pad: string) => string, terug = "/domeinnaam"): Promise<StartUitkomst> {
  const d = leesDomein(invoer);
  const ext = d ? extensie(d.tld) : undefined;
  if (!d || !ext) throw AppError.validation("Deze domeinnaam of extensie kunnen we (nog) niet aanbieden.");
  const domein = `${d.label}.${d.tld}`;
  const status = await beschikbaarheid(domein);
  if (status === "bezet") throw AppError.validation(`${domein} is al bezet. Is hij van jou? Vraag dan een verhuizing aan.`);
  // een afgebroken betaling (OPEN, ouder dan een uur) houdt het domein niet vast
  const lopend = await prisma.domeinBestelling.findFirst({
    where: { domein, status: { in: LOPEND }, OR: [{ status: { not: "OPEN" } }, { createdAt: { gt: new Date(Date.now() - 60 * 60_000) } }] },
    select: { tenantId: true, status: true },
  });
  if (lopend && lopend.status !== "OPEN") throw AppError.conflict(`${domein} is al besteld.`);
  if (lopend && lopend.tenantId !== b.tenantId) throw AppError.conflict(`${domein} wordt op dit moment door iemand anders besteld.`);

  if (await bundelVoor(b.tenantId, d.tld)) {
    const best = await prisma.domeinBestelling.create({
      data: { ...b, domein, prijsCent: 0, btwCent: 0, bundel: true, status: "BETAALD", betaaldOp: new Date(), notitie: `Beschikbaarheid bij bestellen: ${status}.` },
    });
    await naBetaling(best);
    return { soort: "bundel", id: best.id };
  }

  const p = metBtw(ext.prijsCent);
  const best = await prisma.domeinBestelling.create({
    data: { ...b, domein, prijsCent: p.exclCent, btwCent: p.btwCent, notitie: `Beschikbaarheid bij bestellen: ${status}.` },
  });
  const sessie = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    locale: "nl",
    customer_email: b.email,
    line_items: [
      { quantity: 1, price_data: { currency: "eur", unit_amount: p.exclCent, product_data: { name: `Domeinnaam ${domein} (1 jaar)` } } },
      { quantity: 1, price_data: { currency: "eur", unit_amount: p.btwCent, product_data: { name: "Btw 21%" } } },
    ],
    metadata: { domeinBestellingId: best.id },
    payment_intent_data: { description: `Domeinnaam ${domein} (1 jaar)`, metadata: { domeinBestellingId: best.id } },
    success_url: terugUrl(terugMet(terug, "gelukt", domein)),
    cancel_url: terugUrl(terugMet(terug, "geannuleerd", domein)),
  });
  if (!sessie.url) throw AppError.upstream("Stripe gaf geen betaalpagina terug.");
  await prisma.domeinBestelling.update({ where: { id: best.id }, data: { stripeSessionId: sessie.id } });
  return { soort: "betalen", url: sessie.url };
}

/**
 * Betaalde Checkout Session (webhook). Dubbel aanroepen doet niets dubbel:
 * alleen een OPEN bestelling gaat naar BETAALD. Het bedrag moet kloppen.
 */
export async function verwerkDomeinSessie(session: Stripe.Checkout.Session): Promise<{ verwerkt: boolean }> {
  const id = session.metadata?.domeinBestellingId;
  if (!id || session.payment_status !== "paid") return { verwerkt: false };
  const best = await prisma.domeinBestelling.findUnique({ where: { id } });
  if (!best) {
    logger.warn("domein: bestelling uit webhook niet gevonden", { id });
    return { verwerkt: false };
  }
  if (session.amount_total !== best.prijsCent + best.btwCent) {
    logger.error("domein: betaald bedrag klopt niet", { id, verwacht: best.prijsCent + best.btwCent, betaald: session.amount_total });
    await prisma.domeinBestelling.updateMany({ where: { id, status: "OPEN" }, data: { notitie: `${best.notitie} Betaald bedrag (${session.amount_total}) wijkt af: controleer in Stripe.`.trim() } });
    return { verwerkt: false };
  }
  const { count } = await prisma.domeinBestelling.updateMany({ where: { id, status: "OPEN" }, data: { status: "BETAALD", betaaldOp: new Date(), stripeSessionId: session.id } });
  if (count === 1) {
    const nu = await prisma.domeinBestelling.findUnique({ where: { id } });
    if (nu) await naBetaling(nu);
  }
  return { verwerkt: true };
}

/** Na betaling (of in de bundel): sales en de klant weten het, en het staat in het auditspoor. */
async function naBetaling(b: DomeinBestelling): Promise<void> {
  const bedrag = b.bundel ? "in de bundel (eerste jaar inbegrepen)" : `${euroPrijs(b.prijsCent + b.btwCent)} incl. btw`;
  await recordAudit({
    category: "BILLING",
    action: "domein.besteld",
    actorLabel: b.bundel ? `user:${b.userId}` : "integration:stripe",
    summary: `Domeinnaam ${b.domein} besteld (${bedrag})`,
    targetType: "domein-bestelling",
    targetId: b.id,
    metadata: { tenantId: b.tenantId, bundel: b.bundel },
  }).catch(() => undefined);
  // een bestelling van een testadres mag sales nooit vragen een echt domein te kopen. Let op:
  // isReservedTestAddress telt @example.com bewust NIET mee (tests/mail-reserved-address.test.ts),
  // terwijl live tests juist example.com gebruiken; hier tellen de RFC 2606-domeinen dus wel.
  const test = isReservedTestAddress(b.email) || /@example\.(com|net|org)$/i.test(b.email.trim());
  await Promise.all([
    test
      ? Promise.resolve()
      : sendMail({
          to: CONTACTS.sales,
          kind: "domein-bestelling",
          replyTo: b.email,
          subject: `Domein betaald: ${b.domein} — registreren`,
          text: `${b.domein} is besteld (${bedrag}).\nBesteld door: ${b.email}\n\nRegistreer hem in TransIP en vink hem daarna af in Admin → Domeinen.`,
        }).catch((e) => logger.warn("domein: mail aan sales mislukt", { error: (e as Error).message })),
    sendMail({
      to: b.email,
      kind: "domein-bestelling",
      replyTo: CONTACTS.sales,
      subject: `Je domeinnaam ${b.domein} is besteld`,
      text: `Bedankt! We hebben je bestelling van ${b.domein} ontvangen (${bedrag}).\n\nWe leggen de naam binnen één werkdag voor je vast en laten het je weten zodra hij klaar is. Daarna koppelen we hem aan je website, webshop of e-mail.\n\nVragen? Antwoord gewoon op deze mail.\n\nHet ZekerFlex-team`,
    }).catch((e) => logger.warn("domein: bevestiging aan klant mislukt", { error: (e as Error).message })),
  ]);
}

export interface BestellingWeergave {
  id: string;
  domein: string;
  status: DomeinBestelStatus;
  bedragCent: number;
  bundel: boolean;
  aangemaakt: string;
}

const weergave = (b: DomeinBestelling): BestellingWeergave => ({
  id: b.id,
  domein: b.domein,
  status: b.status,
  bedragCent: b.prijsCent + b.btwCent,
  bundel: b.bundel,
  aangemaakt: b.createdAt.toISOString(),
});

/** De bestellingen van één bedrijf (zonder de nog niet betaalde). */
export async function bestellingenVan(tenantId: string): Promise<BestellingWeergave[]> {
  const rijen = await prisma.domeinBestelling.findMany({ where: { tenantId, status: { not: "OPEN" } }, orderBy: { createdAt: "desc" }, take: 50 });
  return rijen.map(weergave);
}

/** Voor Admin → Domeinen: alles, nieuwste eerst. */
export async function alleBestellingen(): Promise<(BestellingWeergave & { email: string; tenantId: string; notitie: string; betaaldOp: string | null })[]> {
  const rijen = await prisma.domeinBestelling.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return rijen.map((b) => ({ ...weergave(b), email: b.email, tenantId: b.tenantId, notitie: b.notitie, betaaldOp: b.betaaldOp?.toISOString() ?? null }));
}

const MAG_NAAR: Record<DomeinBestelStatus, DomeinBestelStatus[]> = {
  OPEN: ["GEANNULEERD"],
  BETAALD: ["GEREGISTREERD", "MISLUKT", "GEANNULEERD"],
  MISLUKT: ["GEREGISTREERD", "GEANNULEERD"],
  GEREGISTREERD: [],
  GEANNULEERD: [],
};

/** Admin vinkt een bestelling af (geregistreerd, mislukt of geannuleerd). */
export async function zetStatus(id: string, naar: DomeinBestelStatus, notitie: string, door: string): Promise<void> {
  const b = await prisma.domeinBestelling.findUnique({ where: { id } });
  if (!b) throw AppError.notFound("Deze bestelling bestaat niet.");
  if (!MAG_NAAR[b.status].includes(naar)) throw AppError.conflict(`Een bestelling met status ${b.status} kan niet naar ${naar}.`);
  const { count } = await prisma.domeinBestelling.updateMany({
    where: { id, status: b.status },
    data: { status: naar, ...(naar === "GEREGISTREERD" ? { afgerondOp: new Date() } : {}), ...(notitie ? { notitie: `${b.notitie} ${notitie}`.trim() } : {}) },
  });
  if (count !== 1) throw AppError.conflict("Deze bestelling is net door iemand anders aangepast. Ververs de pagina.");
  await recordAudit({ category: "BILLING", action: "domein.status", actorLabel: door, summary: `${b.domein}: ${b.status} → ${naar}`, targetType: "domein-bestelling", targetId: id }).catch(() => undefined);
  if (naar === "GEREGISTREERD") {
    await sendMail({
      to: b.email,
      kind: "domein-bestelling",
      replyTo: CONTACTS.sales,
      subject: `${b.domein} is vastgelegd`,
      text: `Goed nieuws: ${b.domein} is voor je vastgelegd. We koppelen hem aan je website of webshop; je hoort het als dat klaar is.\n\nHet ZekerFlex-team`,
    }).catch((e) => logger.warn("domein: mail 'geregistreerd' mislukt", { error: (e as Error).message }));
  }
}

export { MAG_NAAR };
