import type Stripe from "stripe";
import type { DomeinBestelling, DomeinBestelStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { isReservedTestAddress, sendMail } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { ensureStripeCustomer, getStripeClient } from "@/lib/billing/stripe";
import { BUNDEL_TLDS, euroPrijs, extensie, metBtw } from "@/lib/domeinen/extensies";
import { leesDomein } from "@/lib/domeinen/naam";
import { beschikbaarheid } from "@/lib/domeinen/beschikbaar";
import { dnsVoorWebsite, koppelAanSite, koppelNotitie, koppelUitleg, type Koppeling } from "@/lib/domeinen/koppelen";
import { domainAvailability, domainInfo, registerDomain, setTransferLock, transipConfigured } from "@/lib/mail/hosting/transip";
import { houderContacten } from "@/lib/domeinen/houder";
import { maakDomeinFactuur } from "@/lib/domeinen/factuur";
import { AUTO_REGISTREREN_PER_DAG, datumNl, isTestAdres, jaarLater, leesDatum } from "@/lib/domeinen/verlengen-core";
import { alertOwnerLater } from "@/lib/ops/alert";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// Een bedrijf bestelt een domeinnaam en betaalt met Stripe Checkout (iDEAL of
// kaart; de betaalmethode wordt bewaard voor de jaarlijkse verlenging). De
// webhook (app/api/webhooks/stripe, metadata.domeinBestellingId) zet hem op
// BETAALD, maakt de ZekerFlex-factuur en legt de naam meteen vast bij het
// register (legVast; met de TransIP-koppeling, anders met de hand in Admin →
// Domeinen). Vastgelegd = meteen op de website van het bedrijf
// (lib/domeinen/koppelen.ts). Verlengen, herinneren en opzeggen: verlengen.ts.
// Met een betaald websiteabonnement is één .nl/.com/.eu/.be het eerste jaar
// inbegrepen (de bundel). De klant ziet alleen ZekerFlex, nooit het register.

const BUNDEL_STATUSSEN = ["ONBOARDING", "SUBMITTED", "ACTIVE"] as const;
/** Bestellingen die een domein "bezet houden" (een tweede bestelling is dan niet nodig). */
const LOPEND: DomeinBestelStatus[] = ["OPEN", "BETAALD", "GEREGISTREERD", "OPGEZEGD"];

/** Heeft dit bedrijf recht op de bundel voor deze extensie? */
export async function bundelVoor(tenantId: string, tld: string): Promise<boolean> {
  return (BUNDEL_TLDS as readonly string[]).includes(tld) && bundelOver(tenantId);
}

/**
 * Is de bundel (eerste jaar inbegrepen) voor dit bedrijf nog te gebruiken? Alleen met
 * een echt betaald websiteabonnement (een Stripe-abonnement) en nog niet eerder gebruikt.
 * Een kosteloos account of een beheerdersrecord (geen stripeSubId) betaalt de naam
 * gewoon: een domeinnaam kost ZekerFlex bij TransIP echt geld.
 */
export async function bundelOver(tenantId: string): Promise<boolean> {
  const [site, eerder] = await Promise.all([
    prisma.managedWebsite.findUnique({ where: { tenantId }, select: { status: true, stripeSubId: true } }),
    prisma.domeinBestelling.count({ where: { tenantId, bundel: true, status: { not: "GEANNULEERD" } } }),
  ]);
  return Boolean(site?.stripeSubId && (BUNDEL_STATUSSEN as readonly string[]).includes(site.status)) && eerder === 0;
}

export interface Besteller {
  tenantId: string;
  userId: string;
  email: string;
}

/** Alleen deze velden naar de database: de route geeft meer mee (zoals de naam), en Prisma weigert onbekende velden. */
const wie = (b: Besteller): Besteller => ({ tenantId: b.tenantId, userId: b.userId, email: b.email });

export type StartUitkomst = { soort: "betalen"; url: string } | { soort: "bundel"; id: string };

/** Waar je na de betaalpagina terugkomt: alleen deze eigen pagina's (geen open doorverwijzing). */
// "/werkgever/website/bouwer" blijft staan voor betalingen die nog onderweg zijn: die pagina stuurt door naar de studio.
export const TERUG_PADEN = ["/domeinnaam", "/werkgever/website/bouwer", "/studio", "/studio/instellingen", "/studio/website/instellingen", "/studio/webshop/instellingen", "/studio/website/bouwer", "/studio/webshop/paginas"] as const;
export const terugPad = (pad: unknown): string => (typeof pad === "string" && (TERUG_PADEN as readonly string[]).includes(pad) ? pad : "/domeinnaam");

/** Stelt de terugkeer-URL samen: pad + ?bestelling=…&domein=… */
export const terugMet = (pad: string, uitkomst: "gelukt" | "geannuleerd", domein: string): string =>
  `${terugPad(pad)}?${new URLSearchParams({ bestelling: uitkomst, domein }).toString()}`;

/** De Stripe-klant van het bedrijf (Tenant.stripeCustomerId), zo nodig aangemaakt. */
async function stripeKlant(b: Besteller): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: b.tenantId }, select: { name: true, stripeCustomerId: true } });
  if (!t) throw AppError.notFound("Bedrijf niet gevonden.");
  if (t.stripeCustomerId) return t.stripeCustomerId;
  const id = await ensureStripeCustomer({ existingCustomerId: null, email: b.email, name: t.name, tenantId: b.tenantId });
  // twee bestellingen tegelijk: de eerste die schrijft wint
  const { count } = await prisma.tenant.updateMany({ where: { id: b.tenantId, stripeCustomerId: null }, data: { stripeCustomerId: id } });
  if (count === 1) return id;
  return (await prisma.tenant.findUniqueOrThrow({ where: { id: b.tenantId }, select: { stripeCustomerId: true } })).stripeCustomerId ?? id;
}

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
      data: { ...wie(b), domein, prijsCent: 0, btwCent: 0, bundel: true, status: "BETAALD", betaaldOp: new Date(), notitie: `Beschikbaarheid bij bestellen: ${status}.` },
    });
    await naBetaling(best);
    return { soort: "bundel", id: best.id };
  }

  const p = metBtw(ext.prijsCent);
  const best = await prisma.domeinBestelling.create({
    data: { ...wie(b), domein, prijsCent: p.exclCent, btwCent: p.btwCent, notitie: `Beschikbaarheid bij bestellen: ${status}.` },
  });
  // de betaalmethode bewaren bij het bedrijf, zodat de verlenging elk jaar vanzelf gaat
  // (kaart, of een SEPA-machtiging uit iDEAL). Een testadres krijgt geen Stripe-klant.
  const klant = isTestAdres(b.email) ? null : await stripeKlant(b).catch((e: unknown) => (logger.warn("domein: Stripe-klant maken lukte niet", { error: (e as Error).message }), null));
  const sessie = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    locale: "nl",
    ...(klant ? { customer: klant } : { customer_email: b.email }),
    line_items: [
      { quantity: 1, price_data: { currency: "eur", unit_amount: p.exclCent, product_data: { name: `Domeinnaam ${domein} (1 jaar)` } } },
      { quantity: 1, price_data: { currency: "eur", unit_amount: p.btwCent, product_data: { name: "Btw 21%" } } },
    ],
    metadata: { domeinBestellingId: best.id },
    payment_intent_data: {
      description: `Domeinnaam ${domein} (1 jaar)`,
      metadata: { domeinBestellingId: best.id },
      ...(klant ? { setup_future_usage: "off_session" as const } : {}),
    },
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
    if (nu) {
      // de ZekerFlex-factuur (betaald) staat meteen bij Werkgever → Facturen
      const vandaag = new Date();
      await maakDomeinFactuur({
        bestelling: nu,
        soort: "eerste-jaar",
        exclCent: nu.prijsCent,
        periodeVan: vandaag,
        periodeTot: jaarLater(vandaag),
        betaald: { op: vandaag, stripeCheckoutSessionId: session.id, stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null },
      }).catch((e: unknown) => logger.error("domein: factuur maken mislukt", { id, error: (e as Error).message }));
      await naBetaling(nu);
    }
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
  // met de TransIP-koppeling legt ZekerFlex de naam meteen zelf vast (na de webhook, zonder hem op te houden)
  const vanzelf = test || transipConfigured();
  if (vanzelf) void legVast(b, "systeem:na-betaling", false).catch((e: unknown) => logger.error("domein: vastleggen na betaling mislukt", { id: b.id, error: (e as Error).message }));
  await Promise.all([
    test || vanzelf
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
      text: `Bedankt! We hebben je bestelling van ${b.domein} ontvangen (${bedrag}).\n\n${vanzelf ? "We leggen de naam nu voor je vast; je krijgt een mail zodra hij klaar is, meestal binnen een paar minuten." : "We leggen de naam binnen één werkdag voor je vast en laten het je weten zodra hij klaar is."} Daarna koppelen we hem aan je website, webshop of e-mail. De factuur staat in ZekerFlex onder Facturen.\n\nVragen? Antwoord gewoon op deze mail.\n\nHet ZekerFlex-team`,
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
export async function alleBestellingen(): Promise<(BestellingWeergave & { email: string; tenantId: string; notitie: string; betaaldOp: string | null; verlooptOp: string | null; autoVerlengen: boolean })[]> {
  const rijen = await prisma.domeinBestelling.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return rijen.map((b) => ({
    ...weergave(b),
    email: b.email,
    tenantId: b.tenantId,
    notitie: b.notitie,
    betaaldOp: b.betaaldOp?.toISOString() ?? null,
    verlooptOp: b.verlooptOp?.toISOString() ?? null,
    autoVerlengen: b.autoVerlengen,
  }));
}

const MAG_NAAR: Record<DomeinBestelStatus, DomeinBestelStatus[]> = {
  OPEN: ["GEANNULEERD"],
  BETAALD: ["GEREGISTREERD", "MISLUKT", "GEANNULEERD"],
  MISLUKT: ["GEREGISTREERD", "GEANNULEERD"],
  GEREGISTREERD: ["OPGEZEGD"],
  GEANNULEERD: [],
  // een opzegging die is ingetrokken (klant betaalde toch): terug naar vastgelegd
  OPGEZEGD: ["GEREGISTREERD"],
};

/** "user:<id>" → de id, voor het auditspoor van de website. */
const beheerder = (door: string) => ({ userId: door.startsWith("user:") ? door.slice(5) : door, name: "ZekerFlex" });

/** Admin vinkt een bestelling af (geregistreerd, mislukt of geannuleerd). Geregistreerd: meteen op de website van de klant. */
export async function zetStatus(id: string, naar: DomeinBestelStatus, notitie: string, door: string, extra: { verlooptOp?: Date } = {}): Promise<void> {
  const b = await prisma.domeinBestelling.findUnique({ where: { id } });
  if (!b) throw AppError.notFound("Deze bestelling bestaat niet.");
  if (!MAG_NAAR[b.status].includes(naar)) throw AppError.conflict(`Een bestelling met status ${b.status} kan niet naar ${naar}.`);
  const koppeling: Koppeling | null =
    naar === "GEREGISTREERD" ? await koppelAanSite(b.tenantId, b.domein, beheerder(door)).catch((e: unknown) => ({ soort: "fout" as const, melding: (e as Error).message })) : null;
  const tekst = [notitie, koppeling ? koppelNotitie(koppeling) : ""].filter(Boolean).join(" ");
  const { count } = await prisma.domeinBestelling.updateMany({
    where: { id, status: b.status },
    data: {
      status: naar,
      ...(naar === "GEREGISTREERD" ? { afgerondOp: new Date(), opgezegdOp: null } : {}),
      ...(naar === "OPGEZEGD" ? { opgezegdOp: new Date() } : {}),
      ...(extra.verlooptOp ? { verlooptOp: extra.verlooptOp } : {}),
      ...(tekst ? { notitie: `${b.notitie} ${tekst}`.trim() } : {}),
    },
  });
  if (count !== 1) throw AppError.conflict("Deze bestelling is net door iemand anders aangepast. Ververs de pagina.");
  await recordAudit({ category: "BILLING", action: "domein.status", actorLabel: door, summary: `${b.domein}: ${b.status} → ${naar}`, targetType: "domein-bestelling", targetId: id }).catch(() => undefined);
  if (koppeling) {
    await sendMail({
      to: b.email,
      kind: "domein-bestelling",
      replyTo: CONTACTS.sales,
      subject: `${b.domein} is vastgelegd`,
      text: `Goed nieuws: ${b.domein} is voor je vastgelegd.\n\n${koppelUitleg(b.domein, koppeling)}${extra.verlooptOp ? `\n\nDe naam loopt tot ${datumNl(extra.verlooptOp)} en wordt elk jaar verlengd. Ruim vooraf krijg je de factuur; heb je met je kaart of iDEAL betaald, dan schrijven we hem vanzelf af. Niet meer nodig? Zet "Automatisch verlengen" uit bij Jouw domeinnamen.` : ""}\n\nVragen? Antwoord gewoon op deze mail.\n\nHet ZekerFlex-team`,
    }).catch((e) => logger.warn("domein: mail 'geregistreerd' mislukt", { error: (e as Error).message }));
  }
}

// één registratie tegelijk per bestelling (twee keer = twee TransIP-facturen)
const bezigMet = ((globalThis as { __zfDomeinRegistratie?: Set<string> }).__zfDomeinRegistratie ??= new Set<string>());
const autoTellerKey = (dag: string) => `domein-auto-vastgelegd:${dag}`;

export type VastlegUitkomst = "vastgelegd" | "wacht" | "mislukt";

/**
 * Registreer met de klant als houder (lib/domeinen/houder.ts). Weigert het
 * register de bedrijfsgegevens, dan nog een keer met de standaard van het
 * account (ZekerFlex houder): de klant moet zijn naam hoe dan ook krijgen.
 * Geeft de regel voor de notitie terug.
 */
async function registreerMetHouder(b: DomeinBestelling): Promise<string> {
  const h = await houderContacten(b);
  if (h.contacten) {
    try {
      await registerDomain(b.domein, dnsVoorWebsite(b.domein), h.contacten);
      return "Houder: het bedrijf zelf.";
    } catch (err) {
      if (!(err instanceof AppError) || err.status !== 422) throw err;
      logger.warn("domein: register weigerde de houdergegevens", { domein: b.domein, error: err.message });
      await registerDomain(b.domein, dnsVoorWebsite(b.domein));
      return `Houder: ZekerFlex (het register weigerde de bedrijfsgegevens: ${err.message.slice(0, 120)}). Pas de houder aan in TransIP.`;
    }
  }
  await registerDomain(b.domein, dnsVoorWebsite(b.domein));
  return `Houder: ZekerFlex (${h.reden}).`;
}

/**
 * Leg een betaalde naam vast in het TransIP-account van ZekerFlex, met DNS die
 * naar onze server wijst, en zet hem op geregistreerd (en op de website). Dit
 * maakt bij TransIP een factuur aan ZekerFlex; de klant heeft dan al betaald.
 *   - vanzelf (na betaling, of de dagelijkse ronde): hoogstens
 *     AUTO_REGISTREREN_PER_DAG per dag, daarna wacht hij op de beheerder;
 *   - handmatig (Admin → Domeinen, "Registreer"): geen grens, fouten naar de beheerder.
 * Staat de naam al in ons account (een eerdere poging die half lukte), dan telt
 * dat als vastgelegd. Een testbestelling komt nooit bij het register.
 */
export async function legVast(b: DomeinBestelling, door: string, handmatig: boolean): Promise<VastlegUitkomst> {
  const test = isTestAdres(b.email);
  if (!test && !transipConfigured()) {
    if (handmatig) throw AppError.precondition("De koppeling met TransIP staat nog niet aan (Admin → Te doen). Registreer de naam met de hand in TransIP en vink hem daarna af.");
    return "wacht";
  }
  if (b.status !== "BETAALD" && !(handmatig && b.status === "MISLUKT")) {
    if (handmatig) throw AppError.conflict("Alleen een betaalde bestelling kun je registreren.");
    return "wacht";
  }
  if (bezigMet.has(b.id)) {
    if (handmatig) throw AppError.conflict("Deze naam wordt al geregistreerd. Wacht even en ververs de pagina.");
    return "wacht";
  }
  const dag = amsterdamDayKey(new Date());
  if (!handmatig && !test) {
    const teller = (await kvGet<{ n: number }>(autoTellerKey(dag)))?.n ?? 0;
    if (teller >= AUTO_REGISTREREN_PER_DAG) {
      alertOwnerLater({ key: `domein-grens:${dag}`, title: "Veel domeinnamen vandaag", detail: `Vandaag zijn al ${teller} namen vanzelf vastgelegd. ${b.domein} wacht op jou in Admin → Domeinen (knop Registreer). Controleer of de bestellingen echt zijn.`, severity: "warning", url: "/admin/domeinen" });
      return "wacht";
    }
  }
  bezigMet.add(b.id);
  try {
    let verlooptOp: Date;
    let houder = "";
    if (test) {
      verlooptOp = jaarLater(new Date());
    } else {
      const beschikbaar = await domainAvailability(b.domein).catch(() => null);
      if (beschikbaar && beschikbaar.status !== "inyouraccount") {
        if (beschikbaar.status !== "free") throw new Error(`de naam is niet meer vrij (${beschikbaar.status})`);
        houder = await registreerMetHouder(b);
      } else if (!beschikbaar) {
        houder = await registreerMetHouder(b);
      }
      // verhuizen kan alleen via ZekerFlex (de verhuiscode, lib/domeinen/behoud.ts)
      await setTransferLock(b.domein, true).catch((e: unknown) => logger.warn("domein: verhuisslot zetten lukte niet", { domein: b.domein, error: (e as Error).message }));
      verlooptOp = leesDatum((await domainInfo(b.domein).catch(() => null))?.renewalDate) ?? jaarLater(new Date());
      if (!handmatig) await kvSet(autoTellerKey(dag), { n: ((await kvGet<{ n: number }>(autoTellerKey(dag)))?.n ?? 0) + 1 });
    }
    const hoe = test ? "Testbestelling: niet echt vastgelegd." : handmatig ? "Vastgelegd via TransIP (knop)." : "Vanzelf vastgelegd via TransIP na betaling.";
    await zetStatus(b.id, "GEREGISTREERD", [hoe, houder].filter(Boolean).join(" "), door, { verlooptOp });
    return "vastgelegd";
  } catch (err) {
    if (err instanceof AppError && handmatig) throw err;
    const melding = err instanceof Error ? err.message : String(err);
    logger.warn("domein: vastleggen lukte niet", { domein: b.domein, error: melding });
    if (b.status === "BETAALD") await zetStatus(b.id, "MISLUKT", `Vastleggen lukte niet: ${melding.slice(0, 200)}`, door).catch(() => undefined);
    alertOwnerLater({
      key: `domein-mislukt:${b.id}`,
      title: `Domeinnaam ${b.domein} kon niet worden vastgelegd`,
      detail: `${b.domein} is betaald, maar vastleggen bij TransIP lukte niet: ${melding.slice(0, 200)}. Probeer het opnieuw met Registreer in Admin → Domeinen, of betaal de klant terug als de naam echt bezet is.`,
      severity: "warning",
      url: "/admin/domeinen",
    });
    if (handmatig) throw AppError.upstream(`TransIP: ${melding.slice(0, 200)}`);
    if (b.status === "BETAALD") {
      await sendMail({
        to: b.email,
        kind: "domein-bestelling",
        replyTo: CONTACTS.sales,
        subject: `${b.domein}: we regelen het voor je`,
        text: `Je betaling voor ${b.domein} is binnen. Het vastleggen ging niet in één keer goed; een collega regelt het nu met de hand. Je hoort binnen één werkdag van ons.\n\nHet ZekerFlex-team`,
      }).catch(() => undefined);
    }
    return "mislukt";
  } finally {
    bezigMet.delete(b.id);
  }
}

/** Admin drukt op "Registreer" (ook na een mislukte poging). */
export async function registreerBijTransip(id: string, door: string): Promise<void> {
  const b = await prisma.domeinBestelling.findUnique({ where: { id } });
  if (!b) throw AppError.notFound("Deze bestelling bestaat niet.");
  await legVast(b, door, true);
}

/** Het bedrijf zet een geregistreerde naam later zelf op zijn website ("Koppel aan mijn website"). */
export async function koppelBestelling(tenantId: string, id: string, door: { userId: string; name: string }): Promise<void> {
  const b = await prisma.domeinBestelling.findFirst({ where: { id, tenantId, status: "GEREGISTREERD" }, select: { domein: true } });
  if (!b) throw AppError.notFound("Deze domeinnaam is (nog) niet voor je vastgelegd.");
  const k = await koppelAanSite(tenantId, b.domein, door);
  if (k.soort === "geen-site") throw AppError.notFound("Maak eerst je website in de websitebouwer; daarna koppel je de naam hier.");
  if (k.soort === "ander-domein") throw AppError.conflict(`Je website gebruikt nu ${k.host}. Koppel dat eerst los in de websitebouwer (tab Domein) en probeer het dan opnieuw.`);
}

export { MAG_NAAR };
