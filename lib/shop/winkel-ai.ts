// De Winkel-AI (Admin → Winkel-AI): uit een idee een volledig productconcept
// (omschrijving, maten, kleuren, prijs uit de marge), een inkoopadvies uit
// voorraad en verkoop, en trends met bronnen. Alles is een VOORSTEL: een nieuw
// product staat altijd uit (active: false) tot de eigenaar het goedkeurt en er
// een echte foto staat, en er wordt nooit iets besteld of betaald.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { chat, chatJson } from "@/lib/ai/client";
import { modelForPurpose } from "@/lib/ai/models";
import { geminiZoekTekst } from "@/lib/ai/gemini-media";
import { gratisAan, primeGratis } from "@/lib/ai/gratis";
import { extractJson } from "@/lib/ai/client";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { generateAndAttachConceptPhoto } from "@/lib/shop/concept-photos";
import { bewaarLinkBron, koppelFotoVanAdres } from "@/lib/shop/link-product-server";
import { SOORTEN, isSoort, type Soort } from "@/lib/shop/paskamer";
import {
  STANDAARD_BELEID, WINKEL_CATEGORIEEN, inkoopAdvies, leesBeleid, leesConcept, maakVarianten, prijsUitInkoop, schoneKleuren, schoneMaten, slugVan, tariefVoor,
  type InkoopRegel, type MargeBeleid,
} from "@/lib/shop/winkel-ai-core";

const K_BELEID = "shop:ai:beleid";
const K_PASVORMEN = "shop:pasvormen";

export const CATEGORIEEN = WINKEL_CATEGORIEEN;

// ---------------------------------------------------------------------------
// Beleid (marge, levertijd) en het register van pasvormen
// ---------------------------------------------------------------------------

export async function leesBeleidOpgeslagen(): Promise<MargeBeleid> {
  return leesBeleid(await kvGet<unknown>(K_BELEID).catch(() => null));
}
export async function zetBeleid(v: unknown): Promise<MargeBeleid> {
  const b = leesBeleid(v);
  await kvSet(K_BELEID, b);
  return b;
}

/** productId → soort (voor de paskamer): wat de Winkel-AI of de eigenaar vastlegde. */
export async function leesPasvormen(): Promise<Record<string, Soort>> {
  const v = await kvGet<Record<string, unknown>>(K_PASVORMEN).catch(() => null);
  const uit: Record<string, Soort> = {};
  for (const [id, s] of Object.entries(v ?? {})) if (isSoort(s)) uit[id] = s;
  return uit;
}
export async function zetPasvorm(productId: string, soort: Soort | null): Promise<void> {
  const nu = await leesPasvormen();
  if (soort) nu[productId] = soort;
  else delete nu[productId];
  await kvSet(K_PASVORMEN, nu);
}

// ---------------------------------------------------------------------------
// Productconcept
// ---------------------------------------------------------------------------

export type Concept = {
  name: string;
  category: (typeof CATEGORIEEN)[number];
  gender: "heren" | "vrouwen" | "kinderen" | "unisex" | null;
  collection: string | null;
  badge: string | null;
  description: string;
  bullets: string[];
  sizes: string[];
  colors: string[];
  soort: Soort | null;
};

export type ConceptUitkomst = { concept: Concept; prijs: { prijsCents: number; exclCents: number; margeEchtPct: number } | null; beleid: MargeBeleid };

const SYSTEEM = `Je bent productredacteur van de ZekerFlex-webshop voor werkkleding, PBM, kleding en werkdag-artikelen. Je schrijft in gewoon, vlot Nederlands, zonder Engels en zonder opsmuk.
Regels: verzin GEEN certificeringen, EN-normen, veiligheidsklassen (S1/S3, niveau 5), merknamen, materialen, gewichten of maten die de eigenaar niet noemde. De tekst mag ook GEEN levertijd, voorraad, merk-, CE-, keurmerk- of kwaliteitsbelofte bevatten (dus niet "snel geleverd", "op voorraad", "CE-gecertificeerd", "keurmerk", "topkwaliteit" of "premium"). Beschrijf wat het product is en waarvoor het handig is, in 2-4 zinnen (maximaal 450 tekens). Kies maten en kleuren die bij dit soort product gangbaar zijn (kleding: XS-XXL; schoenen: 38-47; kinderen: 98-170; accessoires: geen maten). Kies bij "soort" één waarde uit: ${SOORTEN.join(", ")}, of null als het niet te dragen is (fles, tas, boek).
Antwoord uitsluitend met JSON: {"name","category":"Werk & PBM|Kleding|Werkdag|Cadeaus","gender":"heren|vrouwen|kinderen|unisex|null","collection":null,"badge":null,"description","bullets":[],"sizes":[],"colors":[],"soort"}.`;

/** Uit een idee (en eventuele leveranciersomschrijving) een volledig concept, plus een prijsvoorstel uit de inkoopprijs. */
export async function maakConcept(inv: { idee: string; doelgroep?: string | undefined; inkoopCents?: number | undefined }): Promise<ConceptUitkomst> {
  const beleid = await leesBeleidOpgeslagen();
  const ruw = await chatJson<unknown>({
    purpose: "shop-product",
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      { role: "system", content: SYSTEEM },
      { role: "user", content: `Idee van de eigenaar: ${inv.idee.slice(0, 1500)}${inv.doelgroep ? `\nDoelgroep: ${inv.doelgroep.slice(0, 100)}` : ""}` },
    ],
  }).catch((e: unknown) => {
    // alleen een onleesbaar antwoord opvangen; een AI die niet bereikbaar is, blijft een eigen melding
    if (e instanceof Error && /gaf (geen|onleesbare) JSON/.test(e.message)) return null;
    throw e;
  });
  // soepel lezen (lib/shop/winkel-ai-core.ts): het eigen, kleinere model wijkt vaak net af van het voorbeeld
  const d = leesConcept(ruw);
  if (!d) throw AppError.upstream("De AI gaf geen bruikbaar productconcept. Probeer het met iets meer uitleg opnieuw.");
  const concept: Concept = { ...d, soort: isSoort(d.soort) ? d.soort : null };
  const prijs = inv.inkoopCents && inv.inkoopCents > 0 ? prijsUitInkoop(inv.inkoopCents, beleid.margePct, tariefVoor(concept.name)) : null;
  return { concept, prijs, beleid };
}

export const bewaarSchema = z.object({
  concept: z.object({
    name: z.string().trim().min(2).max(120),
    category: z.enum(CATEGORIEEN),
    gender: z.enum(["heren", "vrouwen", "kinderen", "unisex"]).nullable(),
    collection: z.string().trim().max(60).nullable(),
    badge: z.string().trim().max(40).nullable(),
    description: z.string().trim().min(10).max(600),
    sizes: z.array(z.string().max(12)).max(12),
    colors: z.array(z.string().max(24)).max(8),
    soort: z.string().nullable(),
  }),
  inkoopCents: z.number().int().min(0).max(1_000_000).nullable(),
  prijsCents: z.number().int().min(1).max(1_000_000),
  metFoto: z.boolean().default(false),
  /** het adres van een productfoto (van de leverancier): wordt overgenomen naar onze eigen opslag; gaat vóór de AI-foto */
  fotoUrl: z.string().trim().max(600).regex(/^https:\/\/\S+$/, "Het adres van de foto begint met https://.").optional(),
  /** de pagina van de leverancier waar de gegevens vandaan komen; wordt bij het concept bewaard */
  bronUrl: z.string().trim().max(600).regex(/^https:\/\/\S+$/).optional(),
});

export type BewaardConcept = { id: string; slug: string; fotoGelukt: boolean; fotoMelding: string | null };

/** Het concept opslaan als uitstaand product met varianten, inkoopprijs en (optioneel) een AI-impressiefoto. */
export async function bewaarConcept(inv: z.infer<typeof bewaarSchema>, actorUserId: string): Promise<BewaardConcept> {
  const c = inv.concept;
  let slug = slugVan(c.name) || "product";
  for (let i = 2; await prisma.shopProduct.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugVan(c.name)}-${i}`;
  const maten = schoneMaten(c.sizes);
  const kleuren = schoneKleuren(c.colors);
  const varianten = maakVarianten(slug, maten, kleuren, 0);
  const product = await prisma.shopProduct.create({
    data: {
      name: c.name, slug, description: c.description, category: c.category, gender: c.gender, collection: c.collection, badge: c.badge,
      isBundle: false, priceCents: inv.prijsCents, costCents: inv.inkoopCents, stock: 0,
      active: false, // altijd uit tot de eigenaar goedkeurt en er een echte foto staat
      sortOrder: 0,
    },
  });
  await prisma.shopProductVariant.createMany({ data: varianten.map((v) => ({ productId: product.id, size: v.size, color: v.color, priceCents: null, stock: v.stock, sku: v.sku })) });
  if (isSoort(c.soort)) await zetPasvorm(product.id, c.soort);
  await recordAudit({ category: "ADMIN", action: "shop.product.ai-concept", actorUserId, actorLabel: "user", summary: `Winkel-AI maakte conceptproduct: ${product.name}`, targetType: "shop-product", targetId: product.id });

  let fotoGelukt = false;
  let fotoMelding: string | null = null;
  await bewaarLinkBron(product.id, { pagina: inv.bronUrl, foto: inv.fotoUrl });
  if (inv.fotoUrl) {
    try {
      await koppelFotoVanAdres(product.id, inv.fotoUrl, actorUserId);
      fotoGelukt = true;
    } catch (e) {
      fotoMelding = e instanceof AppError ? e.message : "De foto overnemen lukte niet.";
      logger.warn("winkel-ai: foto van adres mislukt", { error: (e as Error).message.slice(0, 160) });
    }
  } else if (inv.metFoto) {
    try {
      await generateAndAttachConceptPhoto(product.id, actorUserId);
      fotoGelukt = true;
    } catch (e) {
      fotoMelding = e instanceof AppError ? e.message : "De foto maken lukte niet.";
      logger.warn("winkel-ai: conceptfoto mislukt", { error: (e as Error).message });
    }
  }
  return { id: product.id, slug, fotoGelukt, fotoMelding };
}

/** Een product dat de eigenaar zelf uploadt: de soort voor de paskamer vaststellen als de naam het niet verraadt (best effort, nooit blokkerend). */
export async function bepaalSoort(product: { id: string; name: string; description: string; category: string }): Promise<Soort | null> {
  if (product.category === "Werkdag") return null;
  try {
    const r = await chatJson<{ soort?: unknown }>({
      purpose: "shop-product",
      temperature: 0,
      maxTokens: 60,
      messages: [
        { role: "system", content: `Kies welk kledingstuk dit product is. Antwoord uitsluitend met JSON {"soort": "..."} met één waarde uit: ${SOORTEN.join(", ")}, of null als het niet te dragen is (fles, tas, boek, notitieblok).` },
        { role: "user", content: `${product.name}. ${product.description}`.slice(0, 600) },
      ],
    });
    if (isSoort(r.soort)) {
      await zetPasvorm(product.id, r.soort);
      return r.soort;
    }
  } catch (e) {
    logger.warn("winkel-ai: soort bepalen mislukt", { error: (e as Error).message });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inkoopadvies
// ---------------------------------------------------------------------------

type Regel = { variantId?: string; qty?: number };

export async function maakInkoopAdvies(): Promise<{ regels: InkoopRegel[]; beleid: MargeBeleid }> {
  const beleid = await leesBeleidOpgeslagen();
  const sinds = new Date(Date.now() - 30 * 86_400_000);
  const [varianten, orders] = await Promise.all([
    prisma.shopProductVariant.findMany({ where: { product: { active: true } }, select: { id: true, size: true, color: true, stock: true, product: { select: { name: true, costCents: true } } } }),
    prisma.shopOrder.findMany({ where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] }, createdAt: { gte: sinds } }, select: { itemsJson: true } }),
  ]);
  const verkocht = new Map<string, number>();
  for (const o of orders) for (const l of (o.itemsJson as unknown as Regel[]) ?? []) if (l.variantId) verkocht.set(l.variantId, (verkocht.get(l.variantId) ?? 0) + Math.max(0, l.qty ?? 0));
  const regels = inkoopAdvies(
    varianten.map((v) => ({ variantId: v.id, productNaam: v.product.name, size: v.size, color: v.color, stock: v.stock, verkocht30: verkocht.get(v.id) ?? 0, inkoopCents: v.product.costCents })),
    beleid,
  );
  return { regels, beleid };
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type Trend = { naam: string; waarom: string; doelgroep: string; soort: string | null; seizoen: string | null };
export type TrendUitkomst = { trends: Trend[]; bronnen: { titel: string; url: string }[]; metWeb: boolean; opgehaald: string };

const maand = () => new Date().toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/** Wat er nu trending is in werk- en vrijetijdskleding voor Nederland, met bronnen van het web als Google zoeken toestaat. */
export async function zoekTrends(focus?: string): Promise<TrendUitkomst> {
  const vraag = `Wat zijn op dit moment (${maand()}) de belangrijkste trends in werkkleding, PBM en workwear/casual kleding voor de Nederlandse markt${focus ? `, met focus op: ${focus.slice(0, 120)}` : ""}? Geef 6 concrete productideeën die een webshop voor flexwerkers en bedrijven kan verkopen. Antwoord uitsluitend met een JSON-lijst van objecten {"naam","waarom","doelgroep","soort","seizoen"}, in het Nederlands, kort en feitelijk, zonder verzonnen cijfers. "soort" is een van: ${SOORTEN.join(", ")} of null.`;
  let tekst = "";
  let bronnen: { titel: string; url: string }[] = [];
  let metWeb = false;
  // Zoeken op internet kan alleen bij Google (Gemini). Met "alles gratis" aan (lib/ai/gratis.ts)
  // vragen we Google niets, en het eigen model heeft een naam die Google niet kent (gaf een 404).
  await primeGratis();
  const zoekModel = modelForPurpose("shop-trends");
  if (!gratisAan() && zoekModel.startsWith("gemini")) {
    try {
      const r = await geminiZoekTekst(vraag, zoekModel);
      tekst = r.tekst;
      bronnen = r.bronnen;
      metWeb = true;
    } catch (e) {
      logger.info("winkel-ai: trends zonder web", { reden: (e as Error).message.slice(0, 120) });
    }
  }
  if (!metWeb) tekst = (await chat({ purpose: "shop-trends", temperature: 0.4, maxTokens: 900, messages: [{ role: "user", content: vraag }] })).text;
  const lijst = extractJson<unknown>(tekst);
  const trends: Trend[] = (Array.isArray(lijst) ? lijst : []).flatMap((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    return typeof o.naam === "string" && typeof o.waarom === "string"
      ? [{ naam: o.naam.slice(0, 100), waarom: o.waarom.slice(0, 300), doelgroep: String(o.doelgroep ?? "").slice(0, 100), soort: isSoort(o.soort) ? (o.soort as string) : null, seizoen: o.seizoen ? String(o.seizoen).slice(0, 40) : null }]
      : [];
  });
  if (trends.length === 0) throw AppError.upstream("De AI gaf geen trends terug. Probeer het zo nog eens.");
  return { trends: trends.slice(0, 8), bronnen, metWeb, opgehaald: new Date().toISOString() };
}

export { STANDAARD_BELEID };
