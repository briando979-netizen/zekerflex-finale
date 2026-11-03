// ---------------------------------------------------------------------------
// De Android-app van een rijschool, puur (zonder database of netwerk): de
// pakketnaam, wat de Android-bouwer nodig heeft, de iconen (als SVG, alleen
// vormen: de server heeft geen lettertypes) en de standaardteksten voor de
// winkelpagina. De app is een Trusted Web Activity: hij opent de leerling- en
// instructeur-app van /rijschool/<slug> schermvullend, zonder adresbalk.
// ---------------------------------------------------------------------------

const JAVA_WOORDEN = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield".split(" "),
);

const GRATIS_MAIL = new Set(["gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl", "live.nl", "live.com", "icloud.com", "me.com", "yahoo.com", "ziggo.nl", "kpnmail.nl", "planet.nl", "home.nl", "xs4all.nl", "zekerflex.com", "example.com"]);

const PAKKET = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isPakketnaam(s: string): boolean {
  if (s.length > 150 || !PAKKET.test(s)) return false;
  const delen = s.split(".");
  if (delen.length > 8) return false;
  if (delen.some((d) => JAVA_WOORDEN.has(d))) return false;
  return !/^(android|com\.android|com\.google|com\.example)\./.test(s);
}

/** Eén deel van een pakketnaam: kleine letters, cijfers en _, begint met een letter. */
function deel(s: string): string {
  let d = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!d) d = "app";
  if (!/^[a-z]/.test(d)) d = `r${d}`;
  if (JAVA_WOORDEN.has(d)) d = `${d}_app`;
  return d.slice(0, 40);
}

/** Voorstel: het eigen domein van de rijschool (uit haar e-mailadres), anders onder zekerflex. */
export function voorgesteldePakketnaam(r: { slug: string; email: string }): string {
  const domein = r.email.split("@")[1]?.toLowerCase().trim() ?? "";
  if (domein && !GRATIS_MAIL.has(domein) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domein)) {
    const p = [...domein.split(".").reverse().map(deel), "app"].join(".");
    if (isPakketnaam(p)) return p;
  }
  return `nl.zekerflex.rijschool.${deel(r.slug)}`;
}

export const versieNaam = (versie: number) => `1.0.${versie}`;

export const appStartPad = (slug: string) => `/rijschool/${slug}/app`;

const KLEUR = /^#[0-9a-fA-F]{6}$/;
const kleurOf = (k: string, standaard: string) => (KLEUR.test(k) ? k : standaard);

export interface BouwManifest {
  pakketnaam: string;
  host: string;
  naam: string;
  korteNaam: string;
  kleur: string;
  achtergrond: string;
  startUrl: string;
  scope: string;
  versie: number;
  versieNaam: string;
}

export function bouwManifest(r: { slug: string; kleur: string }, app: { pakketnaam: string; appNaam: string }, host: string, versie: number): BouwManifest {
  return {
    pakketnaam: app.pakketnaam,
    host,
    naam: app.appNaam.slice(0, 50),
    korteNaam: app.appNaam.slice(0, 30),
    kleur: kleurOf(r.kleur, "#1D4E89"),
    achtergrond: "#FFFFFF",
    startUrl: `${appStartPad(r.slug)}?bron=android`,
    scope: `/rijschool/${r.slug}/`,
    versie,
    versieNaam: versieNaam(versie),
  };
}

// ---- iconen (SVG, alleen vormen) -----------------------------------------------------

/** Een stuur op de kleur van de rijschool. Past binnen de veilige zone, dus ook als maskeerbaar icoon. */
export function icoonSvg(kleur: string, accent: string, grootte = 512): string {
  const k = kleurOf(kleur, "#1D4E89");
  const a = kleurOf(accent, "#F2B544");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${grootte}" height="${grootte}" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${k}"/>
<circle cx="256" cy="256" r="138" fill="none" stroke="#FFFFFF" stroke-width="34"/>
<rect x="124" y="236" width="264" height="40" rx="20" fill="#FFFFFF"/>
<rect x="236" y="256" width="40" height="128" rx="20" fill="#FFFFFF"/>
<circle cx="256" cy="256" r="46" fill="#FFFFFF"/>
<circle cx="256" cy="256" r="26" fill="${a}"/>
</svg>`;
}

/** De functieafbeelding van de winkelpagina (1024×500): een weg en een stuur, zonder tekst. */
export function functieafbeeldingSvg(kleur: string, accent: string): string {
  const k = kleurOf(kleur, "#1D4E89");
  const a = kleurOf(accent, "#F2B544");
  const strepen = Array.from({ length: 9 }, (_, i) => `<rect x="${-40 + i * 120}" y="372" width="64" height="12" rx="6" fill="${a}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
<rect width="1024" height="500" fill="${k}"/>
<circle cx="140" cy="90" r="170" fill="#FFFFFF" fill-opacity="0.06"/>
<circle cx="980" cy="40" r="120" fill="#FFFFFF" fill-opacity="0.05"/>
<rect x="0" y="318" width="1024" height="120" fill="#1F2523"/>
<rect x="0" y="318" width="1024" height="8" fill="#FFFFFF" fill-opacity="0.85"/>
<rect x="0" y="430" width="1024" height="8" fill="#FFFFFF" fill-opacity="0.85"/>
${strepen}
<g transform="translate(700 210)">
<circle r="150" fill="${k}"/>
<circle r="122" fill="none" stroke="#FFFFFF" stroke-width="30"/>
<rect x="-117" y="-18" width="234" height="36" rx="18" fill="#FFFFFF"/>
<rect x="-18" y="0" width="36" height="114" rx="18" fill="#FFFFFF"/>
<circle r="41" fill="#FFFFFF"/>
<circle r="23" fill="${a}"/>
</g>
</svg>`;
}

// ---- teksten voor de winkelpagina ---------------------------------------------------

export function standaardKorteTekst(naam: string): string {
  return `Je rijlessen, voortgang en theorie oefenen bij ${naam}.`.slice(0, 80);
}

export function standaardLangeTekst(naam: string, plaats: string): string {
  const waar = plaats ? ` in ${plaats}` : "";
  return [
    `De app van ${naam}${waar}. Hiermee heb je je rijopleiding altijd bij de hand.`,
    "",
    "Voor leerlingen:",
    "• Je geplande lessen, met tijd, auto en ophaaladres",
    "• Je voortgang per onderdeel, zoals je instructeur die na elke les bijhoudt",
    "• Huiswerk en tips voor de volgende les",
    "• Je tegoed: hoeveel lesminuten je nog hebt",
    "• Theorie oefenen met vragen over voorrang, snelheid, regels en veilig rijden",
    "• Zelf lessen plannen of verzetten, als je rijschool dat aanzet",
    "",
    "Voor instructeurs:",
    "• Je lesdag in één overzicht",
    "• De leskaart invullen tijdens of na de les",
    "• De volgende les meteen inplannen",
    "• Een betaling vastleggen in de auto",
    "",
    `Je account krijg je van ${naam}: je ontvangt een mail waarmee je zelf je wachtwoord kiest.`,
  ].join("\n");
}

// ---- Digital Asset Links ------------------------------------------------------------

export interface AssetLink {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

export function assetLink(pakket: string, vingerafdrukken: (string | null | undefined)[]): AssetLink | null {
  const v = [...new Set(vingerafdrukken.filter((x): x is string => !!x && /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x)))];
  if (!isPakketnaam(pakket) || v.length === 0) return null;
  return { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pakket, sha256_cert_fingerprints: v } };
}
