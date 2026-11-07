import type Stripe from "stripe";
import type { HorecaTafel, HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe";
import { IDEAL_KOSTEN_CENT, isTestAdres } from "@/lib/rijschool/betalen";
import { leesRegels } from "@/lib/horeca/bestellen";
import { rekeningVan, totaalVan, type Selectie } from "@/lib/horeca/kassa";
import { heeftModule } from "@/lib/horeca/modules";
import { beschikbaar, boekAf, bonRegels, fooiGeldig, idealRegels, kiesRegels, kostenVooraf, leesIdealRegels, onlineMethode, terugNaarZaak, type OnlineMethode } from "@/lib/horeca/ideal";
import { bonToken } from "@/lib/horeca/bon";
import { kvGetMany, kvSet } from "@/lib/storage/kv";

/** Online betaald aan tafel: zo staat een betaling na afloop in de database (eerst altijd "ideal"). */
const ONLINE: OnlineMethode[] = ["ideal", "kaart", "apple_pay", "google_pay"];

/** Per betaling: waarmee, wat vooraf ingehouden, wat Stripe echt rekende en wat terugging (voor het beheer). */
export interface HorecaKosten {
  methode: OnlineMethode;
  voorafCent: number;
  echtCent: number;
  terugCent: number;
  op: string;
}
const kKosten = (betalingId: string) => `horeca:kosten:${betalingId}`;

// ---------------------------------------------------------------------------
// Afrekenen aan tafel met iDEAL, een pas, Apple Pay of Google Pay. Elke zaak
// heeft een eigen Stripe-account (Connect Express) onder het platform van
// ZekerFlex. De gast betaalt via Stripe; het geld gaat bij de betaling meteen
// door naar het account van de zaak en Stripe betaalt het vanzelf uit op haar
// bankrekening. ZekerFlex houdt alleen de kosten in die Stripe echt rekent
// (doorberekend, geen marge): vooraf het maximum (kostenVooraf), na de betaling
// gaat het verschil met de echte kosten terug naar de zaak (verrekenKosten).
//
// Betaald = Stripe zegt het: de webhook, of bij terugkeer van de gast een
// opvraging bij Stripe zelf (nooit wat de browser meldt). Dubbel verwerken
// boekt niets dubbel: de betaling staat onder een rijslot en gaat maar één keer
// van OPEN naar BETAALD.
// ---------------------------------------------------------------------------

type Stand = { klaar: boolean; ingevuld: boolean; tot: number };

function standen(): Map<string, Stand> {
  const g = globalThis as typeof globalThis & { __zfHorecaStripe?: Map<string, Stand> };
  g.__zfHorecaStripe ??= new Map();
  return g.__zfHorecaStripe;
}

/** Kan deze zaak online betalingen ontvangen? Kort bewaard, zodat niet elke pagina Stripe vraagt. */
export async function stripeStand(z: Pick<HorecaZaak, "stripeAccountId">, vers = false): Promise<{ gekoppeld: boolean; klaar: boolean; ingevuld: boolean }> {
  const id = z.stripeAccountId;
  if (!id) return { gekoppeld: false, klaar: false, ingevuld: false };
  const bewaard = standen().get(id);
  if (!vers && bewaard && bewaard.tot > Date.now()) return { gekoppeld: true, klaar: bewaard.klaar, ingevuld: bewaard.ingevuld };
  try {
    const a = await getStripeClient().accounts.retrieve(id);
    const s: Stand = { klaar: Boolean(a.charges_enabled && a.payouts_enabled), ingevuld: Boolean(a.details_submitted), tot: Date.now() + 5 * 60_000 };
    standen().set(id, s);
    return { gekoppeld: true, klaar: s.klaar, ingevuld: s.ingevuld };
  } catch (err) {
    logger.warn("horeca: Stripe-stand niet gelezen", { error: err instanceof Error ? err.message : String(err) });
    return { gekoppeld: true, klaar: false, ingevuld: false };
  }
}

/** Kan een gast aan tafel nu online afrekenen? (module aan en Stripe klaar) */
export const onlineAfrekenenAan = async (z: Pick<HorecaZaak, "stripeAccountId" | "modules">) => heeftModule(z, "betalen") && (await stripeStand(z)).klaar;

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");

/** Maakt (eenmalig) het Stripe-account van de zaak en geeft de link om het in te vullen. Alleen na een klik van de beheerder. */
export async function koppelStripe(z: HorecaZaak, door: { email: string }): Promise<string> {
  if (isTestAdres(door.email) || (z.email && isTestAdres(z.email))) {
    throw AppError.precondition("Dit is een testaccount: ZekerFlex maakt hiervoor geen Stripe-account aan.");
  }
  try {
    return await koppel(z);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const m = err instanceof Error ? err.message : String(err);
    logger.warn("horeca: Stripe koppelen mislukt", { zaakId: z.id, error: m });
    // "You must complete your platform profile to use Connect": eigenaarstap (Admin → Te doen)
    throw AppError.upstream(
      /platform profile|signed up for Connect|\bConnect\b/.test(m)
        ? "Online afrekenen kan nog niet: ZekerFlex moet dit eerst bij Stripe aanzetten. Dat staat op de lijst; probeer het later opnieuw."
        : "Stripe gaf een fout bij het koppelen. Probeer het over een paar minuten opnieuw.",
    );
  }
}

async function koppel(z: HorecaZaak): Promise<string> {
  const stripe = getStripeClient();
  let id = z.stripeAccountId;
  if (!id) {
    const a = await stripe.accounts.create({
      type: "express",
      country: "NL",
      ...(z.email ? { email: z.email } : {}),
      business_profile: { name: z.naam, url: `${basis()}/horeca/${z.slug}`, mcc: "5812", product_description: "Eten en drinken in ons restaurant of café" },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true }, ideal_payments: { requested: true } },
      metadata: { horecaZaakId: z.id },
    });
    id = a.id;
    // alleen zetten als er nog niets stond: twee keer tegelijk klikken mag geen tweede account opleveren
    const gezet = await prisma.horecaZaak.updateMany({ where: { id: z.id, OR: [{ stripeAccountId: null }, { stripeAccountId: "" }] }, data: { stripeAccountId: id } });
    if (gezet.count === 0) {
      await stripe.accounts.del(id).catch(() => undefined);
      id = (await prisma.horecaZaak.findUniqueOrThrow({ where: { id: z.id }, select: { stripeAccountId: true } })).stripeAccountId ?? "";
    }
  }
  standen().delete(id);
  const terug = `${basis()}/werkgever/horeca?tab=modules`;
  const link = await stripe.accountLinks.create({ account: id, type: "account_onboarding", return_url: `${terug}&stripe=terug`, refresh_url: `${terug}&stripe=opnieuw` });
  return link.url;
}

/** Het eigen Stripe-overzicht van de zaak (betalingen, uitbetalingen, bankrekening). */
export async function stripeDashboard(z: Pick<HorecaZaak, "stripeAccountId">): Promise<string> {
  if (!z.stripeAccountId) throw AppError.precondition("Koppel eerst je Stripe-account.");
  return (await getStripeClient().accounts.createLoginLink(z.stripeAccountId)).url;
}

/** Zo lang houdt een lopende iDEAL-betaling haar gerechten vast (de betaalpagina is 35 minuten geldig). */
const VASTHOUDEN_MS = 36 * 60_000;

type Db = Pick<typeof prisma, "horecaBestelling" | "horecaBetaling">;

/**
 * Wat er aan een tafel nog te betalen is: de open rekening min wat een andere
 * gast nu al aan het betalen is. `inBetalingCent` = het bedrag dat bij een
 * lopende betaling hoort.
 */
export async function openRekening(zaakId: string, tafelId: string, db: Db = prisma) {
  const [bestellingen, lopend] = await Promise.all([
    db.horecaBestelling.findMany({
      where: { zaakId, tafelId, betaald: false, status: { not: "GEANNULEERD" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, nummer: true, status: true, betaald: true, regels: true },
    }),
    db.horecaBetaling.findMany({ where: { zaakId, tafelId, methode: "ideal", status: "OPEN", createdAt: { gte: new Date(Date.now() - VASTHOUDEN_MS) } }, select: { regels: true } }),
  ]);
  const inBetaling = lopend.flatMap((b) => leesIdealRegels(b.regels));
  const open = beschikbaar(rekeningVan(bestellingen.map((b) => ({ ...b, regels: leesRegels(b.regels) }))), inBetaling);
  const regels = idealRegels(open);
  return { open, regels, totaalCent: totaalVan(regels), inBetalingCent: totaalVan(inBetaling) };
}

/**
 * Start een betaling aan tafel: alles wat open staat, of alleen de keuze van
 * deze gast ("alleen wat ik had"). Geeft het adres van de betaalpagina van Stripe.
 */
export async function startAfrekenen(z: HorecaZaak, tafel: Pick<HorecaTafel, "id" | "naam">, code: string, fooiCent: number, selectie: Selectie[] | null = null): Promise<string> {
  if (!z.stripeAccountId || !(await onlineAfrekenenAan(z))) throw AppError.precondition("Online afrekenen staat bij deze zaak nog niet aan. Vraag de bediening om de rekening.");

  // onder een slot per tafel: twee gasten die tegelijk op betalen drukken, kiezen nooit hetzelfde
  const b = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horeca-afrekenen:${tafel.id}`}))`;
    const { open, regels: alles } = await openRekening(z.id, tafel.id, tx);
    if (!alles.length) throw AppError.conflict("Er staat niets (meer) open op deze tafel. Wordt er al betaald? Kijk even bij je tafelgenoten.");
    const gekozen = selectie?.length ? kiesRegels(open, selectie) : alles;
    if ("fout" in gekozen) throw AppError.conflict(gekozen.fout);
    const totaalCent = totaalVan(gekozen);
    if (totaalCent < 100) throw AppError.validation("Online afrekenen kan vanaf € 1. Kies meer of vraag de bediening.");
    if (!fooiGeldig(fooiCent, totaalCent)) throw AppError.validation("Kies een fooi tussen € 0 en het bedrag dat je betaalt, hooguit € 100.");
    return tx.horecaBetaling.create({
      data: {
        zaakId: z.id,
        tafelId: tafel.id,
        bedragCent: totaalCent,
        fooiCent,
        status: "OPEN",
        // tot de betaling binnen is "ideal"; daarna de echte betaalwijze (verwerkHorecaSessie)
        methode: "ideal",
        door: selectie?.length ? "Gast aan tafel, eigen deel" : "Gast aan tafel",
        regels: gekozen as unknown as object[],
        bestellingIds: [...new Set(gekozen.map((r) => r.bestellingId))],
      },
    });
  });
  const totaalCent = b.bedragCent;
  const wat = selectie?.length ? `Eigen deel ${tafel.naam}` : `Rekening ${tafel.naam}`;
  const metadata = { horecaZaakId: z.id, horecaBetalingId: b.id };
  const pagina = `${basis()}/horeca/${z.slug}/tafel/${encodeURIComponent(code)}`;
  let sessie: Stripe.Checkout.Session;
  try {
    sessie = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      // "card" geeft ook Apple Pay en Google Pay op een telefoon die dat kan
      payment_method_types: ["ideal", "card"],
      locale: "nl",
      line_items: [
        { quantity: 1, price_data: { currency: "eur", unit_amount: totaalCent, product_data: { name: `${wat} · ${z.naam}`.slice(0, 250) } } },
        ...(fooiCent > 0 ? [{ quantity: 1, price_data: { currency: "eur", unit_amount: fooiCent, product_data: { name: "Fooi" } } }] : []),
      ],
      metadata,
      payment_intent_data: {
        description: `${z.naam}: ${wat.toLowerCase()}`.slice(0, 250),
        on_behalf_of: z.stripeAccountId,
        transfer_data: { destination: z.stripeAccountId },
        // het maximum; na de betaling gaat het verschil met de echte kosten terug (verrekenKosten)
        application_fee_amount: kostenVooraf(totaalCent + fooiCent, IDEAL_KOSTEN_CENT),
        metadata,
      },
      // kort geldig: een betaalpagina van gisteren mag geen rekening van vandaag afrekenen
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      success_url: `${pagina}?betaling=gelukt&b=${b.id}`,
      cancel_url: `${pagina}?betaling=geannuleerd&b=${b.id}`,
    });
  } catch (err) {
    await prisma.horecaBetaling.update({ where: { id: b.id }, data: { status: "MISLUKT" } }).catch(() => undefined);
    logger.warn("horeca: online afrekenen starten mislukt", { zaakId: z.id, error: err instanceof Error ? err.message : String(err) });
    throw AppError.upstream("De betaalpagina kon niet worden geopend. Probeer het opnieuw of vraag de bediening.");
  }
  if (!sessie.url) throw AppError.upstream("Stripe gaf geen betaalpagina terug.");
  await prisma.horecaBetaling.update({ where: { id: b.id }, data: { stripeSessionId: sessie.id } });
  return sessie.url;
}

interface StripeBetaling {
  methode: OnlineMethode;
  /** de application fee (wat ZekerFlex vooraf inhield) */
  feeId: string | null;
  voorafCent: number;
  alTerugCent: number;
  /** wat Stripe echt rekende; null als Stripe het nog niet weet */
  echtCent: number | null;
}

/** De betaling achter een sessie: waarmee betaald, en de kosten (buiten elk slot: netwerk). */
async function stripeBetaling(session: Stripe.Checkout.Session): Promise<StripeBetaling | null> {
  const id = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!id) return null;
  const pi = await getStripeClient().paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction", "latest_charge.application_fee"] });
  const ch = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  if (!ch) return null;
  const bt = ch.balance_transaction && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
  const fee = ch.application_fee && typeof ch.application_fee === "object" ? ch.application_fee : null;
  return {
    methode: onlineMethode(ch.payment_method_details),
    feeId: fee?.id ?? (typeof ch.application_fee === "string" ? ch.application_fee : null),
    voorafCent: ch.application_fee_amount ?? 0,
    alTerugCent: fee?.amount_refunded ?? 0,
    echtCent: bt ? bt.fee : null,
  };
}

/**
 * ZekerFlex houdt precies de echte kosten in: wat vooraf meer werd ingehouden,
 * gaat terug naar de zaak (een gedeeltelijke terugboeking van de application
 * fee). Veilig bij herhaling: wat al terug is, telt mee, en Stripe krijgt een
 * vaste sleutel. Weet Stripe de kosten nog niet, dan gooit hij, zodat de
 * webhook het later opnieuw probeert (het boeken zelf is dan al gebeurd).
 */
async function verrekenKosten(betalingId: string, sb: StripeBetaling): Promise<void> {
  if (!sb.feeId) return;
  if (sb.echtCent === null) throw new Error("horeca: de kosten van Stripe zijn nog niet bekend; later opnieuw");
  const terug = terugNaarZaak(sb.voorafCent, sb.echtCent, sb.alTerugCent);
  if (terug > 0) {
    await getStripeClient().applicationFees.createRefund(sb.feeId, { amount: terug, metadata: { horecaBetalingId: betalingId, reden: "verschil met de echte Stripe-kosten" } }, { idempotencyKey: `horeca-kosten:${betalingId}:${terug}` });
  }
  if (sb.echtCent > sb.voorafCent) logger.warn("horeca: Stripe rekende meer dan vooraf ingehouden", { betalingId, voorafCent: sb.voorafCent, echtCent: sb.echtCent });
  await kvSet(kKosten(betalingId), { methode: sb.methode, voorafCent: sb.voorafCent, echtCent: sb.echtCent, terugCent: sb.alTerugCent + terug, op: new Date().toISOString() } satisfies HorecaKosten);
}

/**
 * Verwerkt een betaalde Checkout Session van een horecazaak (webhook of
 * opvraging bij terugkeer). Dubbel aanroepen boekt niets dubbel.
 * true = herkend als horecabetaling.
 */
export async function verwerkHorecaSessie(session: Stripe.Checkout.Session): Promise<boolean> {
  const m = session.metadata ?? {};
  const betalingId = m.horecaBetalingId;
  const zaakId = m.horecaZaakId;
  if (!betalingId || !zaakId) return false;
  if (session.payment_status !== "paid") return true; // iDEAL bevestigt soms later (async_payment_succeeded)

  // waarmee betaald en wat het kostte; lukt dat even niet, dan boeken we toch (de bon zegt dan iDEAL niet zeker)
  const sb = await stripeBetaling(session).catch((err: unknown) => {
    logger.warn("horeca: betaling bij Stripe niet gelezen", { betalingId, error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const methode: OnlineMethode = sb?.methode ?? "ideal";

  const uit = await prisma.$transaction(async (tx) => {
    const slot = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HorecaBetaling" WHERE id = ${betalingId} AND "zaakId" = ${zaakId} FOR UPDATE`;
    if (!slot.length) return { soort: "onbekend" as const };
    const b = await tx.horecaBetaling.findUniqueOrThrow({ where: { id: betalingId } });
    if (b.status === "BETAALD") return { soort: "al" as const };

    const regels = leesIdealRegels(b.regels);
    const ids = [...new Set(regels.map((r) => r.bestellingId))];
    if (ids.length) await tx.$queryRaw`SELECT id FROM "HorecaBestelling" WHERE id = ANY(${ids}) AND "zaakId" = ${zaakId} FOR UPDATE`;
    const lijst = (await tx.horecaBestelling.findMany({ where: { id: { in: ids }, zaakId }, select: { id: true, status: true, betaald: true, regels: true } })).map((x) => ({ ...x, regels: leesRegels(x.regels) }));
    const af = boekAf(lijst, regels);
    if (af.ok) {
      for (const w of af.wijzigingen) await tx.horecaBestelling.update({ where: { id: w.id }, data: { regels: w.regels as unknown as object[], betaald: w.helemaal } });
    }

    // bonnummers op volgorde, per zaak (zelfde slot als de kassa)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horeca-bon:${zaakId}`}))`;
    const laatste = await tx.horecaBetaling.aggregate({ where: { zaakId }, _max: { bonNummer: true } });
    const fooiCent = Math.max(0, (session.amount_total ?? b.bedragCent + b.fooiCent) - b.bedragCent);
    await tx.horecaBetaling.update({
      where: { id: b.id },
      data: {
        status: "BETAALD",
        betaaldOp: new Date(),
        bonNummer: (laatste._max.bonNummer ?? 0) + 1,
        fooiCent,
        methode,
        stripeSessionId: session.id,
        regels: bonRegels(regels) as unknown as object[],
        bestellingIds: af.ok ? ids : [],
        door: af.ok ? b.door : "Gast aan tafel (online) · LET OP: was al afgerekend, betaal terug via Stripe",
      },
    });
    return af.ok ? { soort: "geboekt" as const, bedragCent: b.bedragCent, fooiCent } : { soort: "dubbel" as const, bedragCent: b.bedragCent, fooiCent, fout: af.fout };
  });

  if (uit.soort === "onbekend") logger.warn("horeca: betaalde sessie zonder betaling", { sessionId: session.id, zaakId });
  else if (uit.soort === "dubbel") logger.warn("horeca: online betaald voor een rekening die al was afgerekend", { sessionId: session.id, zaakId, bedragCent: uit.bedragCent, reden: uit.fout });
  else if (uit.soort === "geboekt") logger.info("horeca: online betaling verwerkt", { sessionId: session.id, zaakId, methode, bedragCent: uit.bedragCent, fooiCent: uit.fooiCent });
  // ook bij "al": een eerdere ronde kan Stripe niet hebben gelezen (betaalwijze) of de kosten nog niet verrekend
  if (uit.soort === "al" && sb && sb.methode !== "ideal") await prisma.horecaBetaling.updateMany({ where: { id: betalingId, methode: "ideal" }, data: { methode: sb.methode } });
  if (uit.soort !== "onbekend" && sb) await verrekenKosten(betalingId, sb);
  return true;
}

/** De stand van een betaling voor de gast. Staat hij nog open, dan vragen we het Stripe zelf (de webhook kan later komen). */
export async function afrekenStand(zaakId: string, tafelId: string, betalingId: string): Promise<{ status: "OPEN" | "BETAALD" | "MISLUKT"; bedragCent: number; fooiCent: number; bonNummer: number | null; token?: string }> {
  const lees = () => prisma.horecaBetaling.findFirst({ where: { id: betalingId, zaakId, tafelId, methode: { in: ONLINE } }, select: { status: true, bedragCent: true, fooiCent: true, bonNummer: true, stripeSessionId: true } });
  let b = await lees();
  if (!b) throw AppError.notFound("Deze betaling bestaat niet.");
  if (b.status === "OPEN" && b.stripeSessionId) {
    try {
      const s = await getStripeClient().checkout.sessions.retrieve(b.stripeSessionId);
      if (s.payment_status === "paid") await verwerkHorecaSessie(s);
      else if (s.status === "expired") await prisma.horecaBetaling.updateMany({ where: { id: betalingId, status: "OPEN" }, data: { status: "MISLUKT" } });
      b = (await lees()) ?? b;
    } catch (err) {
      logger.warn("horeca: stand bij Stripe niet gelezen", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { status: b.status, bedragCent: b.bedragCent, fooiCent: b.fooiCent, bonNummer: b.bonNummer, ...(b.status === "BETAALD" ? { token: bonToken(betalingId) } : {}) };
}

/**
 * De gast brak het betalen af (terug van Stripe via "annuleren"): de betaalpagina
 * vervalt meteen en de gerechten komen weer vrij voor de rest van de tafel. Was
 * er toch al betaald, dan wordt dat gewoon verwerkt.
 */
export async function stopAfrekenen(zaakId: string, tafelId: string, betalingId: string): Promise<void> {
  const b = await prisma.horecaBetaling.findFirst({ where: { id: betalingId, zaakId, tafelId, methode: "ideal", status: "OPEN" }, select: { stripeSessionId: true } });
  if (!b) return;
  if (b.stripeSessionId) {
    try {
      const stripe = getStripeClient();
      const s = await stripe.checkout.sessions.retrieve(b.stripeSessionId);
      if (s.payment_status === "paid") {
        await verwerkHorecaSessie(s);
        return;
      }
      if (s.status === "open") await stripe.checkout.sessions.expire(b.stripeSessionId);
    } catch (err) {
      logger.warn("horeca: betaalpagina niet laten vervallen", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  await prisma.horecaBetaling.updateMany({ where: { id: betalingId, status: "OPEN" }, data: { status: "MISLUKT" } });
}

/** Voor de platformbeheerder: alleen inzien. Welke zaken online afrekenen en wat er binnenkwam. */
export async function afrekenOverzicht(dagen = 90) {
  const sinds = new Date(Date.now() - dagen * 86_400_000);
  const [zaken, betalingen] = await Promise.all([
    prisma.horecaZaak.findMany({ orderBy: { naam: "asc" }, select: { id: true, naam: true, slug: true, plaats: true, modules: true, stripeAccountId: true } }),
    prisma.horecaBetaling.findMany({
      // online aan tafel: met een Stripe-sessie, of gestart en (nog) niet betaald; niet wat de kassa als iDEAL boekte
      where: { methode: { in: ONLINE }, createdAt: { gte: sinds }, OR: [{ stripeSessionId: { not: null } }, { status: { not: "BETAALD" } }] },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, zaakId: true, bedragCent: true, fooiCent: true, status: true, methode: true, bonNummer: true, door: true, createdAt: true, betaaldOp: true, tafel: { select: { naam: true } } },
    }),
  ]);
  const metStand = await Promise.all(zaken.map(async (z) => ({ ...z, betalenAan: heeftModule(z, "betalen"), stripe: await stripeStand(z) })));
  const kosten = await kvGetMany<HorecaKosten>(betalingen.map((b) => kKosten(b.id)));
  return { zaken: metStand, betalingen: betalingen.map((b) => ({ ...b, kosten: kosten.get(kKosten(b.id)) ?? null })), sinds };
}
