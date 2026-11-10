import type { SiteProduct, Winkel } from "@/lib/sites/types";
import { isUitverkocht } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// "Mail me als het er weer is" (Studio → Webshop → Groei): op een uitverkocht
// product laat een bezoeker zijn e-mailadres achter. Komt het product terug
// (voorraad weer boven 0, of "uitverkocht" uit), dan krijgt iedereen op de lijst
// één mail en is zijn adres daarna weg. Hier de regels, zonder opslag; de opslag,
// het formulier en de mails: lib/sites/voorraadmelding-opslag.ts.
// ---------------------------------------------------------------------------

/** KV "site-voorraadmelding:<siteId>:<productId>:<code>" — één wachtende: { email, at }. */
export const VOORRAADMELDING_PREFIX = "site-voorraadmelding:";

/** Zoveel mensen kunnen op één product wachten. */
export const MAX_WACHTENDEN = 500;

/** Komt een product niet terug, dan is het adres na een half jaar toch weg (elke nacht, lib/sites/voorraadmelding-opslag.ts). */
export const BEWAAR_DAGEN = 180;

export interface Wachtende {
  email: string;
  /** wanneer hij zich aanmeldde (ISO) */
  at: string;
}

/** Een e-mailadres uit het formulier, in kleine letters; null als het er geen is. */
export function leesEmail(waarde: unknown): string | null {
  const s = String(waarde ?? "").trim().toLowerCase();
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/** Te bestellen: zichtbaar en niet uitverkocht. */
export const bestelbaar = (p: Pick<SiteProduct, "zichtbaar" | "uitverkocht" | "voorraad">): boolean => p.zichtbaar && !isUitverkocht(p);

/** Na het opslaan van de winkel: de producten die eerst niet te bestellen waren en nu wel (dan gaan de mails). */
export function weerBestelbaar(voor: Winkel, na: Winkel): string[] {
  const eerst = new Map(voor.producten.map((p) => [p.id, p]));
  return na.producten.filter((p) => {
    const oud = eerst.get(p.id);
    return oud !== undefined && !bestelbaar(oud) && bestelbaar(p);
  }).map((p) => p.id);
}

/** De producten die uit de winkel zijn gehaald: hun wachtlijst heeft geen doel meer. */
export function verdwenenProducten(voor: Winkel, na: Winkel): string[] {
  const nog = new Set(na.producten.map((p) => p.id));
  return voor.producten.filter((p) => !nog.has(p.id)).map((p) => p.id);
}

/** Hoeveel mensen per product wachten, uit de sleutels van één site (de adressen zelf zijn niet nodig). */
export function telPerProduct(sleutels: string[], siteId: string): Map<string, number> {
  const voor = `${VOORRAADMELDING_PREFIX}${siteId}:`;
  const telling = new Map<string, number>();
  for (const k of sleutels) {
    if (!k.startsWith(voor)) continue;
    const productId = k.slice(voor.length).split(":")[0] ?? "";
    if (productId) telling.set(productId, (telling.get(productId) ?? 0) + 1);
  }
  return telling;
}

const datum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/** De ene mail aan een wachtende. `link` is de productpagina op het adres van de winkel. */
export function voorraadMail(m: { product: string; winkel: string; link: string; sinds: string }): { onderwerp: string; tekst: string } {
  const sinds = Number.isFinite(Date.parse(m.sinds)) ? ` op ${datum.format(new Date(m.sinds))}` : "";
  return {
    onderwerp: `${m.product} is weer op voorraad bij ${m.winkel}`,
    tekst: [
      `Goed nieuws: ${m.product} is weer op voorraad bij ${m.winkel}.`,
      "",
      "Bekijk het en bestel het hier:",
      m.link,
      "",
      `Je vroeg${sinds} om een mail zodra het er weer was. Dit is die ene mail: je e-mailadres is nu gewist en je krijgt hierover niets meer.`,
    ].join("\n"),
  };
}
