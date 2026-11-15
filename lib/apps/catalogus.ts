import { WERKRUIMTE_INFO } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// De apps van ZekerFlex per doelgroep (15 nov 2026, eigenaar: "laten we alle soorten apps lanceren: een voor
// opdrachtgevers voor klussen, een voor webshop, een voor rijschool, een voor horeca, een voor personeel van de horeca").
// Elke app is een eigen installeerbare web-app (eigen naam, kleur, icoon en beginscherm) op dezelfde site: een manifest
// per app (/apps/<id>/manifest.webmanifest) met een eigen `id`, zodat een telefoon of computer ze als losse apps naast
// elkaar zet. De uitleg van de werkruimtes komt uit één bron (WERKRUIMTE_INFO), zodat een app nooit meer belooft dan het
// dashboard doet. Store-apps (Play, App Store) per doelgroep vragen accounts en sleutels van de eigenaar.
// Puur: geen prisma of kv.
// ---------------------------------------------------------------------------

/** Het symbool op het icoon (alleen vormen: sharp heeft in de container geen lettertypes). */
export type Symbool = "vink" | "koffer" | "bord" | "stuur" | "tas" | "venster" | "persoon";

export interface ZfApp {
  /** in het adres: /apps/<id> */
  id: string;
  naam: string;
  /** onder het icoon op het beginscherm: hooguit 12 tekens */
  kort: string;
  voorWie: string;
  uitleg: string;
  /** het beginscherm van de app (moet een bestaande pagina zijn) */
  start: string;
  kleur: string;
  symbool: Symbool;
  /** zichtbaar en installeerbaar; false = de omgeving bestaat nog niet */
  beschikbaar: boolean;
}

const bron = (id: string) => `utm_source=pwa-${id}`;

export const ZF_APPS: ZfApp[] = [
  {
    id: "werk",
    naam: "ZekerFlex Werk",
    kort: "ZF Werk",
    voorWie: "Voor flexwerkers, zzp'ers en uitzendkrachten",
    uitleg: "Klussen in de buurt vinden en erop reageren, inchecken, je uren en je uitbetalingen, en chatten met je opdrachtgever.",
    start: `/dashboard?${bron("werk")}`,
    kleur: "#0E7A5F",
    symbool: "vink",
    beschikbaar: true,
  },
  {
    id: "zakelijk",
    naam: "ZekerFlex Zakelijk",
    kort: "Zakelijk",
    voorWie: "Voor bedrijven die personeel inhuren",
    uitleg: WERKRUIMTE_INFO.personeel.uitleg,
    start: `/werkgever?${bron("zakelijk")}`,
    kleur: "#1E3A8A",
    symbool: "koffer",
    beschikbaar: true,
  },
  {
    id: "horeca",
    naam: "ZekerFlex Horeca",
    kort: "Horeca",
    voorWie: "Voor restaurants, cafés en hotels",
    uitleg: WERKRUIMTE_INFO.horeca.uitleg,
    start: `/werkgever/horeca?${bron("horeca")}`,
    kleur: "#B45309",
    symbool: "bord",
    beschikbaar: true,
  },
  {
    id: "personeel",
    naam: "ZekerFlex Personeel",
    kort: "Personeel",
    voorWie: "Voor de medewerkers van een horecazaak",
    // alleen wat /personeel echt heeft (15 nov: rooster, verlof, uren, taken, mededelingen, loonstroken en de teamchat)
    uitleg: "Je rooster, verlof en gewerkte uren, je taken en loonstroken, de mededelingen van je zaak en de chat met je team, op je eigen telefoon.",
    start: `/personeel?${bron("personeel")}`,
    kleur: "#9A3412",
    symbool: "persoon",
    beschikbaar: true,
  },
  {
    id: "rijschool",
    naam: "ZekerFlex Rijschool",
    kort: "Rijschool",
    voorWie: "Voor rijschoolhouders en instructeurs",
    uitleg: WERKRUIMTE_INFO.rijschool.uitleg,
    start: `/werkgever/rijschool?${bron("rijschool")}`,
    kleur: "#6D28D9",
    symbool: "stuur",
    beschikbaar: true,
  },
  {
    id: "webshop",
    naam: "ZekerFlex Webshop",
    kort: "Webshop",
    voorWie: "Voor wie online verkoopt",
    uitleg: WERKRUIMTE_INFO.webshop.uitleg,
    start: `/studio/webshop?${bron("webshop")}`,
    kleur: "#BE185D",
    symbool: "tas",
    beschikbaar: true,
  },
  {
    id: "website",
    naam: "ZekerFlex Website",
    kort: "Website",
    voorWie: "Voor bedrijven met een eigen website",
    uitleg: WERKRUIMTE_INFO.website.uitleg,
    start: `/studio/website?${bron("website")}`,
    kleur: "#0F766E",
    symbool: "venster",
    beschikbaar: true,
  },
];

export const appVan = (id: string): ZfApp | undefined => ZF_APPS.find((a) => a.id === id && a.beschikbaar);

/** Het manifest van één app: een eigen `id`, zodat hij als losse app naast de andere staat. */
export function manifestVan(a: ZfApp) {
  return {
    name: a.naam,
    short_name: a.kort,
    description: `${a.voorWie}. ${a.uitleg}`,
    id: `/apps/${a.id}`,
    start_url: a.start,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FCFCFA",
    theme_color: a.kleur,
    lang: "nl-NL",
    icons: [
      { src: `/apps/${a.id}/icoon.png?maat=192`, sizes: "192x192", type: "image/png" },
      { src: `/apps/${a.id}/icoon.png`, sizes: "512x512", type: "image/png" },
      { src: `/apps/${a.id}/icoon.png?maskeerbaar=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

const SYMBOOL: Record<Symbool, string> = {
  vink: '<circle cx="256" cy="256" r="128" fill="none" stroke="#fff" stroke-width="28"/><path d="M194 262 l44 44 l86 -98" fill="none" stroke="#fff" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>',
  koffer: '<rect x="206" y="146" width="100" height="70" rx="20" fill="none" stroke="#fff" stroke-width="24"/><rect x="128" y="196" width="256" height="180" rx="30" fill="#fff"/><rect x="128" y="262" width="256" height="18" fill="currentColor"/>',
  bord: '<circle cx="256" cy="256" r="104" fill="none" stroke="#fff" stroke-width="26"/><circle cx="256" cy="256" r="52" fill="#fff"/><path d="M116 150 V362 M396 150 V362" stroke="#fff" stroke-width="22" stroke-linecap="round"/>',
  stuur: '<circle cx="256" cy="256" r="124" fill="none" stroke="#fff" stroke-width="30"/><path d="M136 256 H376 M256 256 V380" stroke="#fff" stroke-width="28" stroke-linecap="round"/><circle cx="256" cy="256" r="38" fill="#fff"/>',
  tas: '<path d="M202 214 V178 a54 54 0 0 1 108 0 V214" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round"/><rect x="146" y="206" width="220" height="182" rx="26" fill="#fff"/>',
  venster: '<rect x="118" y="146" width="276" height="220" rx="28" fill="none" stroke="#fff" stroke-width="24"/><path d="M118 210 H394" stroke="#fff" stroke-width="20"/><circle cx="158" cy="178" r="10" fill="#fff"/><circle cx="190" cy="178" r="10" fill="#fff"/><circle cx="222" cy="178" r="10" fill="#fff"/>',
  persoon: '<circle cx="256" cy="196" r="64" fill="#fff"/><path d="M142 380 a114 100 0 0 1 228 0 Z" fill="#fff"/>',
};

/**
 * Het icoon als SVG (512x512): de kleur van de app met het symbool in wit. `maskeerbaar` vult het hele vlak (de telefoon
 * snijdt zelf de vorm uit) en houdt het symbool binnen de veilige zone. Alleen vormen, geen tekst.
 */
export function icoonSvg(a: Pick<ZfApp, "kleur" | "symbool">, maskeerbaar = false): string {
  const achtergrond = maskeerbaar ? `<rect width="512" height="512" fill="${a.kleur}"/>` : `<rect width="512" height="512" rx="112" fill="${a.kleur}"/>`;
  const schaal = maskeerbaar ? 0.78 : 1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" color="${a.kleur}">` +
    achtergrond +
    // currentColor zelf invullen: dan hoeft de omzetter naar PNG het niet te kennen
    `<g transform="translate(256 256) scale(${schaal}) translate(-256 -256)">${SYMBOOL[a.symbool].replaceAll("currentColor", a.kleur)}</g>` +
    "</svg>"
  );
}
