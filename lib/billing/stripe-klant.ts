import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";
import { describeMethod } from "@/lib/billing/stripe-overview";
import { haalEvents, type WerkbankEvent } from "@/lib/billing/stripe-werkbank";
import { hoortBijKlant } from "@/lib/billing/stripe-events-tekst";

// ---------------------------------------------------------------------------
// De klantpagina van Stripe in admin: wie is deze klant, wat betaalt of koopt
// hij, welke betaalmethoden en identiteitscontroles horen erbij en wat gebeurde
// er de laatste dagen. Alleen lezen. Elk onderdeel wordt los opgehaald: een
// sleutel zonder leesrechten voor bijvoorbeeld offertes laat de rest staan.
// ---------------------------------------------------------------------------

export interface KlantRij {
  id: string;
  naam: string | null;
  email: string | null;
  aangemaakt: string;
  gebruikerId: string | null;
  doel: string | null;
}

export interface KlantDetail {
  id: string;
  naam: string | null;
  email: string | null;
  bedrijf: string | null;
  aangemaakt: string;
  livemode: boolean;
  /** Saldo op de klantfactuur in centen; negatief is tegoed voor de klant. */
  saldoCenten: number;
  valuta: string;
  metadata: Record<string, string>;
  /** Het gebruikers-id in ZekerFlex als de klant daar via metadata aan hangt. */
  gebruikerId: string | null;
  dashboardUrl: string;
  abonnementen: { id: string; status: string; omschrijving: string; bedragCenten: number; valuta: string; interval: string | null; opzegAanEinde: boolean; gestart: string }[];
  betalingen: { id: string; aangemaakt: string; bedragCenten: number; terugCenten: number; valuta: string; status: "succeeded" | "pending" | "failed"; methode: string; omschrijving: string | null }[];
  betaalmethoden: { id: string; omschrijving: string; aangemaakt: string }[];
  financieleConnecties: { id: string; naam: string; instelling: string | null; laatste4: string | null }[];
  rechten: { id: string; sleutel: string }[];
  facturen: { id: string; nummer: string | null; status: string; bedragCenten: number; valuta: string; aangemaakt: string; url: string | null }[];
  offertes: { id: string; nummer: string | null; status: string; bedragCenten: number; valuta: string; aangemaakt: string }[];
  tegoeden: { id: string; naam: string; bedragCenten: number | null; valuta: string | null; aangemaakt: string }[];
  verificaties: { id: string; status: string; aangemaakt: string; fout: string | null }[];
  events: WerkbankEvent[];
  fouten: string[];
}

const iso = (s: number) => new Date(s * 1000).toISOString();

function foutTekst(onderdeel: string, reden: unknown): string {
  const msg = reden instanceof Error ? reden.message : String(reden);
  return /permission|restricted|does not have/i.test(msg)
    ? `${onderdeel}: de Stripe-sleutel heeft hier geen leesrechten voor.`
    : `${onderdeel}: ${msg}`;
}

function metadataVan(m: Stripe.Metadata | null | undefined): Record<string, string> {
  return m ? { ...m } : {};
}

/** Klanten zoeken: op e-mailadres of naam als er een zoekterm is, anders de nieuwste. */
export async function zoekKlanten(zoek: string): Promise<KlantRij[]> {
  const stripe = getStripeClient();
  const term = zoek.trim().replace(/["\\]/g, "");
  const lijst = term
    ? (await stripe.customers.search({ query: term.includes("@") ? `email:"${term}"` : `name~"${term}"`, limit: 50 })).data
    : (await stripe.customers.list({ limit: 50 })).data;
  return lijst.map((c) => ({
    id: c.id,
    naam: c.name ?? null,
    email: c.email ?? null,
    aangemaakt: iso(c.created),
    gebruikerId: c.metadata?.userId ?? null,
    doel: c.metadata?.purpose ?? null,
  }));
}

export async function getKlant(id: string): Promise<KlantDetail | null> {
  const stripe = getStripeClient();
  let klant: Stripe.Customer;
  try {
    const c = await stripe.customers.retrieve(id);
    if (c.deleted) return null;
    klant = c;
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return null;
    throw err;
  }
  const gebruikerId = klant.metadata?.userId ?? null;

  const [subs, charges, methoden, connecties, rechten, facturen, offertes, tegoeden, verif, events] = await Promise.allSettled([
    stripe.subscriptions.list({ customer: id, status: "all", limit: 20 }),
    stripe.charges.list({ customer: id, limit: 20 }),
    stripe.paymentMethods.list({ customer: id, limit: 20 }),
    stripe.financialConnections.accounts.list({ account_holder: { customer: id }, limit: 20 }),
    stripe.entitlements.activeEntitlements.list({ customer: id, limit: 50 }),
    stripe.invoices.list({ customer: id, limit: 20 }),
    stripe.quotes.list({ customer: id, limit: 20 }),
    stripe.billing.creditGrants.list({ customer: id, limit: 20 }),
    gebruikerId ? stripe.identity.verificationSessions.list({ limit: 100 }) : Promise.resolve(null),
    haalEvents(30, 1000),
  ]);

  const fouten: string[] = [];
  const uit: KlantDetail = {
    id: klant.id,
    naam: klant.name ?? null,
    email: klant.email ?? null,
    bedrijf: klant.business_name ?? null,
    aangemaakt: iso(klant.created),
    livemode: klant.livemode,
    saldoCenten: klant.balance ?? 0,
    valuta: (klant.currency ?? "eur").toLowerCase(),
    metadata: metadataVan(klant.metadata),
    gebruikerId,
    dashboardUrl: `https://dashboard.stripe.com/${klant.livemode ? "" : "test/"}customers/${klant.id}`,
    abonnementen: [],
    betalingen: [],
    betaalmethoden: [],
    financieleConnecties: [],
    rechten: [],
    facturen: [],
    offertes: [],
    tegoeden: [],
    verificaties: [],
    events: [],
    fouten,
  };

  if (subs.status === "fulfilled") {
    uit.abonnementen = subs.value.data.map((s) => {
      const item = s.items.data[0];
      return {
        id: s.id,
        status: s.status,
        omschrijving: s.items.data.map((i) => i.price.nickname ?? (typeof i.price.product === "string" ? i.price.product : i.price.product.id)).join(", "),
        bedragCenten: s.items.data.reduce((som, i) => som + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0),
        valuta: item?.price.currency ?? "eur",
        interval: item?.price.recurring?.interval ?? null,
        opzegAanEinde: s.cancel_at_period_end,
        gestart: iso(s.start_date),
      };
    });
  } else {
    fouten.push(foutTekst("Abonnementen", subs.reason));
  }

  if (charges.status === "fulfilled") {
    uit.betalingen = charges.value.data.map((c) => ({
      id: c.id,
      aangemaakt: iso(c.created),
      bedragCenten: c.amount,
      terugCenten: c.amount_refunded,
      valuta: c.currency,
      status: c.status === "succeeded" ? "succeeded" : c.status === "failed" ? "failed" : "pending",
      methode: describeMethod(c.payment_method_details),
      omschrijving: c.description ?? null,
    }));
  } else {
    fouten.push(foutTekst("Betalingen", charges.reason));
  }

  if (methoden.status === "fulfilled") {
    uit.betaalmethoden = methoden.value.data.map((m) => ({
      id: m.id,
      omschrijving: m.card ? `${m.card.brand} •••• ${m.card.last4}` : m.sepa_debit ? `SEPA-incasso •••• ${m.sepa_debit.last4}` : m.type.replace(/_/g, " "),
      aangemaakt: iso(m.created),
    }));
  } else {
    fouten.push(foutTekst("Betaalmethoden", methoden.reason));
  }

  if (connecties.status === "fulfilled") {
    uit.financieleConnecties = connecties.value.data.map((a) => ({
      id: a.id,
      naam: a.display_name ?? a.id,
      instelling: a.institution_name ?? null,
      laatste4: a.last4 ?? null,
    }));
  } else {
    fouten.push(foutTekst("Financiële connecties", connecties.reason));
  }

  if (rechten.status === "fulfilled") {
    uit.rechten = rechten.value.data.map((r) => ({ id: r.id, sleutel: r.lookup_key }));
  } else {
    fouten.push(foutTekst("Rechten", rechten.reason));
  }

  if (facturen.status === "fulfilled") {
    uit.facturen = facturen.value.data.map((f) => ({
      id: f.id ?? "",
      nummer: f.number ?? null,
      status: f.status ?? "onbekend",
      bedragCenten: f.total,
      valuta: f.currency,
      aangemaakt: iso(f.created),
      url: f.hosted_invoice_url ?? null,
    }));
  } else {
    fouten.push(foutTekst("Facturen", facturen.reason));
  }

  if (offertes.status === "fulfilled") {
    uit.offertes = offertes.value.data.map((q) => ({
      id: q.id,
      nummer: q.number ?? null,
      status: q.status,
      bedragCenten: q.amount_total,
      valuta: q.currency ?? "eur",
      aangemaakt: iso(q.created),
    }));
  } else {
    fouten.push(foutTekst("Citaten", offertes.reason));
  }

  if (tegoeden.status === "fulfilled") {
    uit.tegoeden = tegoeden.value.data.map((g) => ({
      id: g.id,
      naam: g.name ?? g.id,
      bedragCenten: g.amount.monetary?.value ?? null,
      valuta: g.amount.monetary?.currency ?? null,
      aangemaakt: iso(g.created),
    }));
  } else {
    fouten.push(foutTekst("Kredietverlening", tegoeden.reason));
  }

  if (verif.status === "fulfilled") {
    if (verif.value) {
      uit.verificaties = verif.value.data
        .filter((v) => v.metadata?.userId === gebruikerId)
        .map((v) => ({ id: v.id, status: v.status, aangemaakt: iso(v.created), fout: v.last_error?.code ?? null }));
    }
  } else {
    fouten.push(foutTekst("Identiteitsverificaties", verif.reason));
  }

  if (events.status === "fulfilled") {
    uit.events = events.value.filter((e) => hoortBijKlant(e.kern, id) || (uit.verificaties.some((v) => v.id === e.kern.objectId) && e.kern.objectType === "identity.verification_session"));
  } else {
    fouten.push(foutTekst("Evenementen", events.reason));
  }

  return uit;
}
