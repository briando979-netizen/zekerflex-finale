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
import { chatJson } from "@/lib/ai/client";
import { kvDelete, kvGet, kvSet, kvSetIfAbsent, kvVervangAlsVeld, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { storeUpload } from "@/lib/storage/local";
import { ecbKoersen } from "@/lib/integrations/wisselkoers-server";
import { naarEuroCents } from "@/lib/integrations/wisselkoers";
import { bewaarLinkBron } from "@/lib/shop/link-product-server";
import { leesBeleidOpgeslagen } from "@/lib/shop/winkel-ai";
import { prijsUitInkoop, slugVan, tariefVoor } from "@/lib/shop/winkel-ai-core";
import { cjProduct, cjVerzendkosten } from "@/lib/shop/cj/cj-client";
import { categorieKeuze, leesClaim, onzeSku, type CjProduct, type CjVerzending } from "@/lib/shop/cj/cj-core";
import type { ShopCategorie } from "@/lib/shop/categorieen";

const K_INSTEL = "shop:cj:instellingen";
const K_PID = "shop:cj:pid:";
const K_PRODUCT = "shop:cj:product:";
const K_LIJST = "shop:cj:producten";
const K_OUD_UIT = "shop:cj:oud-uit";
/** onze variant-sku's van CJ beginnen hiermee (cj-core.ts onzeSku): zo herken je een CJ-product ook zonder KV */
export const CJ_SKU_VOORVOEGSEL = "cj-";
/** zoveel foto's per product (hoofdfoto + extra) */
const MAX_FOTOS = 6;

export interface CjInstellingen {
  /** verzendkosten per stuk die in de verkoopprijs worden meegerekend (CJ rekent ze per bestelling aan ons) */
  verzendCents: number;
  /** alleen producten met voorraad in dit land zoeken (DE = Europees magazijn, sneller en zonder invoer); leeg = overal */
  land: string;
  /** eigen marge voor leveranciersproducten; null = het beleid van de Winkel-AI */
  margePct: number | null;
}
export const STANDAARD_INSTELLINGEN: CjInstellingen = { verzendCents: 450, land: "DE", margePct: null };

export function leesInstellingen(v: unknown): CjInstellingen {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const verzend = typeof o.verzendCents === "number" && Number.isFinite(o.verzendCents) ? Math.min(5000, Math.max(0, Math.round(o.verzendCents))) : STANDAARD_INSTELLINGEN.verzendCents;
  const land = typeof o.land === "string" && /^[A-Za-z]{2}$/.test(o.land.trim()) ? o.land.trim().toUpperCase() : typeof o.land === "string" && o.land.trim() === "" ? "" : STANDAARD_INSTELLINGEN.land;
  const marge = typeof o.margePct === "number" && Number.isFinite(o.margePct) ? Math.min(90, Math.max(5, Math.round(o.margePct))) : null;
  return { verzendCents: verzend, land, margePct: marge };
}
export async function leesCjInstellingen(): Promise<CjInstellingen> {
  return leesInstellingen(await kvGet<unknown>(K_INSTEL).catch(() => null));
}
export async function zetCjInstellingen(v: unknown): Promise<CjInstellingen> {
  const i = leesInstellingen(v);
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
  geimporteerdOp: string;
  vertaald: boolean;
}

export async function leesCjKoppeling(productId: string): Promise<CjKoppeling | null> {
  return kvGet<CjKoppeling>(`${K_PRODUCT}${productId}`).catch(() => null);
}
/** Alle product-id's die van CJ komen. */
export async function cjProductIds(): Promise<string[]> {
  const l = await kvGet<string[]>(K_LIJST).catch(() => null);
  return Array.isArray(l) ? l.filter((x) => typeof x === "string") : [];
}

const VERTAAL = `Je vertaalt een productvermelding van een leverancier naar gewoon, vlot Nederlands voor een webshop. Geen Engels, geen opsmuk, geen beloftes over levertijd, voorraad, keurmerken, certificaten of kwaliteit ("premium", "topkwaliteit"). Verzin niets wat er niet staat. De naam: kort en duidelijk (maximaal 70 tekens, geen hoofdletters-schreeuw, geen merknaam die er niet staat). De omschrijving: 2 tot 4 zinnen, maximaal 450 tekens, wat het is en waarvoor het handig is.
Antwoord uitsluitend met JSON: {"naam":"…","omschrijving":"…"}.`;

/** Naam en omschrijving in het Nederlands; lukt het niet, dan de Engelse tekst (en `vertaald: false`). */
export async function vertaalVermelding(naamEn: string, omschrijvingEn: string): Promise<{ naam: string; omschrijving: string; vertaald: boolean }> {
  const terugval = { naam: naamEn.slice(0, 120), omschrijving: (omschrijvingEn || naamEn).slice(0, 600), vertaald: false };
  try {
    const r = await chatJson<{ naam?: unknown; omschrijving?: unknown }>({
      purpose: "shop-product",
      temperature: 0.2,
      maxTokens: 500,
      messages: [
        { role: "system", content: VERTAAL },
        { role: "user", content: `Naam: ${naamEn.slice(0, 200)}\nOmschrijving: ${(omschrijvingEn || "(geen)").slice(0, 1200)}` },
      ],
    });
    const naam = typeof r.naam === "string" ? r.naam.trim().slice(0, 120) : "";
    const omschrijving = typeof r.omschrijving === "string" ? r.omschrijving.trim().slice(0, 600) : "";
    if (naam.length < 2 || omschrijving.length < 10) return terugval;
    return { naam, omschrijving, vertaald: true };
  } catch (e) {
    logger.warn("cj: vertalen mislukt, Engelse tekst blijft staan", { error: (e as Error).message.slice(0, 120) });
    return terugval;
  }
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
    const foto = await importRemoteImage(adres);
    const up = await storeUpload({ filename: `${naam}.webp`, mimeType: foto.mime, bytes: foto.bytes, uploadedById: actorUserId });
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
export async function importeerCjProduct(pid: string, opties: { actorUserId: string | null; actief: boolean; categorie?: string | undefined }): Promise<ImportUitkomst> {
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

async function overnemen(pid: string, opties: { actorUserId: string | null; actief: boolean; categorie?: string | undefined }): Promise<ImportUitkomst> {
  const p: CjProduct = await cjProduct(pid);
  const verzending = await verzendingVanCj(p);
  const prijs = await prijsVoorCj(p.inkoopUsdCents, p.naamEn, verzending?.usdCents);
  const tekst = await vertaalVermelding(p.naamEn, p.omschrijvingEn);
  const categorie = categorieKeuze(opties.categorie, p.categorie);

  let slug = slugVan(tekst.naam) || `cj-${pid.toLowerCase()}`;
  for (let i = 2; await prisma.shopProduct.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugVan(tekst.naam) || "product"}-${i}`;

  const varianten = p.varianten.length
    ? p.varianten
    : [{ vid: p.pid, sku: p.sku, naam: p.naamEn, maat: null, kleur: null, foto: null, inkoopUsdCents: p.inkoopUsdCents, voorraad: 0 }];
  const gezien = new Set<string>();
  const rijen = varianten
    .map((v) => ({ sku: onzeSku(v.sku), size: v.maat, color: v.kleur, stock: v.voorraad, vid: v.vid, cjSku: v.sku, usdCents: v.inkoopUsdCents }))
    .filter((v) => v.sku.length > 3 && !gezien.has(v.sku) && gezien.add(v.sku));
  const voorraad = rijen.reduce((s, v) => s + v.stock, 0);

  const product = await prisma.shopProduct.create({
    data: {
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
    },
  });
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
  const actief = opties.actief && hoofd !== null && aantalVarianten > 0;
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
    geimporteerdOp: new Date().toISOString(),
    vertaald: tekst.vertaald,
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
    summary: `CJ-product overgenomen: ${tekst.naam} (${rijen.length} varianten, ${uploads.length} foto's, ${actief ? "aan" : "uit"})`,
    targetType: "shop-product",
    targetId: product.id,
  });

  let melding: string | null = null;
  if (!hoofd) melding = "De foto's van de leverancier waren niet over te nemen; het product staat uit tot er een foto is.";
  else if (aantalVarianten === 0) melding = "Geen enkele variant kon worden aangemaakt (de sku's bestonden al); het product staat uit.";
  else if (!tekst.vertaald) melding = "De tekst kon niet worden vertaald en staat nog in het Engels; pas hem aan in Beheer → Webshop.";
  else if (!verzending) melding = "CJ gaf geen verzendtarief naar Nederland; de prijs rekent met de schatting uit de instellingen.";
  return { bestaand: false, id: product.id, slug, naam: tekst.naam, prijsCents: prijs.prijsCents, inkoopCents: prijs.inkoopCents, varianten: aantalVarianten, fotos: uploads.length, vertaald: tekst.vertaald, actief, verzendCents: prijs.verzendCents, verzendEcht: verzending !== null, melding };
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
