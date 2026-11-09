import type Stripe from "stripe";
import type { DomeinBestelling, Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { alertOwnerLater } from "@/lib/ops/alert";
import { getStripeClient } from "@/lib/billing/stripe";
import { payUrl } from "@/lib/billing/pay-link";
import { cancelDomain, domainInfo, transipConfigured } from "@/lib/mail/hosting/transip";
import { euroPrijs, extensie } from "@/lib/domeinen/extensies";
import { maakDomeinFactuur } from "@/lib/domeinen/factuur";
import { bewaakDomeinen, kortingVoor, stuurVerhuiscodes, verlengenUitGezet } from "@/lib/domeinen/behoud";
import {
  FACTUUR_DAGEN_VOOR,
  LAATSTE_HERINNERING,
  datumNl,
  isTestAdres,
  jaarLater,
  leesDatum,
  opzegdatum,
  verlengActie,
  vervaldatum,
  type FactuurStand,
} from "@/lib/domeinen/verlengen-core";

// ---------------------------------------------------------------------------
// Domeinnamen elk jaar verlengen (de regels staan in verlengen-core.ts).
// Dagelijks (cron, /api/internal/claims/collections-sweep):
//   - betaalde namen die nog niet vastliggen opnieuw proberen;
//   - 35 dagen vooraf de verlengfactuur (ZekerFlex-factuur, type DOMEIN). Met
//     een opgeslagen betaalmethode (kaart of SEPA-incasso, bewaard bij de eerste
//     betaling) schrijven we hem af; anders krijgt de klant een betaallink;
//   - herinneringen, en 7 dagen vooraf opzeggen bij het register als er niet
//     betaald is (dan betaalt ZekerFlex geen verlenging die de klant niet betaalt);
//   - lopende incasso's nakijken (SEPA duurt een paar dagen).
// Betaald (betaallink → webhook, of incasso) = de verlooptdatum schuift een jaar op.
// De klant ziet alleen ZekerFlex; het register noemen we nergens.
//   KV domein-verlenging:<bestelling>:<verloopdag> → { invoiceId }   de factuur voor die periode
//   KV domein-herinnering:<factuur> → { stap, at }                  laatst verstuurde herinnering
//   KV domein-verlengd:<factuur> → { op }                            al verwerkt (dubbel = niets)
// ---------------------------------------------------------------------------

const periodeKey = (bestellingId: string, verlooptOp: Date) => `domein-verlenging:${bestellingId}:${verlooptOp.toISOString().slice(0, 10)}`;
const herinneringKey = (invoiceId: string) => `domein-herinnering:${invoiceId}`;
const verlengdKey = (invoiceId: string) => `domein-verlengd:${invoiceId}`;
const incassoMisluktKey = (invoiceId: string) => `domein-incasso-mislukt:${invoiceId}`;

const DAG = 86_400_000;

async function mail(b: Pick<DomeinBestelling, "email" | "domein">, onderwerp: string, tekst: string): Promise<void> {
  await sendMail({ to: b.email, kind: "domein-verlenging", replyTo: CONTACTS.sales, subject: onderwerp, text: `${tekst}\n\nVragen? Antwoord gewoon op deze mail.\n\nHet ZekerFlex-team` }).catch((e) =>
    logger.warn("domein: mail mislukt", { domein: b.domein, error: (e as Error).message }),
  );
}

/** De prijs van een jaar verlengen, excl. btw (de verlengprijs uit dezelfde lijst als bij bestellen). */
export function verlengPrijsCent(b: Pick<DomeinBestelling, "domein" | "prijsCent">): number {
  const tld = b.domein.slice(b.domein.lastIndexOf(".") + 1);
  return extensie(tld)?.verlengCent ?? b.prijsCent;
}

async function verlengFactuur(b: DomeinBestelling): Promise<Invoice | null> {
  if (!b.verlooptOp) return null;
  const rec = await kvGet<{ invoiceId: string }>(periodeKey(b.id, b.verlooptOp));
  if (!rec) return null;
  return prisma.invoice.findUnique({ where: { id: rec.invoiceId } });
}

// ---- automatisch afschrijven -------------------------------------------------

/** De betaalmethode die we mogen gebruiken: de standaard van de klant, die van het websiteabonnement, of de nieuwste SEPA-machtiging of kaart. */
async function betaalmethode(stripe: Stripe, customerId: string, tenantId: string): Promise<Stripe.PaymentMethod | null> {
  const klant = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
  if (!("deleted" in klant && klant.deleted)) {
    const pm = (klant as Stripe.Customer).invoice_settings?.default_payment_method;
    if (pm && typeof pm !== "string") return pm;
  }
  const site = await prisma.managedWebsite.findUnique({ where: { tenantId }, select: { stripeSubId: true } });
  if (site?.stripeSubId) {
    const sub = await stripe.subscriptions.retrieve(site.stripeSubId, { expand: ["default_payment_method"] }).catch(() => null);
    const pm = sub?.default_payment_method;
    if (pm && typeof pm !== "string") return pm;
  }
  for (const type of ["sepa_debit", "card"] as const) {
    const lijst = await stripe.paymentMethods.list({ customer: customerId, type, limit: 5 });
    const nu = new Date();
    const bruikbaar = lijst.data.find((pm) => type !== "card" || !pm.card || new Date(Date.UTC(pm.card.exp_year, pm.card.exp_month, 1)) > nu);
    if (bruikbaar) return bruikbaar;
  }
  return null;
}

/** Probeer de verlengfactuur af te schrijven. true = afgeschreven of onderweg (SEPA), false = geen betaalmethode of geweigerd. */
async function probeerIncasso(invoice: Invoice, b: DomeinBestelling): Promise<boolean> {
  if (isTestAdres(b.email)) return false;
  const tenant = await prisma.tenant.findUnique({ where: { id: b.tenantId }, select: { stripeCustomerId: true } });
  if (!tenant?.stripeCustomerId) return false;
  try {
    const stripe = getStripeClient();
    const pm = await betaalmethode(stripe, tenant.stripeCustomerId, b.tenantId);
    if (!pm) return false;
    const pi = await stripe.paymentIntents.create(
      {
        amount: invoice.totalCents,
        currency: "eur",
        customer: tenant.stripeCustomerId,
        payment_method: pm.id,
        payment_method_types: [pm.type],
        off_session: true,
        confirm: true,
        description: `Verlenging domeinnaam ${b.domein} (factuur ${invoice.number})`,
        metadata: { invoiceId: invoice.id, domeinBestellingId: b.id },
      },
      { idempotencyKey: `domein-incasso-${invoice.id}` },
    );
    await prisma.invoice.update({ where: { id: invoice.id }, data: { stripePaymentIntentId: pi.id } });
    if (pi.status === "succeeded") await domeinFactuurBetaald(invoice.id);
    return pi.status === "succeeded" || pi.status === "processing";
  } catch (err) {
    logger.warn("domein: automatisch afschrijven lukte niet", { domein: b.domein, error: (err as Error).message });
    return false;
  }
}

/** Lopende incasso's nakijken: SEPA is na een paar dagen gelukt of geweigerd. */
async function incassosNakijken(): Promise<{ betaald: number; mislukt: number }> {
  const open = await prisma.invoice.findMany({ where: { type: "DOMEIN", status: "ISSUED", stripePaymentIntentId: { not: null } }, take: 200 });
  let betaald = 0;
  let mislukt = 0;
  for (const inv of open) {
    try {
      const pi = await getStripeClient().paymentIntents.retrieve(inv.stripePaymentIntentId as string);
      if (pi.status === "succeeded") {
        await domeinFactuurBetaald(inv.id);
        betaald += 1;
      } else if (pi.status === "requires_payment_method" || pi.status === "canceled") {
        await prisma.invoice.update({ where: { id: inv.id }, data: { stripePaymentIntentId: null } });
        mislukt += 1;
        const b = inv.domeinBestellingId ? await prisma.domeinBestelling.findUnique({ where: { id: inv.domeinBestellingId } }) : null;
        if (b && !(await kvGet(incassoMisluktKey(inv.id)))) {
          await kvSet(incassoMisluktKey(inv.id), { op: new Date().toISOString() });
          await mail(
            b,
            `Betaling voor ${b.domein} is niet gelukt`,
            `De automatische betaling voor de verlenging van ${b.domein} (${euroPrijs(inv.totalCents)} incl. btw, factuur ${inv.number}) is niet gelukt.\n\nBetaal hem hier, dan blijft je domeinnaam gewoon werken:\n${payUrl(inv.id)}`,
          );
        }
      }
    } catch (err) {
      logger.warn("domein: incasso nakijken lukte niet", { invoiceId: inv.id, error: (err as Error).message });
    }
  }
  return { betaald, mislukt };
}

// ---- betaald -------------------------------------------------------------------

/**
 * Een domeinfactuur is betaald (webhook van de betaallink, of de incasso).
 * Is het de verlengfactuur voor de lopende periode, dan schuift de verlooptdatum
 * een jaar op. Dubbel aanroepen doet niets dubbel.
 */
export async function domeinFactuurBetaald(invoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, number: true, type: true, status: true, domeinBestellingId: true, totalCents: true } });
  if (!inv || inv.type !== "DOMEIN" || !inv.domeinBestellingId) return;
  if (inv.status === "ISSUED") await prisma.invoice.updateMany({ where: { id: inv.id, status: "ISSUED" }, data: { status: "PAID", paidAt: new Date() } });
  if (await kvGet(verlengdKey(inv.id))) return;
  const b = await prisma.domeinBestelling.findUnique({ where: { id: inv.domeinBestellingId } });
  if (!b?.verlooptOp) return;
  const rec = await kvGet<{ invoiceId: string }>(periodeKey(b.id, b.verlooptOp));
  if (rec?.invoiceId !== inv.id) return; // de factuur van het eerste jaar, of een oude periode
  await kvSet(verlengdKey(inv.id), { op: new Date().toISOString() });
  await kvDelete(herinneringKey(inv.id)).catch(() => undefined);
  await recordAudit({ category: "BILLING", action: "domein.verlengd", actorLabel: "integration:stripe", summary: `${b.domein} verlengd (factuur ${inv.number} betaald)`, targetType: "domein-bestelling", targetId: b.id }).catch((err: unknown) => logger.warn("domein verlengd: auditregel schrijven mislukt", { bestellingId: b.id, error: (err as Error).message }));

  if (b.status === "OPGEZEGD") {
    // te laat betaald: de betaling dekt het volgende jaar, maar de opzegging moet worden
    // ingetrokken; dat doet een mens (daarna in Admin → Domeinen "Opzegging ingetrokken")
    await prisma.domeinBestelling.update({ where: { id: b.id }, data: { verlooptOp: jaarLater(b.verlooptOp), autoVerlengen: true } });
    alertOwnerLater({
      key: `domein-terug:${b.id}`,
      title: `${b.domein} betaald na opzeggen`,
      detail: `De klant betaalde factuur ${inv.number} nadat ${b.domein} was opgezegd. Trek de opzegging in bij TransIP (vóór ${datumNl(b.verlooptOp)}) en zet de bestelling in Admin → Domeinen terug.`,
      severity: "warning",
      url: "/admin/domeinen",
    });
    await mail(b, `Betaling voor ${b.domein} ontvangen`, `Bedankt, we hebben je betaling voor ${b.domein} ontvangen. De naam was al opgezegd; we zetten hem voor je terug en laten het je binnen één werkdag weten.`);
    return;
  }
  const nieuw = jaarLater(b.verlooptOp);
  await prisma.domeinBestelling.update({ where: { id: b.id }, data: { verlooptOp: nieuw } });
  await mail(b, `${b.domein} is verlengd`, `Bedankt voor je betaling. ${b.domein} is verlengd tot ${datumNl(nieuw)}.\n\nJe factuur (${inv.number}) staat in ZekerFlex onder Facturen.`);
}

// ---- opzeggen --------------------------------------------------------------------

async function zegOp(b: DomeinBestelling, reden: "onbetaald" | "op-verzoek", factuur: Invoice | null): Promise<void> {
  const verloopt = b.verlooptOp ?? new Date();
  let notitie = reden === "onbetaald" ? "Opgezegd: verlenging niet betaald." : "Opgezegd: klant wilde niet verlengen.";
  if (isTestAdres(b.email)) notitie += " (testbestelling, niet bij het register)";
  else if (!transipConfigured()) {
    notitie += " Nog met de hand opzeggen bij TransIP.";
    alertOwnerLater({ key: `domein-opzeggen:${b.id}`, title: `Zeg ${b.domein} op bij TransIP`, detail: `${b.domein} moet vóór ${datumNl(verloopt)} worden opgezegd (${reden === "onbetaald" ? "niet betaald" : "klant wil niet verlengen"}). De koppeling met TransIP staat uit, dus doe het met de hand.`, severity: "warning", url: "/admin/domeinen" });
  } else {
    try {
      await cancelDomain(b.domein);
    } catch (err) {
      notitie += " Opzeggen bij TransIP lukte niet; doe het met de hand.";
      alertOwnerLater({ key: `domein-opzeggen:${b.id}`, title: `Opzeggen van ${b.domein} lukte niet`, detail: `Zeg ${b.domein} vóór ${datumNl(verloopt)} met de hand op bij TransIP. Fout: ${(err as Error).message}`, severity: "warning", url: "/admin/domeinen" });
    }
  }
  const { count } = await prisma.domeinBestelling.updateMany({ where: { id: b.id, status: "GEREGISTREERD" }, data: { status: "OPGEZEGD", opgezegdOp: new Date(), notitie: `${b.notitie} ${notitie}`.trim() } });
  if (count !== 1) return;
  if (factuur?.status === "ISSUED") await prisma.invoice.updateMany({ where: { id: factuur.id, status: "ISSUED" }, data: { status: "CANCELLED" } });
  await recordAudit({ category: "BILLING", action: "domein.opgezegd", actorLabel: "system:domein-verlengen", summary: `${b.domein} opgezegd (${reden})`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
  await mail(
    b,
    `${b.domein} wordt niet verlengd`,
    reden === "onbetaald"
      ? `We hebben de verlenging van ${b.domein} niet ontvangen. Daarom hebben we de naam opgezegd. Hij werkt nog tot ${datumNl(verloopt)}; daarna komt hij vrij voor anderen.\n\nWil je hem toch houden? Antwoord dan vóór ${datumNl(verloopt)} op deze mail.`
      : `Zoals je aangaf, verlengen we ${b.domein} niet. De naam werkt nog tot ${datumNl(verloopt)}; daarna komt hij vrij voor anderen.\n\nToch houden? Antwoord vóór ${datumNl(verloopt)} op deze mail.`,
  );
}

// ---- de dagelijkse ronde -------------------------------------------------------------

async function maakVerlenging(b: DomeinBestelling & { verlooptOp: Date }): Promise<{ afgeschreven: boolean }> {
  const factuur = await maakDomeinFactuur({
    bestelling: b,
    soort: "verlenging",
    // het blijfaanbod (lib/domeinen/behoud.ts) geldt voor deze ene verlenging
    exclCent: (await kortingVoor(b)) ?? verlengPrijsCent(b),
    periodeVan: b.verlooptOp,
    periodeTot: jaarLater(b.verlooptOp),
    betaald: null,
    dueAt: vervaldatum(b.verlooptOp),
  });
  await kvSet(periodeKey(b.id, b.verlooptOp), { invoiceId: factuur.id });
  const afgeschreven = await probeerIncasso(factuur, b);
  await mail(
    b,
    `Verlenging van ${b.domein}`,
    afgeschreven
      ? `${b.domein} loopt tot ${datumNl(b.verlooptOp)} en wordt voor een jaar verlengd. We schrijven ${euroPrijs(factuur.totalCents)} incl. btw (factuur ${factuur.number}) af via je opgeslagen betaalmethode; je hoeft niets te doen.\n\nWil je hem niet verlengen? Zet "Automatisch verlengen" uit bij Jouw domeinnamen.`
      : `${b.domein} loopt tot ${datumNl(b.verlooptOp)}. Verlengen voor een jaar kost ${euroPrijs(factuur.totalCents)} incl. btw (factuur ${factuur.number}).\n\nBetaal vóór ${datumNl(vervaldatum(b.verlooptOp))} met iDEAL of je kaart:\n${payUrl(factuur.id)}\n\nWil je hem niet verlengen? Zet "Automatisch verlengen" uit bij Jouw domeinnamen; dan krijg je geen herinneringen.`,
  );
  return { afgeschreven };
}

async function herinner(b: DomeinBestelling & { verlooptOp: Date }, factuur: Invoice, stap: number): Promise<void> {
  await kvSet(herinneringKey(factuur.id), { stap, at: new Date().toISOString() });
  const laatste = stap >= LAATSTE_HERINNERING;
  await mail(
    b,
    laatste ? `Laatste herinnering: ${b.domein} wordt opgezegd` : `Herinnering: verlenging van ${b.domein}`,
    laatste
      ? `We hebben de verlenging van ${b.domein} (factuur ${factuur.number}, ${euroPrijs(factuur.totalCents)} incl. btw) nog niet ontvangen. Betaal je niet vóór ${datumNl(opzegdatum(b.verlooptOp))}, dan zeggen we de naam op en komt hij op ${datumNl(b.verlooptOp)} vrij voor anderen.\n\nBetaal hier met iDEAL of je kaart:\n${payUrl(factuur.id)}`
      : `De verlenging van ${b.domein} (factuur ${factuur.number}, ${euroPrijs(factuur.totalCents)} incl. btw) staat nog open. De naam loopt tot ${datumNl(b.verlooptOp)}.\n\nBetaal hier met iDEAL of je kaart:\n${payUrl(factuur.id)}`,
  );
}

export interface VerlengRonde {
  vastgelegd: number;
  facturen: number;
  afgeschreven: number;
  herinneringen: number;
  opgezegd: number;
  incassoBetaald: number;
  incassoMislukt: number;
  verhuiscodes: number;
  bewaking: Awaited<ReturnType<typeof bewaakDomeinen>> | null;
  fouten: number;
}

/**
 * De dagelijkse ronde. `alleenTest`: alleen testbestellingen (testadressen); zo kan
 * een livetest met een andere datum (`nu`) nooit een echte klant een factuur,
 * afschrijving of opzegging bezorgen.
 */
export async function runDomeinVerlengingen(nu = new Date(), opties: { alleenTest?: boolean } = {}): Promise<VerlengRonde> {
  const r: VerlengRonde = { vastgelegd: 0, facturen: 0, afgeschreven: 0, herinneringen: 0, opgezegd: 0, incassoBetaald: 0, incassoMislukt: 0, verhuiscodes: 0, bewaking: null, fouten: 0 };
  const mag = (b: { email: string }) => !opties.alleenTest || isTestAdres(b.email);

  // 1. betaald maar nog niet vastgelegd (register even niet bereikbaar, of de dagelijkse grens)
  const { legVast } = await import("@/lib/domeinen/bestelling");
  const blijven = await prisma.domeinBestelling.findMany({ where: { status: "BETAALD", betaaldOp: { lt: new Date(nu.getTime() - 15 * 60_000) } }, take: 50 });
  for (const b of blijven.filter(mag)) {
    if ((await legVast(b, "systeem:domein-verlengen", false).catch(() => "mislukt")) === "vastgelegd") r.vastgelegd += 1;
  }

  // 2. vastgelegde namen zonder verlooptdatum: bij het register opvragen
  const zonder = await prisma.domeinBestelling.findMany({ where: { status: "GEREGISTREERD", verlooptOp: null }, take: 100 });
  for (const b of zonder.filter(mag)) {
    let datum: Date | null = null;
    if (!isTestAdres(b.email) && transipConfigured()) datum = leesDatum((await domainInfo(b.domein).catch(() => null))?.renewalDate);
    await prisma.domeinBestelling.update({ where: { id: b.id }, data: { verlooptOp: datum ?? jaarLater(b.afgerondOp ?? b.betaaldOp ?? b.createdAt) } });
  }

  // 3. lopende incasso's (een proefronde raakt geen echte betalingen)
  if (!opties.alleenTest) {
    const inc = await incassosNakijken();
    r.incassoBetaald = inc.betaald;
    r.incassoMislukt = inc.mislukt;
  }

  // 4. verlengen, herinneren, opzeggen
  const binnenkort = await prisma.domeinBestelling.findMany({
    where: { status: "GEREGISTREERD", verlooptOp: { not: null, lte: new Date(nu.getTime() + (FACTUUR_DAGEN_VOOR + 1) * DAG) } },
    orderBy: { verlooptOp: "asc" },
    take: 500,
  });
  for (const b0 of binnenkort.filter(mag)) {
    const b = b0 as DomeinBestelling & { verlooptOp: Date };
    try {
      const factuur = await verlengFactuur(b);
      const stap = factuur ? ((await kvGet<{ stap: number }>(herinneringKey(factuur.id)))?.stap ?? 0) : 0;
      const actie = verlengActie({ verlooptOp: b.verlooptOp, autoVerlengen: b.autoVerlengen, factuur: (factuur?.status ?? null) as FactuurStand | null, herinneringStap: stap, nu });
      if (actie.soort === "factuur") {
        const { afgeschreven } = await maakVerlenging(b);
        r.facturen += 1;
        if (afgeschreven) r.afgeschreven += 1;
      } else if (actie.soort === "herinnering" && factuur) {
        // een incasso die nog loopt (SEPA) krijgt geen herinnering
        if (factuur.stripePaymentIntentId) continue;
        await herinner(b, factuur, actie.stap);
        r.herinneringen += 1;
      } else if (actie.soort === "opzeggen") {
        if (factuur?.stripePaymentIntentId) continue;
        await zegOp(b, actie.reden, factuur);
        r.opgezegd += 1;
      }
    } catch (err) {
      r.fouten += 1;
      logger.error("domein: verlengen mislukt", { domein: b.domein, error: (err as Error).message });
    }
  }
  // 5. verhuiscodes waarvan de wachttijd om is, en (niet in een proefronde) alle namen bewaken
  r.verhuiscodes = await stuurVerhuiscodes(nu, opties).catch((err: unknown) => {
    r.fouten += 1;
    logger.error("domein: verhuiscodes mislukt", { error: (err as Error).message });
    return 0;
  });
  if (!opties.alleenTest) {
    r.bewaking = await bewaakDomeinen(nu).catch((err: unknown) => {
      r.fouten += 1;
      logger.error("domein: bewaken mislukt", { error: (err as Error).message });
      return null;
    });
  }
  if (r.fouten > 0) {
    alertOwnerLater({ key: "domein-verlengen-fouten", title: "Domeinnamen verlengen: fouten", detail: `${r.fouten} domeinnaam/namen konden vandaag niet worden verwerkt. Zie Admin → Systeem → Foutmeldingen.`, severity: "warning", url: "/admin/domeinen" });
  }
  return r;
}

// ---- de klant kiest ----------------------------------------------------------------

/**
 * "Automatisch verlengen" aan of uit. Uit: een open verlengfactuur vervalt, de
 * naam wordt 7 dagen voor de verlengdatum opgezegd, de eigenaar krijgt meteen
 * een melding en de klant het blijfaanbod (terug als { aanbod }).
 */
export async function zetAutoVerlengen(tenantId: string, id: string, aan: boolean): Promise<{ aanbod: { normaal: string; aanbod: string } | null }> {
  const b = await prisma.domeinBestelling.findFirst({ where: { id, tenantId } });
  if (!b) throw AppError.notFound("Deze domeinnaam is niet van jouw bedrijf.");
  if (b.status === "OPGEZEGD") throw AppError.conflict(`${b.domein} is al opgezegd. Wil je hem toch houden? Mail ons via sales@zekerflex.com.`);
  if (b.status !== "GEREGISTREERD" && b.status !== "BETAALD") throw AppError.conflict("Deze domeinnaam is nog niet vastgelegd.");
  await prisma.domeinBestelling.update({ where: { id: b.id }, data: { autoVerlengen: aan } });
  if (!aan) {
    const factuur = await verlengFactuur(b);
    if (factuur?.status === "ISSUED" && !factuur.stripePaymentIntentId) await prisma.invoice.updateMany({ where: { id: factuur.id, status: "ISSUED" }, data: { status: "CANCELLED" } });
  }
  await recordAudit({ category: "BILLING", action: "domein.auto-verlengen", actorLabel: "user", summary: `${b.domein}: automatisch verlengen ${aan ? "aan" : "uit"}`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
  return { aanbod: aan || b.status !== "GEREGISTREERD" ? null : await verlengenUitGezet(b) };
}

export interface VerlengStand {
  verlooptOp: string | null;
  autoVerlengen: boolean;
  /** de open verlengfactuur, met de betaallink */
  open: { nummer: string; bedragCent: number; betaalUrl: string; uiterlijk: string | null; incassoLoopt: boolean } | null;
}

/** Voor "Jouw domeinnamen": tot wanneer, verlengen aan/uit en een open factuur. */
export async function verlengStanden(tenantId: string): Promise<Map<string, VerlengStand>> {
  const rijen = await prisma.domeinBestelling.findMany({ where: { tenantId, status: { in: ["GEREGISTREERD", "OPGEZEGD", "BETAALD"] } }, take: 50 });
  const open = await prisma.invoice.findMany({
    where: { type: "DOMEIN", status: "ISSUED", domeinBestellingId: { in: rijen.map((b) => b.id) } },
    select: { id: true, number: true, totalCents: true, dueAt: true, domeinBestellingId: true, stripePaymentIntentId: true },
  });
  const m = new Map<string, VerlengStand>();
  for (const b of rijen) {
    const f = open.find((i) => i.domeinBestellingId === b.id);
    m.set(b.id, {
      verlooptOp: b.verlooptOp?.toISOString() ?? null,
      autoVerlengen: b.autoVerlengen,
      open: f ? { nummer: f.number, bedragCent: f.totalCents, betaalUrl: payUrl(f.id), uiterlijk: f.dueAt?.toISOString() ?? null, incassoLoopt: Boolean(f.stripePaymentIntentId) } : null,
    });
  }
  return m;
}
