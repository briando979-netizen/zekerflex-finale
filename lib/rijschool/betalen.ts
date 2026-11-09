import type Stripe from "stripe";
import { Prisma, type Rijschool, type RijschoolLeerling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe";
import { maakAccountMetKvk } from "@/lib/billing/stripe-bedrijf";
import { betalingOntvangenMail, siteUrl, verstuur } from "@/lib/rijschool/mail";

// ---------------------------------------------------------------------------
// Online betalen bij een rijschool (iDEAL). De rijschool koppelt haar eigen
// Stripe-account (Connect Express); het lesgeld gaat rechtstreeks naar haar
// bankrekening, niet via ZekerFlex. Per betaling houdt ZekerFlex alleen de
// iDEAL-kosten in die Stripe rekent (doorberekend, geen marge).
//
// Betaald = de Stripe-webhook (app/api/webhooks/stripe), nooit de terugkeer
// naar de app. Een pakket wordt pas een betaling als het geld binnen is; de
// unieke stripeSessionId en betalingId op het tegoed voorkomen dubbel boeken.
// ---------------------------------------------------------------------------

/** Wat Stripe per iDEAL-betaling rekent; ZekerFlex rekent het door, zonder marge. */
export const IDEAL_KOSTEN_CENT = 29;

type Stand = { klaar: boolean; ingevuld: boolean; tot: number };

function standen(): Map<string, Stand> {
  const g = globalThis as typeof globalThis & { __zfRijschoolStripe?: Map<string, Stand> };
  g.__zfRijschoolStripe ??= new Map();
  return g.__zfRijschoolStripe;
}

/** Kan deze rijschool online betalingen ontvangen? Kort bewaard, zodat niet elke pagina Stripe vraagt. */
export async function stripeStand(r: Pick<Rijschool, "stripeAccountId">, vers = false): Promise<{ gekoppeld: boolean; klaar: boolean; ingevuld: boolean }> {
  const id = r.stripeAccountId;
  if (!id) return { gekoppeld: false, klaar: false, ingevuld: false };
  const bewaard = standen().get(id);
  if (!vers && bewaard && bewaard.tot > Date.now()) return { gekoppeld: true, klaar: bewaard.klaar, ingevuld: bewaard.ingevuld };
  try {
    const a = await getStripeClient().accounts.retrieve(id);
    const s: Stand = { klaar: Boolean(a.charges_enabled && a.payouts_enabled), ingevuld: Boolean(a.details_submitted), tot: Date.now() + 5 * 60_000 };
    standen().set(id, s);
    return { gekoppeld: true, klaar: s.klaar, ingevuld: s.ingevuld };
  } catch (err) {
    logger.warn("rijschool: Stripe-stand niet gelezen", { error: err instanceof Error ? err.message : String(err) });
    return { gekoppeld: true, klaar: false, ingevuld: false };
  }
}

export const onlineBetalenAan = async (r: Pick<Rijschool, "stripeAccountId">) => (await stripeStand(r)).klaar;

/** Gereserveerde testadressen (RFC 2606/6761): daarvoor nooit een echt (live) Stripe-object. */
export const isTestAdres = (email: string) => /@(?:[^@\s]+\.)*(?:[^@\s.]+\.(?:test|example|invalid|localhost)|example\.(?:com|net|org))$/i.test(email.trim());

/** Maakt (eenmalig) het Stripe-account van de rijschool en geeft de link om het in te vullen. Alleen na een klik van de beheerder. */
export async function koppelStripe(r: Rijschool, door: { email: string }): Promise<string> {
  // een test (tijdelijk bedrijf, .test/.example-adressen) maakt nooit een live Stripe-account aan
  if (isTestAdres(door.email) || (r.email && isTestAdres(r.email))) {
    throw AppError.precondition("Dit is een testaccount: ZekerFlex maakt hiervoor geen Stripe-account aan.");
  }
  try {
    return await koppel(r);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const m = err instanceof Error ? err.message : String(err);
    logger.warn("rijschool: Stripe koppelen mislukt", { rijschoolId: r.id, error: m });
    // "You must complete your platform profile to use Connect" / "signed up for Connect": eigenaarstap (Admin → Te doen)
    throw AppError.upstream(
      /platform profile|signed up for Connect|\bConnect\b/.test(m)
        ? "Online betalen kan nog niet: ZekerFlex moet dit eerst bij Stripe aanzetten. Dat staat op de lijst; probeer het later opnieuw."
        : "Stripe gaf een fout bij het koppelen. Probeer het over een paar minuten opnieuw.",
    );
  }
}

async function koppel(r: Rijschool): Promise<string> {
  const stripe = getStripeClient();
  let id = r.stripeAccountId;
  if (!id) {
    // met de KvK-gegevens alvast ingevuld, zodat de rijschool die bij Stripe niet opnieuw typt
    const a = await maakAccountMetKvk(stripe, {
      type: "express",
      country: "NL",
      ...(r.email ? { email: r.email } : {}),
      business_profile: {
        name: r.naam,
        url: siteUrl(r),
        mcc: "8299", // scholen en opleidingen
        product_description: "Rijlessen en lespakketten",
      },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true }, ideal_payments: { requested: true } },
      metadata: { rijschoolId: r.id },
    }, r.tenantId);
    id = a.id;
    // alleen zetten als er nog niets stond: twee keer tegelijk klikken mag geen tweede account opleveren
    const gezet = await prisma.rijschool.updateMany({ where: { id: r.id, stripeAccountId: null }, data: { stripeAccountId: id } });
    if (gezet.count === 0) {
      await stripe.accounts.del(id).catch(() => undefined);
      id = (await prisma.rijschool.findUniqueOrThrow({ where: { id: r.id }, select: { stripeAccountId: true } })).stripeAccountId!;
    }
  }
  standen().delete(id);
  const terug = `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/rijschool?tab=betalingen`;
  const link = await stripe.accountLinks.create({ account: id, type: "account_onboarding", return_url: `${terug}&stripe=terug`, refresh_url: `${terug}&stripe=opnieuw` });
  return link.url;
}

/** Het Stripe-dashboard van de rijschool (uitbetalingen, bankrekening). */
export async function stripeDashboard(r: Pick<Rijschool, "stripeAccountId">): Promise<string> {
  if (!r.stripeAccountId) throw AppError.precondition("Koppel eerst je Stripe-account.");
  return (await getStripeClient().accounts.createLoginLink(r.stripeAccountId)).url;
}

/**
 * Start een iDEAL-betaling voor een pakket of een openstaande betaling van deze
 * leerling. Geeft het adres van de betaalpagina van Stripe.
 */
export async function startIdeal(
  r: Rijschool,
  l: Pick<RijschoolLeerling, "id" | "email" | "naam">,
  wat: { productId: string; ookVerborgen?: boolean } | { betalingId: string },
  terugPad: string,
  /** https://<eigen domein> als de leerling daar zit (lib/rijschool/domein.ts); anders zekerflex.com/rijschool/<naam> */
  adres: string | null = null,
): Promise<string> {
  if (!r.stripeAccountId || !(await onlineBetalenAan(r))) throw AppError.precondition("Online betalen staat nog niet aan bij deze rijschool.");
  let omschrijving: string;
  let bedragCent: number;
  let metadata: Record<string, string>;
  if ("productId" in wat) {
    // een leerling koopt alleen zichtbare pakketten; de instructeur mag ook een verborgen pakket aanbieden
    const p = await prisma.rijschoolProduct.findFirst({ where: { id: wat.productId, rijschoolId: r.id, ...(wat.ookVerborgen ? {} : { zichtbaar: true }) } });
    if (!p) throw AppError.notFound("Dit pakket bestaat niet (meer).");
    omschrijving = p.naam;
    bedragCent = p.prijsCent;
    metadata = { rijschoolId: r.id, leerlingId: l.id, productId: p.id };
  } else {
    const b = await prisma.rijschoolBetaling.findFirst({ where: { id: wat.betalingId, leerlingId: l.id, rijschoolId: r.id } });
    if (!b) throw AppError.notFound("Deze betaling bestaat niet.");
    if (b.status === "BETAALD") throw AppError.conflict("Deze betaling is al betaald.");
    omschrijving = b.omschrijving;
    bedragCent = b.bedragCent;
    metadata = { rijschoolId: r.id, leerlingId: l.id, rijschoolBetalingId: b.id };
  }
  if (bedragCent < 100) throw AppError.validation("Online betalen kan vanaf € 1.");
  const sessie = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["ideal"],
    locale: "nl",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: bedragCent, product_data: { name: `${omschrijving} · ${r.naam}`.slice(0, 250) } } }],
    customer_email: l.email,
    metadata,
    payment_intent_data: {
      description: `${r.naam}: ${omschrijving}`.slice(0, 250),
      on_behalf_of: r.stripeAccountId,
      transfer_data: { destination: r.stripeAccountId },
      application_fee_amount: IDEAL_KOSTEN_CENT,
      metadata,
    },
    success_url: `${adres ?? siteUrl(r)}${terugPad}?betaling=gelukt`,
    cancel_url: `${adres ?? siteUrl(r)}${terugPad}?betaling=geannuleerd`,
  });
  if (!sessie.url) throw AppError.upstream("Stripe gaf geen betaalpagina terug.");
  if ("betalingId" in wat) await prisma.rijschoolBetaling.update({ where: { id: wat.betalingId }, data: { stripeSessionId: sessie.id } }).catch(() => undefined);
  return sessie.url;
}

/**
 * Verwerkt een betaalde Checkout Session van een rijschool (vanuit de webhook).
 * Dubbel aanroepen boekt niets dubbel. true = herkend als rijschoolbetaling.
 */
export async function verwerkRijschoolSessie(session: Stripe.Checkout.Session): Promise<boolean> {
  const m = session.metadata ?? {};
  if (!m.rijschoolId || !m.leerlingId) return false;
  if (session.payment_status !== "paid") return true; // iDEAL bevestigt soms later (async_payment_succeeded)
  const [r, l] = await Promise.all([
    prisma.rijschool.findUnique({ where: { id: m.rijschoolId } }),
    prisma.rijschoolLeerling.findFirst({ where: { id: m.leerlingId, rijschoolId: m.rijschoolId } }),
  ]);
  if (!r || !l) {
    logger.warn("rijschool: betaalde sessie zonder rijschool of leerling", { sessionId: session.id });
    return true;
  }
  const bedragCent = session.amount_total ?? 0;
  let nieuw = false;
  let omschrijving = "";
  try {
    await prisma.$transaction(async (tx) => {
      if (m.rijschoolBetalingId) {
        const b = await tx.rijschoolBetaling.findFirst({ where: { id: m.rijschoolBetalingId, leerlingId: l.id } });
        if (!b || b.status === "BETAALD") return;
        await tx.rijschoolBetaling.update({ where: { id: b.id }, data: { status: "BETAALD", methode: "IDEAL", betaaldOm: new Date(), stripeSessionId: session.id } });
        omschrijving = b.omschrijving;
        nieuw = true;
        const p = b.productId ? await tx.rijschoolProduct.findUnique({ where: { id: b.productId } }) : null;
        if (p && p.lessen > 0) await tx.rijschoolTegoed.create({ data: { leerlingId: l.id, betalingId: b.id, minuten: p.lessen * p.lesMinuten, omschrijving: p.naam, door: "iDEAL" } });
        return;
      }
      const p = m.productId ? await tx.rijschoolProduct.findFirst({ where: { id: m.productId, rijschoolId: r.id } }) : null;
      omschrijving = p?.naam ?? "Online betaling";
      const b = await tx.rijschoolBetaling.create({
        data: { rijschoolId: r.id, leerlingId: l.id, productId: p?.id ?? null, omschrijving, bedragCent, status: "BETAALD", methode: "IDEAL", betaaldOm: new Date(), stripeSessionId: session.id },
      });
      nieuw = true;
      if (p && p.lessen > 0) await tx.rijschoolTegoed.create({ data: { leerlingId: l.id, betalingId: b.id, minuten: p.lessen * p.lesMinuten, omschrijving: p.naam, door: "iDEAL" } });
    });
  } catch (err) {
    // dezelfde sessie al verwerkt (unieke stripeSessionId): niets doen
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return true;
    throw err;
  }
  if (nieuw) {
    logger.info("rijschool: iDEAL-betaling verwerkt", { rijschoolId: r.id, sessionId: session.id, bedragCent });
    await verstuur(betalingOntvangenMail(r, l, { omschrijving, bedragCent }));
  }
  return true;
}
