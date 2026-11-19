import { schoonTekst, type Uitkomst } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// De starterspagina (/starters): wat een starter bij ZekerFlex kan regelen, en het
// aanvraagformulier "Vertel wat je wilt starten". Puur bestand (ook voor het
// formulier in de browser en de test). Elk onderdeel verwijst naar een bestaand
// item in lib/marketing/aanbod.ts; de pagina toont alleen wat daar op
// "beschikbaar" staat. Per onderdeel staat eerlijk wat je eerst gratis ziet en
// wanneer je pas betaalt. Geen prijzen hier: die komen uit het aanbod en uit
// lib/advertentie/regels.ts.
// ---------------------------------------------------------------------------

export interface StartersOnderdeel {
  /** slug in lib/marketing/aanbod.ts */
  slug: string;
  /** naam op de pagina en in het formulier */
  naam: string;
  /** wat je eerst ziet, zonder te betalen */
  // wanneer je betaalt: bij het logo en de advertentie pas na je eigen voorbeeld; bij de domeinnaam bij het bestellen;
  // voor website, webshop en zakelijke e-mail staat de prijs niet vast (aanbod: "Op aanvraag"), je krijgt hem eerst
  eerst: string;
  /** wanneer je betaalt */
  betaal: string;
  knop: string;
  /** een eigen adres voor de knop (anders de pagina van het aanbod) */
  href?: string;
  /** eerst kijken: een tweede link */
  kijk?: { label: string; href: string };
}

export const STARTERS_ONDERDELEN: StartersOnderdeel[] = [
  {
    slug: "logo-maker",
    naam: "Een logo",
    eerst: "Je vult je bedrijfsnaam in en ziet meteen zes logo's in jouw kleur en sfeer.",
    betaal: "Pas als je er een wilt hebben. Dan krijg je het zonder watermerk, in vijf bestanden.",
    knop: "Maak mijn logo",
  },
  {
    slug: "domeinnaam",
    naam: "Een domeinnaam",
    eerst: "Je zoekt gratis of jouw naam nog vrij is.",
    betaal: "Bij het bestellen van de naam. Zoeken kost niets.",
    knop: "Zoek mijn domeinnaam",
  },
  {
    slug: "website",
    naam: "Een website",
    eerst: "Je bekijkt de websites die we echt hebben gemaakt en vertelt je wensen. Je krijgt eerst een voorbeeld te zien.",
    betaal: "Je krijgt eerst een prijs. Je zit nergens aan vast voordat je ja zegt.",
    knop: "Bekijk wat we maakten",
    href: "/website-maken#voorbeelden",
  },
  {
    slug: "webshop",
    naam: "Een webshop",
    eerst: "Je vertelt je wensen en krijgt eerst een voorbeeld van jouw webshop te zien.",
    betaal: "Je krijgt eerst een prijs. Je zit nergens aan vast voordat je ja zegt.",
    knop: "Vertel je wensen",
    href: "/website-maken#aanvraag",
  },
  {
    slug: "advertentie-op-maat",
    naam: "Een advertentie",
    eerst: "Je vult in wat je aanbiedt en ziet meteen je advertentie in drie ontwerpen.",
    betaal: "Pas als je hem wilt hebben. Dan krijg je hem zonder watermerk, in drie formaten.",
    knop: "Maak mijn advertentie",
  },
  {
    slug: "zakelijke-mail",
    naam: "Zakelijke e-mail",
    eerst: "Een adres op je eigen domein, zoals info@jouwzaak.nl. Dat kan op een domeinnaam die je via ZekerFlex neemt.",
    betaal: "Je krijgt eerst een prijs. Het hoort bij je domeinnaam en je regelt het in je account.",
    knop: "Lees meer over zakelijke e-mail",
  },
];

export const STARTERS_SLUGS = STARTERS_ONDERDELEN.map((o) => o.slug);

export const STARTERS_GRENS = { naam: 80, email: 200, telefoon: 30, idee: 120, toelichting: 1000 } as const;

export interface StartersAanvraag {
  naam: string;
  email: string;
  telefoon?: string;
  /** bedrijfsnaam of idee */
  idee: string;
  /** slugs uit STARTERS_ONDERDELEN */
  nodig: string[];
  toelichting?: string;
}

const veld = (bron: unknown, naam: string): unknown => (bron && typeof bron === "object" ? (bron as Record<string, unknown>)[naam] : undefined);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function valideerStarter(ruw: unknown): Uitkomst<StartersAanvraag> {
  const naam = schoonTekst(veld(ruw, "naam"), STARTERS_GRENS.naam);
  const emailRuw = veld(ruw, "email");
  const email = typeof emailRuw === "string" ? emailRuw.trim().slice(0, STARTERS_GRENS.email) : "";
  const telefoon = schoonTekst(veld(ruw, "telefoon"), STARTERS_GRENS.telefoon).replace(/[^0-9+() -]/g, "").trim();
  const idee = schoonTekst(veld(ruw, "idee"), STARTERS_GRENS.idee);
  const toelichting = schoonTekst(veld(ruw, "toelichting"), STARTERS_GRENS.toelichting);
  const nodigRuw = veld(ruw, "nodig");
  const nodig = STARTERS_SLUGS.filter((s) => Array.isArray(nodigRuw) && nodigRuw.includes(s));
  if (naam.length < 2) return { ok: false, fout: "Vul je naam in.", veld: "naam" };
  if (!EMAIL.test(email)) return { ok: false, fout: "Vul een geldig e-mailadres in.", veld: "email" };
  if (idee.length < 2) return { ok: false, fout: "Vertel in een paar woorden wat je wilt starten.", veld: "idee" };
  if (nodig.length === 0) return { ok: false, fout: "Vink aan wat je nodig hebt.", veld: "nodig" };
  return { ok: true, waarde: { naam, email, ...(telefoon ? { telefoon } : {}), idee, nodig, ...(toelichting ? { toelichting } : {}) } };
}
