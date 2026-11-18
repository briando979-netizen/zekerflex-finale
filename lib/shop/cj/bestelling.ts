// ---------------------------------------------------------------------------
// Een betaalde webshopbestelling doorzetten naar CJ Dropshipping (18 nov 2026). Drie bewuste
// stappen, elk apart aan of uit in de CJ-instellingen (Beheer → Winkel-AI → Leverancier):
//   1. plaatsen: createOrderV2 met het adres van de klant, alleen aanmaken (payType 3);
//   2. betalen: confirmOrder + payBalance uit het vooraf opgewaardeerde CJ-saldo, nooit boven de
//      grens per bestelling en nooit zonder dat de eigenaar dat aanzette (autoBetalen) of klikte;
//   3. volgen (cron, elk half uur): getOrderDetail → zodra er een track & trace is, gaat de
//      webshopbestelling op "verzonden" en krijgt de klant de mail met de volglink.
// De proefstand (sandbox, standaard aan) laat CJ alles simuleren zonder geld of pakket; een proef
// raakt de echte webshopbestelling nooit aan en mag later alsnog echt geplaatst worden.
// Wat we onthouden staat in KV shop:cj:bestelling:<orderId>: alleen ids, bedragen en status,
// geen adres (dat staat al bij de bestelling zelf). Elke stap schrijft een auditregel en meldt
// de beheerder per mail en push. Plaatsen en betalen hebben een slot (claimIdempotency), zodat
// een webhook en een klik, of twee tabbladen, nooit twee keer bij CJ bestellen of betalen.
// ---------------------------------------------------------------------------

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { mailShell, sendMail } from "@/lib/mail";
import { sendUserPush } from "@/lib/notifications/push";
import { claimIdempotency, releaseIdempotency } from "@/lib/redis";
import { kvGet, kvGetMany, kvListValues, kvSet } from "@/lib/storage/kv";
import { ecbKoersen } from "@/lib/integrations/wisselkoers-server";
import { naarEuroCents } from "@/lib/integrations/wisselkoers";
import { cjGet, cjPatch, cjPost } from "@/lib/shop/cj/cj-client";
import { goedkoopsteVerzending } from "@/lib/shop/cj/cj-core";
import { CJ_SKU_VOORVOEGSEL, leesCjInstellingen, type CjInstellingen, type CjKoppeling } from "@/lib/shop/cj/importeer";
import { cjOrderBody, cjOrderNumber, cjStatusTekst, isCjEind, leesCjOrder, magBetalen, type CjBestelRegel } from "@/lib/shop/cj/bestelling-core";
import { stuurVerzondenMail } from "@/lib/shop/verzonden-mail";
import type { ShopOrderLine } from "@/lib/shop/bestelling-betaald";

const K_BESTELLING = "shop:cj:bestelling:";
/** webshopstatussen waarbij de klant betaald heeft */
const BETAALD = new Set(["RECEIVED", "CONFIRMED", "SHIPPED"]);
/** een plaatsing die zo lang "bezig" is zonder CJ-nummer is vastgelopen (time-out); dan mag een nieuwe poging */
const BEZIG_MAX_MS = 4 * 60_000;
const SLOT_SECONDEN = 300;

export interface CjBestelStand {
  orderId: string;
  cjOrderId: string | null;
  orderNumber: string;
  /** CJ-status, of "bezig" zolang createOrderV2 nog loopt */
  status: string;
  sandbox: boolean;
  /** zoveelste poging tot plaatsen (elke poging een eigen orderNumber, zodat CJ nooit ORDER_CODE_EXIST geeft) */
  poging: number;
  /** het CJ-nummer van een eerdere proefbestelling, als deze stand de echte is */
  proefCjOrderId: string | null;
  betaald: boolean;
  betaaldOp: string | null;
  bedragUsdCents: number | null;
  verzendUsdCents: number | null;
  bedragEurCents: number | null;
  logistiek: string | null;
  trackNumber: string | null;
  vervoerder: string | null;
  regels: { naam: string; aantal: number; vid: string }[];
  aangemaaktOp: string;
  bijgewerktOp: string;
  laatsteFout: string | null;
  /** de klant heeft de mail "onderweg" met de track & trace gehad (of, bij een proef: de beheerder is gemeld) */
  klantGemeld: boolean;
}

export const leesCjBestelStand = (orderId: string) => kvGet<CjBestelStand>(`${K_BESTELLING}${orderId}`).catch(() => null);
export const alleCjBestelStanden = (max = 200) => kvListValues<CjBestelStand>(K_BESTELLING, max).catch(() => [] as CjBestelStand[]);

async function bewaar(stand: CjBestelStand): Promise<CjBestelStand> {
  const s = { ...stand, bijgewerktOp: new Date().toISOString() };
  await kvSet(`${K_BESTELLING}${s.orderId}`, s);
  return s;
}

/** De CJ-regels in een webshopbestelling: variant → onze sku → de koppeling van het product → het variant-id bij CJ. */
export async function cjRegelsVoor(itemsJson: unknown): Promise<{ regels: CjBestelRegel[]; andere: number }> {
  const lines = (Array.isArray(itemsJson) ? itemsJson : []) as ShopOrderLine[];
  const ids = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!ids.length) return { regels: [], andere: lines.length };
  const varianten = await prisma.shopProductVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, productId: true } });
  const perId = new Map(varianten.map((v) => [v.id, v]));
  const productIds = [...new Set(varianten.filter((v) => v.sku.startsWith(CJ_SKU_VOORVOEGSEL)).map((v) => v.productId))];
  const koppelingen = productIds.length ? await kvGetMany<CjKoppeling>(productIds.map((id) => `shop:cj:product:${id}`)).catch(() => new Map<string, CjKoppeling>()) : new Map<string, CjKoppeling>();
  const regels: CjBestelRegel[] = [];
  let andere = 0;
  for (const l of lines) {
    const v = l.variantId ? perId.get(l.variantId) : undefined;
    const k = v ? koppelingen.get(`shop:cj:product:${v.productId}`) : undefined;
    const vid = v && k ? k.varianten[v.sku]?.vid : undefined;
    if (!v || !vid) {
      andere++;
      continue;
    }
    const aantal = Math.max(1, Math.round(Number(l.qty) || 1));
    const eerder = regels.find((r) => r.vid === vid);
    if (eerder) eerder.quantity += aantal;
    else regels.push({ vid, quantity: aantal, naam: l.name, sku: v.sku });
  }
  return { regels, andere };
}

async function eurVan(usdCents: number | null): Promise<number | null> {
  if (usdCents === null) return null;
  const k = await ecbKoersen().catch(() => null);
  return k ? naarEuroCents(usdCents, "USD", k) : null;
}

/** Het CJ-saldo in dollarcenten (shopping/pay/getBalance); null als het niet lukt. */
export async function cjSaldoUsdCents(): Promise<number | null> {
  try {
    const d = await cjGet<{ amount?: unknown }>("shopping/pay/getBalance", {});
    const n = typeof d.amount === "number" ? d.amount : typeof d.amount === "string" ? Number(d.amount) : NaN;
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  } catch (e) {
    logger.warn("cj: saldo niet opgehaald", { error: (e as Error).message.slice(0, 120) });
    return null;
  }
}

/** De goedkoopste verzenddienst naar Nederland voor deze regels, eerst vanuit het ingestelde magazijn, anders China. */
async function verzenddienst(regels: CjBestelRegel[], instel: CjInstellingen): Promise<{ van: string; dienst: string; dagen: string } | null> {
  for (const van of new Set([instel.land || "CN", "CN"])) {
    try {
      const d = await cjPost<unknown>("logistic/freightCalculate", { startCountryCode: van, endCountryCode: "NL", products: regels.map((r) => ({ quantity: r.quantity, vid: r.vid })) });
      const beste = goedkoopsteVerzending(d);
      if (beste?.dienst) return { van, dienst: beste.dienst, dagen: beste.dagen };
    } catch (e) {
      logger.warn("cj: verzenddienst voor bestelling niet gevonden", { van, error: (e as Error).message.slice(0, 120) });
    }
  }
  return null;
}

/** Mail + push aan de beheerders (nooit een fout naar buiten). */
async function meldBeheer(titel: string, regels: string[], orderId: string): Promise<void> {
  const tekst = regels.join("\n");
  await sendMail({
    to: env.MAIL_ADMIN,
    kind: "shop-order",
    subject: `${titel} — ${orderId}`,
    text: `${titel}\n\n${tekst}\n\nBeheer → Winkel-AI → Leverancier → Bestellingen bij CJ`,
    html: mailShell(titel, `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#3C4A42">${regels.map((r) => r.replace(/</g, "&lt;")).join("<br/>")}</p><p style="margin:0;font-size:12px;color:#667469">Beheer → Winkel-AI → Leverancier → Bestellingen bij CJ</p>`),
  }).catch((e) => logger.warn("cj: beheermail mislukt", { error: (e as Error).message.slice(0, 120) }));
  try {
    const admins = await prisma.membership.findMany({ where: { role: "PLATFORM_ADMIN", user: { disabledAt: null } }, select: { userId: true } });
    await sendUserPush(
      admins.map((a) => a.userId),
      { title: titel, body: regels.slice(0, 3).join(" · ").slice(0, 180), data: { type: "shop-cj", url: "/admin/webshop", orderId }, ttlSeconds: 86_400 },
    );
  } catch (e) {
    logger.warn("cj: beheerpush mislukt", { error: (e as Error).message.slice(0, 120) });
  }
}

const geld = (cents: number | null, munt = "€") => (cents === null ? "onbekend" : `${munt} ${(cents / 100).toFixed(2).replace(".", ",")}`);

export interface Actor {
  actorUserId: string | null;
  actorLabel: string;
}

/** Eén slot per bestelling per stap: de tweede die tegelijk komt (webhook én klik, twee tabbladen) krijgt een nette fout. */
async function metSlot<T>(sleutel: string, werk: () => Promise<T>): Promise<T> {
  const mijn = await claimIdempotency(sleutel, SLOT_SECONDEN).catch(() => true);
  if (!mijn) throw AppError.conflict("Deze stap loopt op dit moment al voor deze bestelling. Wacht even en ververs.");
  try {
    return await werk();
  } finally {
    await releaseIdempotency(sleutel).catch(() => undefined);
  }
}

/** Stap 1: de bestelling bij CJ aanmaken (idempotent: een tweede keer geeft dezelfde stand). `betalen` = meteen door naar stap 2. */
export async function plaatsCjBestelling(orderId: string, o: Actor & { betalen: boolean }): Promise<CjBestelStand> {
  return metSlot(`cj-plaats:${orderId}`, async () => {
    const instel = await leesCjInstellingen();
    const eerder = await leesCjBestelStand(orderId);
    if (eerder?.cjOrderId) {
      // een proefbestelling telt niet als echte: staat de proefstand inmiddels uit, dan mag hij alsnog echt geplaatst worden
      const proefVoorbij = eerder.sandbox && !instel.sandbox;
      if (!proefVoorbij) return o.betalen && !eerder.betaald ? betaalCjBestelling(orderId, o) : eerder;
    } else if (eerder?.status === "bezig" && Date.now() - Date.parse(eerder.bijgewerktOp) < BEZIG_MAX_MS) {
      throw AppError.conflict("Deze bestelling wordt op dit moment al bij CJ geplaatst (of de vorige poging is nog geen 4 minuten oud).");
    }

    const order = await prisma.shopOrder.findUnique({ where: { id: orderId } });
    if (!order) throw AppError.validation("Deze bestelling bestaat niet.");
    if (!BETAALD.has(order.status)) throw AppError.precondition("Deze bestelling is nog niet betaald; pas daarna gaat hij naar CJ.");
    const { regels } = await cjRegelsVoor(order.itemsJson);
    if (!regels.length) throw AppError.precondition("In deze bestelling zit geen product van CJ.");

    const dienst = await verzenddienst(regels, instel);
    if (!dienst) throw AppError.upstream("CJ kent voor deze producten geen verzenddienst naar Nederland.");

    // elke poging een eigen nummer: een time-out nadat CJ de order toch maakte geeft dan geen ORDER_CODE_EXIST bij de volgende
    const poging = (eerder?.poging ?? 0) + 1;
    const orderNumber = cjOrderNumber(orderId, { sandbox: instel.sandbox, poging });
    const now = new Date().toISOString();
    const bezig: CjBestelStand = {
      orderId,
      cjOrderId: null,
      orderNumber,
      status: "bezig",
      sandbox: instel.sandbox,
      poging,
      proefCjOrderId: eerder?.sandbox ? eerder.cjOrderId : (eerder?.proefCjOrderId ?? null),
      betaald: false,
      betaaldOp: null,
      bedragUsdCents: null,
      verzendUsdCents: null,
      bedragEurCents: null,
      logistiek: dienst.dienst,
      trackNumber: null,
      vervoerder: null,
      regels: regels.map((r) => ({ naam: r.naam, aantal: r.quantity, vid: r.vid })),
      aangemaaktOp: now,
      bijgewerktOp: now,
      laatsteFout: null,
      klantGemeld: false,
    };
    await bewaar(bezig);

    let info;
    try {
      info = leesCjOrder(await cjPost<unknown>("shopping/order/createOrderV2", cjOrderBody(order, regels, { orderNumber, van: dienst.van, logistiek: dienst.dienst, sandbox: instel.sandbox })));
    } catch (e) {
      await bewaar({ ...bezig, laatsteFout: (e as Error).message.slice(0, 160) });
      throw e;
    }
    if (!info?.cjOrderId) {
      await bewaar({ ...bezig, laatsteFout: "CJ gaf geen bestelnummer terug." });
      throw AppError.upstream("CJ gaf geen bestelnummer terug.");
    }

    const stand = await bewaar({
      ...bezig,
      cjOrderId: info.cjOrderId,
      orderNumber: info.orderNumber || orderNumber,
      status: info.status || "CREATED",
      bedragUsdCents: info.bedragUsdCents,
      verzendUsdCents: info.verzendUsdCents,
      bedragEurCents: await eurVan(info.bedragUsdCents),
      logistiek: info.logistiek ?? dienst.dienst,
    });
    await recordAudit({
      category: "ADMIN",
      action: "shop.order.cj-geplaatst",
      actorUserId: o.actorUserId,
      actorLabel: o.actorLabel,
      summary: `Shopbestelling ${orderId} bij CJ geplaatst (${stand.cjOrderId}, ${geld(stand.bedragUsdCents, "$")}${stand.sandbox ? ", proef" : ""}, poging ${poging})`,
      targetType: "shop-order",
      targetId: orderId,
      metadata: { cjOrderId: stand.cjOrderId, orderNumber: stand.orderNumber, bedragUsdCents: stand.bedragUsdCents, bedragEurCents: stand.bedragEurCents, sandbox: stand.sandbox, logistiek: stand.logistiek, regels: stand.regels.length, poging },
    });
    await meldBeheer(stand.sandbox ? "Proefbestelling bij CJ geplaatst" : "Bestelling bij CJ geplaatst", [
      `Webshopbestelling ${orderId}`,
      ...stand.regels.map((r) => `${r.aantal}× ${r.naam}`),
      `Leverancier: CJ Dropshipping, magazijn ${dienst.van}, verzending ${stand.logistiek ?? "?"}${dienst.dagen ? ` (${dienst.dagen} dagen)` : ""}`,
      `Inkoop ${geld(stand.bedragUsdCents, "$")} ≈ ${geld(stand.bedragEurCents)}; CJ-nummer ${stand.cjOrderId}`,
      o.betalen ? "Betalen volgt." : "Nog niet betaald: klik in Beheer op Betalen uit saldo.",
    ], orderId);

    return o.betalen ? betaalCjBestelling(orderId, o) : stand;
  });
}

/** Stap 2: confirmOrder + payBalance, alleen onder de grens per bestelling en met genoeg saldo; het bedrag wordt vlak ervoor opnieuw bij CJ gelezen. */
export async function betaalCjBestelling(orderId: string, o: Actor): Promise<CjBestelStand> {
  return metSlot(`cj-betaal:${orderId}`, async () => {
    const stand = await leesCjBestelStand(orderId);
    if (!stand?.cjOrderId) throw AppError.precondition("Deze bestelling staat nog niet bij CJ.");
    if (stand.betaald) return stand;
    const instel = await leesCjInstellingen();
    if (stand.sandbox !== instel.sandbox) throw AppError.precondition(stand.sandbox ? "Dit is een proefbestelling en de proefstand staat uit: plaats de bestelling eerst echt." : "De proefstand staat aan, maar dit is een echte bestelling: zet de proefstand uit of wacht.");

    // het actuele bedrag bij CJ (kan na het aanmaken veranderd zijn), daarna pas de grens en het saldo
    const actueel = leesCjOrder(await cjGet<unknown>("shopping/order/getOrderDetail", { orderId: stand.cjOrderId }).catch(() => null));
    const bedragUsdCents = actueel?.bedragUsdCents ?? stand.bedragUsdCents;
    const bedragEurCents = await eurVan(bedragUsdCents);
    const saldo = await cjSaldoUsdCents();
    const check = magBetalen({ bedragEurCents, maxBetaalCents: instel.maxBetaalCents, saldoUsdCents: saldo, bedragUsdCents });
    if (!check.ok) {
      await bewaar({ ...stand, bedragUsdCents, bedragEurCents, laatsteFout: check.reden });
      await recordAudit({ category: "ADMIN", action: "shop.order.cj-betaling-geweigerd", actorUserId: o.actorUserId, actorLabel: o.actorLabel, summary: `Betalen bij CJ geweigerd voor ${orderId}: ${check.reden}`, targetType: "shop-order", targetId: orderId, metadata: { bedragUsdCents, bedragEurCents, maxBetaalCents: instel.maxBetaalCents, saldoUsdCents: saldo } });
      throw AppError.precondition(check.reden ?? "Betalen kan nu niet.");
    }
    // bevestigen mag al gebeurd zijn; de betaling zelf is de echte stap
    await cjPatch<unknown>("shopping/order/confirmOrder", { orderId: stand.cjOrderId }).catch((e) => logger.info("cj: confirmOrder", { melding: (e as Error).message.slice(0, 120) }));
    await cjPost<unknown>("shopping/pay/payBalance", { orderId: stand.cjOrderId });
    const na = await bewaar({ ...stand, bedragUsdCents, bedragEurCents, betaald: true, betaaldOp: new Date().toISOString(), status: "UNSHIPPED", laatsteFout: null });
    await recordAudit({
      category: "ADMIN",
      action: "shop.order.cj-betaald",
      actorUserId: o.actorUserId,
      actorLabel: o.actorLabel,
      summary: `Shopbestelling ${orderId} bij CJ betaald uit het saldo: ${geld(na.bedragUsdCents, "$")} ≈ ${geld(na.bedragEurCents)}${na.sandbox ? " (proef)" : ""}`,
      targetType: "shop-order",
      targetId: orderId,
      metadata: { cjOrderId: na.cjOrderId, bedragUsdCents: na.bedragUsdCents, bedragEurCents: na.bedragEurCents, saldoVoorUsdCents: saldo, maxBetaalCents: instel.maxBetaalCents, sandbox: na.sandbox },
    });
    await meldBeheer(na.sandbox ? "Proefbestelling bij CJ betaald (gesimuleerd)" : "Bestelling bij CJ betaald uit het saldo", [`Webshopbestelling ${orderId}`, `Bedrag ${geld(na.bedragUsdCents, "$")} ≈ ${geld(na.bedragEurCents)}`, `Saldo vooraf ${geld(saldo, "$")}`, `CJ-nummer ${na.cjOrderId}`], orderId);
    return na;
  });
}

/** Na een betaling in de webshop (Stripe, overschrijving, AI-assistent): alleen als de eigenaar dat aanzette én er CJ-producten in zitten; gooit nooit. */
export async function cjNaBetaling(orderId: string): Promise<void> {
  try {
    const instel = await leesCjInstellingen();
    if (!instel.autoBestellen) return;
    const order = await prisma.shopOrder.findUnique({ where: { id: orderId }, select: { itemsJson: true } });
    if (!order) return;
    const { regels } = await cjRegelsVoor(order.itemsJson);
    if (!regels.length) return;
    await plaatsCjBestelling(orderId, { actorUserId: null, actorLabel: "system:cj", betalen: instel.autoBetalen });
  } catch (e) {
    const m = e instanceof Error ? e.message : "onbekend";
    logger.warn("cj: automatisch bestellen mislukt", { orderId, error: m.slice(0, 160) });
    await recordAudit({ category: "ADMIN", action: "shop.order.cj-mislukt", actorLabel: "system:cj", summary: `Automatisch bestellen bij CJ mislukt voor ${orderId}: ${m.slice(0, 160)}`, targetType: "shop-order", targetId: orderId }).catch(() => undefined);
    await meldBeheer("Bestellen bij CJ mislukt", [`Webshopbestelling ${orderId}`, m.slice(0, 200), "Plaats hem met de hand in Beheer → Winkel-AI → Leverancier."], orderId);
  }
}

/**
 * Hetzelfde, maar ná het antwoord (de Stripe-webhook mag niet wachten op 5-7 CJ-aanvragen van 1/s, anders stuurt Stripe
 * opnieuw). Buiten een webaanvraag (tests, scripts) bestaat after() niet: dan gewoon op de achtergrond.
 */
export function cjNaBetalingLater(orderId: string): void {
  try {
    after(() => cjNaBetaling(orderId));
  } catch {
    void cjNaBetaling(orderId);
  }
}

export interface VolgUitkomst {
  bekeken: number;
  bijgewerkt: number;
  verzonden: number;
  fouten: number;
}

/**
 * Stap 3 (cron): open bestellingen bij CJ navragen. Met een track & trace gaat de webshopbestelling op verzonden en krijgt
 * de klant de mail, maar alleen als hij nog op betaald/bevestigd stond (een geannuleerde of al met de hand verzonden
 * bestelling blijft met rust) en nooit bij een proef (die raakt de echte bestelling niet aan).
 */
export async function volgCjBestellingen(): Promise<VolgUitkomst> {
  const uit: VolgUitkomst = { bekeken: 0, bijgewerkt: 0, verzonden: 0, fouten: 0 };
  for (const stand of await alleCjBestelStanden()) {
    if (!stand.cjOrderId || isCjEind(stand.status)) continue;
    uit.bekeken++;
    try {
      const info = leesCjOrder(await cjGet<unknown>("shopping/order/getOrderDetail", { orderId: stand.cjOrderId }));
      if (!info) continue;
      const nieuw: CjBestelStand = {
        ...stand,
        status: info.status || stand.status,
        logistiek: info.logistiek ?? stand.logistiek,
        trackNumber: info.trackNumber ?? stand.trackNumber,
        vervoerder: info.vervoerder ?? stand.vervoerder,
        bedragUsdCents: info.bedragUsdCents ?? stand.bedragUsdCents,
        betaald: stand.betaald || ["UNSHIPPED", "PENDING", "PROCESSING", "SHIPPED", "DELIVERED"].includes(info.status),
        laatsteFout: null,
      };
      if (nieuw.trackNumber && !nieuw.klantGemeld) {
        const vervoerder = (nieuw.vervoerder ?? nieuw.logistiek ?? "CJ").slice(0, 40);
        if (nieuw.sandbox) {
          await meldBeheer("Proefbestelling bij CJ: verzonden (gesimuleerd)", [`Webshopbestelling ${stand.orderId}`, `Vervoerder ${vervoerder}, track & trace ${nieuw.trackNumber}`, "Proef: de echte bestelling en de klant zijn niet aangeraakt."], stand.orderId);
        } else {
          const r = await prisma.shopOrder.updateMany({
            where: { id: stand.orderId, status: { in: ["RECEIVED", "CONFIRMED"] } },
            data: { status: "SHIPPED", carrier: vervoerder, trackingNumber: nieuw.trackNumber.slice(0, 80) },
          });
          if (r.count > 0) {
            const order = await prisma.shopOrder.findUnique({ where: { id: stand.orderId }, select: { id: true, email: true, firstName: true, carrier: true, trackingNumber: true } });
            if (order) await stuurVerzondenMail(order);
            await recordAudit({ category: "ADMIN", action: "shop.order.cj-verzonden", actorLabel: "system:cj", summary: `Shopbestelling ${stand.orderId} door CJ verzonden (${vervoerder}, ${nieuw.trackNumber})`, targetType: "shop-order", targetId: stand.orderId });
            await meldBeheer("Bestelling door CJ verzonden", [`Webshopbestelling ${stand.orderId}`, `Vervoerder ${vervoerder}, track & trace ${nieuw.trackNumber}`, "De klant heeft de mail met de volglink gekregen."], stand.orderId);
            uit.verzonden++;
          } else {
            // al met de hand verzonden, geannuleerd of terugbetaald: alleen vastleggen, geen mail
            await recordAudit({ category: "ADMIN", action: "shop.order.cj-verzonden", actorLabel: "system:cj", summary: `CJ meldt verzending van ${stand.orderId} (${vervoerder}, ${nieuw.trackNumber}); de bestelling stond niet meer op betaald, dus geen mail`, targetType: "shop-order", targetId: stand.orderId });
          }
        }
        nieuw.klantGemeld = true;
      }
      if (JSON.stringify(nieuw) !== JSON.stringify(stand)) {
        await bewaar(nieuw);
        uit.bijgewerkt++;
      }
    } catch (e) {
      uit.fouten++;
      await bewaar({ ...stand, laatsteFout: (e as Error).message.slice(0, 160) }).catch(() => undefined);
    }
  }
  return uit;
}

export interface CjKandidaat {
  orderId: string;
  createdAt: string;
  status: string;
  naam: string;
  totalCents: number;
  cjRegels: number;
  andereRegels: number;
  stand: CjBestelStand | null;
  statusTekst: string | null;
  /** de stand is een proef terwijl de proefstand uit staat: de bestelling mag alsnog echt geplaatst worden */
  echtPlaatsenKan: boolean;
}

/** Voor Beheer: recente betaalde bestellingen met CJ-producten en wat er bij CJ mee gebeurd is. */
export async function cjKandidaten(max = 30): Promise<CjKandidaat[]> {
  const [orders, instel] = await Promise.all([
    prisma.shopOrder.findMany({
      where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] } },
      orderBy: { createdAt: "desc" },
      take: max,
      select: { id: true, createdAt: true, status: true, firstName: true, lastName: true, totalCents: true, itemsJson: true },
    }),
    leesCjInstellingen(),
  ]);
  const uit: CjKandidaat[] = [];
  for (const o of orders) {
    const { regels, andere } = await cjRegelsVoor(o.itemsJson);
    if (!regels.length) continue;
    const stand = await leesCjBestelStand(o.id);
    uit.push({
      orderId: o.id,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      naam: `${o.firstName} ${o.lastName.slice(0, 1)}.`.trim(),
      totalCents: o.totalCents,
      cjRegels: regels.reduce((s, r) => s + r.quantity, 0),
      andereRegels: andere,
      stand,
      statusTekst: stand ? (stand.status === "bezig" ? "wordt geplaatst…" : cjStatusTekst(stand.status)) : null,
      echtPlaatsenKan: Boolean(stand?.cjOrderId && stand.sandbox && !instel.sandbox),
    });
  }
  return uit;
}
