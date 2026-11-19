// ---------------------------------------------------------------------------
// Een product van CJ Dropshipping in de webshop zetten: inkoopprijs in dollars →
// euro's (ECB-dagkoers), verkoopprijs uit de marge van het beleid (plus de verzend-
// kosten per stuk), naam en omschrijving in gewoon Nederlands (eigen model; lukt dat
// niet, dan blijft de Engelse tekst staan en zegt het scherm dat), kleuren en maten als
// varianten met voorraad, de foto's van de leverancier in onze eigen opslag. Wat van
// CJ komt staat in KV (shop:cj:product:<id>), zodat de marge later de echte inkoop kent.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { kvDelete, kvGet, kvSet, kvSetIfAbsent, kvVervangAlsVeld, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { storeUpload } from "@/lib/storage/local";
import { ecbKoersen } from "@/lib/integrations/wisselkoers-server";
import { naarEuroCents } from "@/lib/integrations/wisselkoers";
import { bewaarLinkBron } from "@/lib/shop/link-product-server";
import { leesBeleidOpgeslagen } from "@/lib/shop/winkel-ai";
import { prijsUitInkoop, slugVan, tariefVoor } from "@/lib/shop/winkel-ai-core";
import { cjProduct, cjVerzendkosten, cjVoorraadPerVariant } from "@/lib/shop/cj/cj-client";
import { ACHTERSTAND_BUDGET_DEEL, ACHTERSTAND_PER_RONDE, CJ_FOTO_MAX_PX, CJ_MAX_FOTOS, achterstandEerst, categorieKeuze, categorieVanCj, herbruikbareWees, leesClaim, lijktDuits, onzeSku, type CjProduct, type CjVerzending } from "@/lib/shop/cj/cj-core";
import { vertaalStoringActief, vertaalVermelding } from "@/lib/shop/cj/vertalen";
import type { ShopCategorie } from "@/lib/shop/categorieen";

const K_INSTEL = "shop:cj:instellingen";
const K_PID = "shop:cj:pid:";
const K_PRODUCT = "shop:cj:product:";
const K_LIJST = "shop:cj:producten";
const K_OUD_UIT = "shop:cj:oud-uit";
/** onze variant-sku's van CJ beginnen hiermee (cj-core.ts onzeSku): zo herken je een CJ-product ook zonder KV */
export const CJ_SKU_VOORVOEGSEL = "cj-";
/** zoveel foto's per product (hoofdfoto + extra) */
const MAX_FOTOS = CJ_MAX_FOTOS;

export interface CjInstellingen {
  /** verzendkosten per stuk die in de verkoopprijs worden meegerekend (CJ rekent ze per bestelling aan ons) */
  verzendCents: number;
  /** alleen producten met voorraad in dit land zoeken (DE = Europees magazijn, sneller en zonder invoer); leeg = overal */
  land: string;
  /** eigen marge voor leveranciersproducten; null = het beleid van de Winkel-AI */
  margePct: number | null;
  /** proefstand: bestellingen bij CJ als sandbox (CJ simuleert: geen geld, geen pakket) tot de eigenaar hem bewust uitzet */
  sandbox: boolean;
  /** na een betaalde webshopbestelling vanzelf bij CJ plaatsen (alleen aanmaken) */
  autoBestellen: boolean;
  /** ... en vanzelf uit het CJ-saldo betalen, nooit boven maxBetaalCents */
  autoBetalen: boolean;
  /** grens per bestelling voor betalen uit het saldo, in eurocenten */
  maxBetaalCents: number;
}
export const STANDAARD_INSTELLINGEN: CjInstellingen = { verzendCents: 450, land: "DE", margePct: null, sandbox: true, autoBestellen: false, autoBetalen: false, maxBetaalCents: 15_000 };

export function leesInstellingen(v: unknown): CjInstellingen {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const verzend = typeof o.verzendCents === "number" && Number.isFinite(o.verzendCents) ? Math.min(5000, Math.max(0, Math.round(o.verzendCents))) : STANDAARD_INSTELLINGEN.verzendCents;
  const land = typeof o.land === "string" && /^[A-Za-z]{2}$/.test(o.land.trim()) ? o.land.trim().toUpperCase() : typeof o.land === "string" && o.land.trim() === "" ? "" : STANDAARD_INSTELLINGEN.land;
  const marge = typeof o.margePct === "number" && Number.isFinite(o.margePct) ? Math.min(90, Math.max(5, Math.round(o.margePct))) : null;
  const vink = (v: unknown, std: boolean) => (typeof v === "boolean" ? v : std);
  const maxBetaal = typeof o.maxBetaalCents === "number" && Number.isFinite(o.maxBetaalCents) ? Math.min(200_000, Math.max(0, Math.round(o.maxBetaalCents))) : STANDAARD_INSTELLINGEN.maxBetaalCents;
  const autoBestellen = vink(o.autoBestellen, STANDAARD_INSTELLINGEN.autoBestellen);
  // vanzelf betalen kan alleen als er ook vanzelf besteld wordt
  return { verzendCents: verzend, land, margePct: marge, sandbox: vink(o.sandbox, STANDAARD_INSTELLINGEN.sandbox), autoBestellen, autoBetalen: autoBestellen && vink(o.autoBetalen, STANDAARD_INSTELLINGEN.autoBetalen), maxBetaalCents: maxBetaal };
}
export async function leesCjInstellingen(): Promise<CjInstellingen> {
  return leesInstellingen(await kvGet<unknown>(K_INSTEL).catch(() => null));
}
export async function zetCjInstellingen(v: unknown): Promise<CjInstellingen> {
  // een deel mag: wat niet meekomt, blijft zoals het was
  const huidig = await leesCjInstellingen();
  const i = leesInstellingen({ ...huidig, ...(v && typeof v === "object" ? (v as Record<string, unknown>) : {}) });
  await kvSet(K_INSTEL, i);
  return i;
}

/** Wat we van CJ onthouden bij een product (voor de marge en om later voorraad en prijs te verversen). */
export interface CjKoppeling {
  pid: string;
  sku: string;
  varianten: Record<string, { vid: string; sku: string; usdCents: number }>;
  inkoopUsdCents: number;
  koersDatum: string;
  /** verzendkosten per stuk die in de prijs zitten: het echte tarief van CJ naar NL, of de schatting uit de instellingen */
  verzendCents: number;
  verzendBron?: "cj" | "schatting";
  verzendDienst?: string;
  /** levertijd zoals CJ hem noemt, bv. "6-12" (dagen); voor de kaart en de productpagina (lib/shop/levertijd.ts) */
  verzendDagen?: string;
  /** wanneer de Bijwerken-ronde de levertijd voor het laatst bij CJ vroeg zonder antwoord (freightCalculate gaf een lege lijst): pas na een week opnieuw */
  verzendGeprobeerdOp?: string;
  geimporteerdOp: string;
  vertaald: boolean;
  /** de automatische categorie bij de laatste ronde; wijkt de categorie in de winkel daarvan af, dan koos de beheerder zelf en blijft die staan */
  categorieAuto?: ShopCategorie;
  bijgewerktOp?: string;
  /** de wachtrij wilde dit product aan, maar de tekst was nog Engels: de Bijwerken-ronde zet het aan zodra de vertaling lukt */
  activerenNaVertaling?: boolean;
}

export async function leesCjKoppeling(productId: string): Promise<CjKoppeling | null> {
  return kvGet<CjKoppeling>(`${K_PRODUCT}${productId}`).catch(() => null);
}
/** Alle product-id's die van CJ komen. */
export async function cjProductIds(): Promise<string[]> {
  const l = await kvGet<string[]>(K_LIJST).catch(() => null);
  return Array.isArray(l) ? l.filter((x) => typeof x === "string") : [];
}

export interface ImportUitkomst {
  bestaand: boolean;
  id: string;
  slug: string;
  naam: string;
  prijsCents: number;
  inkoopCents: number;
  varianten: number;
  fotos: number;
  vertaald: boolean;
  actief: boolean;
  /** verzendkosten per stuk die in de prijs zitten, en of dat het echte tarief van CJ is */
  verzendCents: number;
  verzendEcht: boolean;
  melding: string | null;
}

/** Eén foto van de leverancier naar onze opslag; null als het niet lukt (de rest gaat door). */
async function haalFoto(adres: string, naam: string, actorUserId: string | null): Promise<{ id: string; url: string } | null> {
  try {
    // kleiner en op schijf (niet in Postgres): een CJ-foto is altijd opnieuw te halen (lib/shop/cj/fotos-verhuizen.ts)
    const foto = await importRemoteImage(adres, { maxPx: CJ_FOTO_MAX_PX });
    const up = await storeUpload({ filename: `${naam}.webp`, mimeType: foto.mime, bytes: foto.bytes, uploadedById: actorUserId, opSchijf: true, map: "cj" });
    return { id: up.id, url: `/api/shop/media/${up.id}` };
  } catch (e) {
    logger.warn("cj: foto overnemen mislukt", { error: (e as Error).message.slice(0, 120) });
    return null;
  }
}

/** Verkoopprijs en inkoop in euro's voor een CJ-product (ook voor het zoekscherm, zodat de eigenaar de prijs vooraf ziet). */
export async function prijsVoorCj(inkoopUsdCents: number, naam: string, verzendUsdCents?: number): Promise<{ inkoopCents: number; prijsCents: number; margePct: number; verzendCents: number; koersDatum: string }> {
  const koersen = await ecbKoersen().catch(() => null);
  const inkoop = koersen ? naarEuroCents(inkoopUsdCents, "USD", koersen) : null;
  if (inkoop === null || !koersen) throw AppError.upstream("Er is nu geen dollarkoers (ECB) beschikbaar; probeer het straks opnieuw.");
  const [instel, beleid] = await Promise.all([leesCjInstellingen(), leesBeleidOpgeslagen()]);
  const marge = instel.margePct ?? beleid.margePct;
  // het echte tarief van CJ (dollars) als we dat hebben, anders de schatting uit de instellingen
  const verzend = (verzendUsdCents !== undefined ? naarEuroCents(verzendUsdCents, "USD", koersen) : null) ?? instel.verzendCents;
  const p = prijsUitInkoop(inkoop + verzend, marge, tariefVoor(naam));
  return { inkoopCents: inkoop, prijsCents: p.prijsCents, margePct: marge, verzendCents: verzend, koersDatum: koersen.datum };
}

/** Echte verzendkosten van CJ naar Nederland voor één stuk: eerst vanuit het ingestelde magazijn, anders vanuit China. */
async function verzendingVanCj(p: CjProduct): Promise<CjVerzending | null> {
  const vid = p.varianten[0]?.vid ?? p.pid;
  const instel = await leesCjInstellingen();
  for (const van of new Set([instel.land || "CN", "CN"])) {
    const v = await cjVerzendkosten(vid, van, "NL");
    if (v) return v;
  }
  return null;
}

const KLEDINGACHTIG = new Set<ShopCategorie>(["Kleding", "Tassen & schoenen", "Sport & buiten", "Werk & PBM"]);

/**
 * Het product overnemen. `actief`: meteen in de winkel zetten, maar alleen als de hoofdfoto gelukt is
 * (een product zonder foto gaat nooit aan). Een pid die al eerder is overgenomen, komt niet nog een keer.
 */
export interface ImportOpties {
  actorUserId: string | null;
  actief: boolean;
  categorie?: string | undefined;
}

export async function importeerCjProduct(pid: string, opties: ImportOpties): Promise<ImportUitkomst> {
  const sleutel = `${K_PID}${pid}`;
  const stand = leesClaim(await kvGet<unknown>(sleutel).catch(() => null));
  if (stand.soort === "product") {
    const b = await prisma.shopProduct.findUnique({ where: { id: stand.id }, select: { id: true, slug: true, name: true, priceCents: true, costCents: true, active: true, _count: { select: { variants: true } } } });
    if (b) return { bestaand: true, id: b.id, slug: b.slug, naam: b.name, prijsCents: b.priceCents, inkoopCents: b.costCents ?? 0, varianten: b._count.variants, fotos: 0, vertaald: true, actief: b.active, verzendCents: 0, verzendEcht: false, melding: "Stond al in de winkel." };
  }
  if (stand.soort === "bezig" && !stand.verlopen) throw AppError.conflict("Dit product wordt op dit moment al overgenomen. Wacht even en kijk bij Beheer → Webshop.");
  // de pid claimen vóór het aanmaken: twee klikken tegelijk geven anders twee producten. Een slot met een tijd erin:
  // breekt de app midden in een import af (uitrol, herstart), dan mag een volgende klik het na CLAIM_MAX_MS overnemen.
  const claim = { bezig: new Date().toISOString() };
  let geclaimd: boolean;
  if (stand.soort === "vrij") geclaimd = await kvSetIfAbsent(sleutel, claim);
  else if (stand.soort === "bezig" && stand.sinds) geclaimd = await kvVervangAlsVeld(sleutel, "bezig", stand.sinds, claim);
  else {
    // het oude losse woord "bezig" of een product dat niet meer bestaat: weg ermee en opnieuw claimen
    await kvDelete(sleutel).catch(() => undefined);
    geclaimd = await kvSetIfAbsent(sleutel, claim);
  }
  if (!geclaimd) throw AppError.conflict("Dit product wordt al overgenomen of staat er al.");
  try {
    return await overnemen(pid, opties);
  } catch (e) {
    // alleen ons eigen slot weghalen (niet dat van een klik die het intussen overnam)
    await kvVerwijderAlsVeld(sleutel, "bezig", claim.bezig).catch(() => undefined);
    throw e;
  }
}

async function overnemen(pid: string, opties: ImportOpties): Promise<ImportUitkomst> {
  const p: CjProduct = await cjProduct(pid);
  const verzending = await verzendingVanCj(p);
  const prijs = await prijsVoorCj(p.inkoopUsdCents, p.naamEn, verzending?.usdCents);
  const tekst = await vertaalVermelding(p.naamEn, p.omschrijvingEn);
  const categorie = categorieKeuze(opties.categorie, p.categorie);

  let slug = slugVan(tekst.naam) || `cj-${pid.toLowerCase()}`;
  for (let i = 2; await prisma.shopProduct.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugVan(tekst.naam) || "product"}-${i}`;

  // voorraad: product/query geeft die lang niet altijd mee; dan de voorraadlijst per product (anders staat alles "uitverkocht")
  if (p.varianten.length && p.varianten.every((v) => v.voorraad === 0)) {
    const perVid = await cjVoorraadPerVariant(p.pid);
    for (const v of p.varianten) v.voorraad = perVid.get(v.vid) ?? 0;
  }
  const varianten = p.varianten.length
    ? p.varianten
    : [{ vid: p.pid, sku: p.sku, naam: p.naamEn, maat: null, kleur: null, foto: null, inkoopUsdCents: p.inkoopUsdCents, voorraad: 0 }];
  const gezien = new Set<string>();
  const rijen = varianten
    .map((v) => ({ sku: onzeSku(v.sku), size: v.maat, color: v.kleur, stock: v.voorraad, vid: v.vid, cjSku: v.sku, usdCents: v.inkoopUsdCents }))
    .filter((v) => v.sku.length > 3 && !gezien.has(v.sku) && gezien.add(v.sku));
  const voorraad = rijen.reduce((s, v) => s + v.stock, 0);

  // een halve import van een vorige keer (zie herbruikbareWees in cj-core.ts) wordt aangevuld in plaats van een tweede
  // product zonder varianten te maken; hij houdt zijn eigen slug (van dezelfde naam)
  const wees = await weesVoorSkus(rijen.map((v) => v.sku));
  if (wees) slug = wees.slug;
  const gegevens = {
    name: tekst.naam,
    slug,
    description: tekst.omschrijving,
    category: categorie,
    gender: p.doelgroep,
    collection: null,
    badge: null,
    isBundle: false,
    priceCents: prijs.prijsCents,
    costCents: prijs.inkoopCents,
    stock: voorraad,
    active: false,
    sortOrder: 0,
  };
  const product = wees ? await prisma.shopProduct.update({ where: { id: wees.id }, data: gegevens }) : await prisma.shopProduct.create({ data: gegevens });
  if (rijen.length) {
    await prisma.shopProductVariant.createMany({ data: rijen.map((v) => ({ productId: product.id, size: v.size, color: v.color, priceCents: null, stock: v.stock, sku: v.sku })), skipDuplicates: true });
  }
  // skipDuplicates: een sku die al bestond is overgeslagen; zonder variant is er niets te kopen, dus dan niet aan
  const aantalVarianten = await prisma.shopProductVariant.count({ where: { productId: product.id } });

  // foto's: de eerste is de hoofdfoto; bij kleding en tassen is de tweede meestal gedragen (de "model"-foto op de kaart)
  const uploads: { id: string; url: string }[] = [];
  for (const [i, adres] of p.fotos.slice(0, MAX_FOTOS).entries()) {
    const u = await haalFoto(adres, `${slug}${i ? `-${i + 1}` : ""}`, opties.actorUserId);
    if (u) uploads.push(u);
  }
  const hoofd = uploads[0] ?? null;
  const model = KLEDINGACHTIG.has(categorie) ? (uploads[1] ?? null) : null;
  const kanAan = hoofd !== null && aantalVarianten > 0;
  // zonder Nederlandse tekst (het model was weg) gaat een product nooit aan, ook niet via het gewone importpad (18 nov:
  // 97 Engelse producten stonden live); het wacht op de Bijwerken-ronde, die het na de vertaling aanzet (activerenNaVertaling)
  const actief = opties.actief && kanAan && tekst.vertaald;
  const activerenNaVertaling = opties.actief && kanAan && !actief;
  await prisma.shopProduct.update({
    where: { id: product.id },
    data: {
      ...(hoofd ? { imageUploadId: hoofd.id, imageUrl: hoofd.url } : {}),
      ...(model ? { modelUploadId: model.id, modelPhotoUrl: model.url } : {}),
      fotos: uploads.slice(1).map((u) => u.url),
      active: actief,
    },
  });

  const koppeling: CjKoppeling = {
    pid: p.pid,
    sku: p.sku,
    varianten: Object.fromEntries(rijen.map((v) => [v.sku, { vid: v.vid, sku: v.cjSku, usdCents: v.usdCents }])),
    inkoopUsdCents: p.inkoopUsdCents,
    koersDatum: prijs.koersDatum,
    verzendCents: prijs.verzendCents,
    verzendBron: verzending ? "cj" : "schatting",
    ...(verzending?.dienst ? { verzendDienst: verzending.dienst } : {}),
    ...(verzending?.dagen ? { verzendDagen: verzending.dagen } : {}),
    geimporteerdOp: new Date().toISOString(),
    vertaald: tekst.vertaald,
    categorieAuto: p.categorie,
    ...(activerenNaVertaling ? { activerenNaVertaling: true } : {}),
  };
  await kvSet(`${K_PRODUCT}${product.id}`, koppeling);
  await kvSet(`${K_PID}${pid}`, product.id);
  const lijst = await cjProductIds();
  if (!lijst.includes(product.id)) await kvSet(K_LIJST, [...lijst, product.id]);
  await bewaarLinkBron(product.id, { pagina: `https://cjdropshipping.com/product/-p-${encodeURIComponent(pid)}.html`, foto: p.fotos[0] });
  await recordAudit({
    category: "ADMIN",
    action: "shop.product.cj-import",
    actorUserId: opties.actorUserId,
    actorLabel: "user",
    summary: `CJ-product overgenomen: ${tekst.naam} (${rijen.length} varianten, ${uploads.length} foto's, ${actief ? "aan" : "uit"}${wees ? ", halve import van eerder aangevuld" : ""})`,
    targetType: "shop-product",
    targetId: product.id,
  });

  let melding: string | null = null;
  if (!hoofd) melding = "De foto's van de leverancier waren niet over te nemen; het product staat uit tot er een foto is.";
  else if (aantalVarianten === 0) melding = "Geen enkele variant kon worden aangemaakt (de sku's bestonden al); het product staat uit.";
  else if (!tekst.vertaald) melding = activerenNaVertaling ? "De tekst kon nog niet worden vertaald (het model was weg); het product staat uit en gaat aan zodra de knop Bijwerken hem vertaalt." : "De tekst kon niet worden vertaald en staat nog in het Engels; pas hem aan in Beheer → Webshop.";
  else if (!verzending) melding = "CJ gaf geen verzendtarief naar Nederland; de prijs rekent met de schatting uit de instellingen.";
  return { bestaand: false, id: product.id, slug, naam: tekst.naam, prijsCents: prijs.prijsCents, inkoopCents: prijs.inkoopCents, varianten: aantalVarianten, fotos: uploads.length, vertaald: tekst.vertaald, actief, verzendCents: prijs.verzendCents, verzendEcht: verzending !== null, melding };
}

/**
 * Het product dat de sku's van deze import al heeft, als dat een halve import van eerder is (herbruikbareWees); anders
 * null. "Nooit verkocht" = geen bestelling met dit product of een van zijn varianten in de regels, en geen beoordeling.
 */
async function weesVoorSkus(skus: string[]): Promise<{ id: string; slug: string } | null> {
  if (!skus.length) return null;
  const varianten = await prisma.shopProductVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, product: { select: { id: true, slug: true, active: true } } } });
  if (!varianten.length) return null;
  const eerste = varianten[0]?.product;
  if (!eerste || varianten.some((v) => v.product.id !== eerste.id)) return null;
  const ids = [eerste.id, ...varianten.map((v) => v.id)];
  const [k, lijst, beoordelingen, besteld] = await Promise.all([
    leesCjKoppeling(eerste.id),
    cjProductIds(),
    prisma.shopReview.count({ where: { productId: eerste.id } }),
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "ShopOrder" WHERE "itemsJson"::text LIKE ANY(${ids.map((id) => `%${id}%`)})`,
  ]);
  const w = herbruikbareWees([{ id: eerste.id, slug: eerste.slug, active: eerste.active, heeftKoppeling: k !== null, inLijst: lijst.includes(eerste.id), verkocht: beoordelingen > 0 || (besteld[0]?.n ?? 0) > 0 }]);
  return w ? { id: w.id, slug: w.slug } : null;
}

interface OudUit {
  ids: string[];
  op: string;
}

/** Hoeveel producten de laatste keer zijn uitgezet (en dus met één knop terug kunnen). */
export async function oudAssortimentBewaard(): Promise<number> {
  const b = await kvGet<OudUit>(K_OUD_UIT).catch(() => null);
  return Array.isArray(b?.ids) ? b.ids.length : 0;
}

/**
 * Het oude assortiment uitzetten: precies de producten die nu aan staan, niet van CJ komen (KV-lijst of een
 * cj-sku) en niet van een verkoper zijn. De id's gaan in KV, zodat "Terugzetten" exact die weer aanzet.
 */
export async function oudAssortimentUit(actorUserId: string | null): Promise<number> {
  const vanCj = await cjProductIds();
  const oud = await prisma.shopProduct.findMany({
    where: { active: true, sellerTenantId: null, id: { notIn: vanCj }, variants: { none: { sku: { startsWith: CJ_SKU_VOORVOEGSEL } } } },
    select: { id: true },
  });
  const ids = oud.map((p) => p.id);
  if (!ids.length) return 0;
  const r = await prisma.shopProduct.updateMany({ where: { id: { in: ids }, active: true }, data: { active: false } });
  const eerder = await kvGet<OudUit>(K_OUD_UIT).catch(() => null);
  const alle = [...new Set([...(Array.isArray(eerder?.ids) ? eerder.ids : []), ...ids])];
  await kvSet(K_OUD_UIT, { ids: alle, op: new Date().toISOString() } satisfies OudUit);
  await recordAudit({ category: "ADMIN", action: "shop.product.oud-uit", actorUserId, actorLabel: "user", summary: `Oude assortiment uitgezet: ${r.count} producten`, targetType: "shop", targetId: "cj" });
  return r.count;
}

/** Precies de producten die "Oude assortiment uitzetten" uitzette weer aan (niet meer en niet minder). */
export async function oudAssortimentTerug(actorUserId: string | null): Promise<number> {
  const b = await kvGet<OudUit>(K_OUD_UIT).catch(() => null);
  const ids = Array.isArray(b?.ids) ? b.ids : [];
  if (!ids.length) return 0;
  const r = await prisma.shopProduct.updateMany({ where: { id: { in: ids }, active: false }, data: { active: true } });
  await kvDelete(K_OUD_UIT);
  await recordAudit({ category: "ADMIN", action: "shop.product.oud-terug", actorUserId, actorLabel: "user", summary: `Oude assortiment teruggezet: ${r.count} producten`, targetType: "shop", targetId: "cj" });
  return r.count;
}

export interface BijwerkUitkomst {
  bekeken: number;
  categorie: number;
  voorraad: number;
  vertaald: number;
  fouten: number;
  /** producten uit de vertaalachterstand die deze ronde vóór het gewone werk zijn gedaan (achterstandEerst) */
  achterstand: number;
  /** waar de volgende ronde verdergaat; null = alles gehad */
  volgende: number | null;
  totaal: number;
}

/** De product-id's waarvan de koppeling nog `vertaald: false` zegt, langst niet bijgewerkt eerst. */
async function onvertaaldeProductIds(limit: number): Promise<string[]> {
  const rijen = await prisma.$queryRaw<{ key: string }[]>`
    SELECT key FROM "KeyValueStore"
    WHERE key LIKE ${`${K_PRODUCT}%`} AND value->>'vertaald' = 'false'
    ORDER BY "updatedAt" ASC
    LIMIT ${limit}`;
  return rijen.map((r) => r.key.slice(K_PRODUCT.length)).filter(Boolean);
}

/** Alle CJ-producten in de winkel: de lijst in KV, plus alles met een cj-sku dat daar niet in staat. */
async function alleCjProductIds(): Promise<string[]> {
  const lijst = await cjProductIds();
  const extra = await prisma.shopProductVariant.findMany({ where: { sku: { startsWith: CJ_SKU_VOORVOEGSEL } }, select: { productId: true }, distinct: ["productId"] });
  return [...new Set([...lijst, ...extra.map((v) => v.productId)])];
}

/**
 * Een ronde langs alle CJ-producten (18 nov: 68 producten, veel in de verkeerde categorie door een vaste keuze bij
 * "Alle overnemen", bijna alles zonder voorraad, een deel half Duits). Per product: categorie volgens de nieuwste regels,
 * voorraad per variant, en een tekst die nog Engels of Duits is opnieuw vertalen. Stopt binnen `budgetMs`; `volgende`
 * zegt waar de volgende aanroep verdergaat.
 */
export async function bijwerkenVanCj(opties: { actorUserId: string | null; actorLabel?: string; vanaf?: number; budgetMs?: number }): Promise<BijwerkUitkomst> {
  const start = Date.now();
  const budget = opties.budgetMs ?? 200_000;
  const ids = await alleCjProductIds();
  const uit: BijwerkUitkomst = { bekeken: 0, categorie: 0, voorraad: 0, vertaald: 0, fouten: 0, achterstand: 0, volgende: null, totaal: ids.length };
  if (!ids.length) return uit; // niets te doen (en geen auditregel elke tien minuten vanuit de cron)
  const doe = async (id: string) => {
    try {
      const n = await bijwerkEen(id);
      uit.bekeken++;
      if (n.categorie) uit.categorie++;
      if (n.voorraad) uit.voorraad++;
      if (n.vertaald) uit.vertaald++;
    } catch (e) {
      uit.fouten++;
      logger.warn("cj: bijwerken mislukt", { error: (e as Error).message.slice(0, 120) });
    }
  };
  // eerst de vertaalachterstand (achterstandEerst in cj-core.ts), binnen een deel van het budget; staat het vertalen
  // stil na een storing, dan heeft dat geen zin en gaat de gewone ronde meteen door
  const achterstand = vertaalStoringActief() ? [] : achterstandEerst(ids, await onvertaaldeProductIds(ACHTERSTAND_PER_RONDE * 2).catch(() => []));
  for (const id of achterstand) {
    if (Date.now() - start > budget * ACHTERSTAND_BUDGET_DEEL || vertaalStoringActief()) break;
    await doe(id);
    uit.achterstand++;
  }
  let i = Math.max(0, opties.vanaf ?? 0);
  for (; i < ids.length; i++) {
    if (Date.now() - start > budget) break;
    const id = ids[i];
    if (!id) continue;
    await doe(id);
  }
  uit.volgende = i < ids.length ? i : null;
  await recordAudit({
    category: "ADMIN",
    action: "shop.product.cj-bijwerken",
    actorUserId: opties.actorUserId,
    actorLabel: opties.actorLabel ?? "user",
    summary: `CJ-producten bijgewerkt: ${uit.bekeken} bekeken, ${uit.categorie} van categorie, ${uit.voorraad} voorraad, ${uit.vertaald} vertaald, ${uit.fouten} mislukt${uit.achterstand ? `, ${uit.achterstand} uit de vertaalachterstand eerst` : ""}`,
    targetType: "shop-product",
    targetId: "cj",
  });
  return uit;
}

async function bijwerkEen(id: string): Promise<{ categorie: boolean; voorraad: boolean; vertaald: boolean }> {
  const geen = { categorie: false, voorraad: false, vertaald: false };
  const k = await leesCjKoppeling(id);
  const product = await prisma.shopProduct.findUnique({ where: { id }, select: { id: true, name: true, category: true, stock: true, variants: { select: { id: true, sku: true, stock: true } } } });
  if (!k || !product) return geen;
  const p = await cjProduct(k.pid);
  // levertijd: de termijn van CJ naar Nederland, één keer ophalen; staat daarna in de koppeling. Geeft CJ niets (18 nov:
  // freightCalculate gaf voor DE en CN een lege lijst), dan pas na een week opnieuw, niet elke ronde twee aanvragen
  const levertijdVragen = !k.verzendDagen && (!k.verzendGeprobeerdOp || Date.now() - Date.parse(k.verzendGeprobeerdOp) > 7 * 86_400_000);
  const verzending = levertijdVragen ? await verzendingVanCj(p) : null;

  // categorie: de automatische indeling met de nieuwste regels; koos de beheerder zelf iets anders sinds de vorige ronde, dan blijft dat
  const auto = categorieVanCj(p.categorieCj, p.naamEn);
  const handmatig = k.categorieAuto !== undefined && k.categorieAuto !== product.category;
  const categorie = !handmatig && auto !== product.category;

  // voorraad per variant; staat alles op 0 in product/query, dan de voorraadlijst per product
  let perVid = new Map(p.varianten.map((v) => [v.vid, v.voorraad]));
  if (!perVid.size || [...perVid.values()].every((n) => n === 0)) perVid = await cjVoorraadPerVariant(k.pid);
  const perSku = new Map<string, number>();
  for (const [sku, v] of Object.entries(k.varianten)) perSku.set(sku, perVid.get(v.vid) ?? 0);
  let voorraad = false;
  let totaal = 0;
  for (const v of product.variants) {
    const n = perSku.get(v.sku);
    if (n === undefined) {
      totaal += v.stock;
      continue;
    }
    totaal += n;
    if (n !== v.stock) {
      await prisma.shopProductVariant.update({ where: { id: v.id }, data: { stock: n } });
      voorraad = true;
    }
  }

  // tekst: nog Engels (vertalen mislukte toen, bv. tijdens een uitrol) of half Duits → nog een keer
  let tekst: { naam: string; omschrijving: string } | null = null;
  if (!k.vertaald || lijktDuits(product.name)) {
    const t = await vertaalVermelding(p.naamEn, p.omschrijvingEn);
    if (t.vertaald) tekst = t;
  }

  await prisma.shopProduct.update({
    where: { id },
    data: {
      ...(categorie ? { category: auto } : {}),
      ...(totaal !== product.stock ? { stock: totaal } : {}),
      ...(tekst ? { name: tekst.naam, description: tekst.omschrijving } : {}),
      // de wachtrij wilde dit product aan en wachtte alleen op de vertaling
      ...(tekst && k.activerenNaVertaling ? { active: true } : {}),
    },
  });
  await kvSet(`${K_PRODUCT}${id}`, {
    ...k,
    categorieAuto: auto,
    ...(tekst ? { vertaald: true, activerenNaVertaling: false } : {}),
    ...(verzending?.dagen ? { verzendDagen: verzending.dagen, verzendDienst: verzending.dienst } : {}),
    ...(levertijdVragen && !verzending?.dagen ? { verzendGeprobeerdOp: new Date().toISOString() } : {}),
    bijgewerktOp: new Date().toISOString(),
  } satisfies CjKoppeling);
  return { categorie, voorraad: voorraad || totaal !== product.stock, vertaald: tekst !== null };
}
