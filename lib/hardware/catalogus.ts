// ---------------------------------------------------------------------------
// De apparatuur bij het ZekerFlex horeca-systeem: kassa, printers, keukenscherm, handheld,
// betaalterminal, netwerk en verbruik. De lijst en de inkoopprijzen komen uit een
// marktonderzoek van 10 nov 2026 (webwinkels en leveranciers, per regel met bron). Ze zijn
// INDICATIEF: prijzen van webwinkels wisselen per dag, en niet elke bron zegt of de btw erin
// zit. Wat onbekend is, telt hier als exclusief btw (voorzichtig: hogere inkoop). De
// verkoopprijzen zijn een VOORSTEL (inkoop + marge); de eigenaar stelt de echte prijzen vast in
// Admin → Hardware. Puur bestand (geen prisma, geen kv): ook in de browser bruikbaar en te testen.
// ---------------------------------------------------------------------------

export const PEILDATUM = "2026-11-10";
export const BTW = 1.21;

export type HardwareSoort =
  | "kassa"
  | "klantendisplay"
  | "bonprinter"
  | "keukenprinter"
  | "keukenscherm"
  | "handheld"
  | "betaalterminal"
  | "kassalade"
  | "scanner"
  | "netwerk"
  | "verbruik";

export const SOORT_NAAM: Record<HardwareSoort, string> = {
  kassa: "Kassa",
  klantendisplay: "Klantendisplay",
  bonprinter: "Bonprinter",
  keukenprinter: "Keukenprinter",
  keukenscherm: "Keukenscherm",
  handheld: "Handheld bediening",
  betaalterminal: "Betaalterminal",
  kassalade: "Kassalade",
  scanner: "Scanner",
  netwerk: "Netwerk",
  verbruik: "Verbruik en toebehoren",
};

export interface Bron {
  label: string;
  url: string;
}

/** Eén gevonden prijs. Zegt de bron niets over de btw, dan staat er "onbekend". */
export interface Waarneming {
  cent: number;
  btw: "excl" | "incl" | "onbekend";
  bron: Bron;
}

/** Kan het apparaat het merk ZekerFlex dragen, en hoe? */
export type EigenMerk =
  /** een merkartikel (Epson, Star, Zebra, UniFi, Stripe): alleen een ZekerFlex-sticker en ZekerFlex op het scherm */
  | "sticker"
  /** de fabrikant levert hetzelfde soort apparaat met ons logo op de behuizing, vanaf een minimale afname */
  | "oem";

export interface HardwareItem {
  id: string;
  soort: HardwareSoort;
  naam: string;
  /** het voorbeeldmodel waarop de prijs is gebaseerd */
  model: string;
  wat: string;
  eigenMerk: EigenMerk;
  /** vooral bij OEM: waar een eigen model op lijkt en waar je op moet letten */
  merkNotitie?: string;
  waarnemingen: Waarneming[];
  /** wat je erbij moet weten (btw, uitfasering, afmetingen) */
  let?: string;
}

const B = (label: string, url: string): Bron => ({ label, url });
const w = (cent: number, btw: Waarneming["btw"], bron: Bron): Waarneming => ({ cent, btw, bron });

const PAYNL = B("Pay.nl", "https://shop.pay.nl/en/products/sunmi-d3-pro");
const JARL_D3 = B("Jarltech", "https://jarltech.com/en/sunmi-d3-pro");
const T20 = B("123inkt.nl", "https://www.123inkt.nl/Epson-TM-T20III-011-bonprinter-zwart-C31CH51011-i60995-t752444.html");
const T20_LAN = B("123inkt.be", "https://www.123inkt.be/Epson-TM-T20III-012-ticketprinter-zwart-met-ethernet-C31CH51012-i60996.html");
const M30 = B("123inkt.be", "https://www.123inkt.be/Epson-TM-M30III-151-ticketprinter-wit-met-USB-bluetooth-en-wifi-C31CK50151-i124083.html");
const KDS = B("Bypos", "https://www.bypos.nl/kassa-systemen/sunmi-d2s-kds-android-based-display-bypos-8045");
const V2_RIS = B("Risolutions", "https://risolutions.eu/en/go/product/145648979");
const V2_JARL = B("Jarltech", "https://jarltech.com/en/sunmi-v2-pro");
const STRIPE = B("Stripe (Duitstalige pagina)", "https://stripe.com/id-de/terminal");
const STAR = B("Sysworks", "https://cat.sysworks.nl/star-micronics/kassalades/55555561/cb-2002-lc-fn-cash-drawer-new");
const BYPOS_LADE = B("Bypos", "https://www.bypos.ae/bypos-ec410-royal-rvs-front-elektrisch-bypos-1379");
const ZEBRA = B("123inkt.nl", "https://www.123inkt.nl/Zebra-DS2208-handscanner-DS2208-SR7U2100SGW-i63249-t7020040.html");
const UDR7 = B("Paradigit", "https://www.paradigit.nl/netwerk/ubiquiti");
const U6 = B("vergelijkeven.nl", "https://www.vergelijkeven.nl/product/ubiquiti-unifi-6-professional-u6-pro");
const ROL = B("TakeAware.nl", "https://takeaware.nl/en/products/thermal-cash-register-bpa-free-80x80x12-fsc-mix-75-meters-up");

export const HARDWARE: HardwareItem[] = [
  {
    id: "kassa-156",
    soort: "kassa",
    naam: "Kassa met 15,6 inch touchscreen",
    model: "Sunmi D3 Pro (Android 13, 4 GB / 64 GB)",
    wat: "Het hart van de zaak: hier draait de ZekerFlex-kassa. Wifi en netwerkkabel, USB voor printer en lade.",
    eigenMerk: "oem",
    merkNotitie: "Er zijn fabrikanten die hetzelfde soort Android-kassa met jouw logo leveren (OEM, vaak vanaf 50 tot 100 stuks voor het logo). Sunmi zelf: voorwaarden opvragen bij hun kanaalteam, die vond ik niet openbaar.",
    waarnemingen: [w(49900, "onbekend", JARL_D3), w(47300, "onbekend", JARL_D3), w(42900, "onbekend", PAYNL)],
    let: "Prijzen van twee webwinkels; de een noemt € 499 als adviesprijs. Vraag een zakelijke offerte met staffelkorting.",
  },
  {
    id: "klantendisplay-sunmi",
    soort: "klantendisplay",
    naam: "Klantendisplay",
    model: "Sunmi klantendisplay voor de D3 Pro",
    wat: "Tweede scherm naar de gast: bedrag, fooi vragen en betalen.",
    eigenMerk: "oem",
    waarnemingen: [w(19500, "onbekend", JARL_D3)],
  },
  {
    id: "bonprinter-usb",
    soort: "bonprinter",
    naam: "Bonprinter 80 mm (USB)",
    model: "Epson TM-T20III-011",
    wat: "Bon voor de gast aan de kassa; snel (250 mm/s) en geschikt voor 58 en 80 mm rollen.",
    eigenMerk: "sticker",
    waarnemingen: [w(12107, "excl", T20), w(14650, "incl", T20)],
    let: "De adviesprijs van Epson ligt hoger (€ 197,47 incl. btw); de webwinkel rekent korting.",
  },
  {
    id: "bonprinter-lan",
    soort: "bonprinter",
    naam: "Bonprinter 80 mm (netwerk)",
    model: "Epson TM-T20III-012 (Ethernet)",
    wat: "Dezelfde printer met netwerkaansluiting: handig bij de bar, ver van de kassa.",
    eigenMerk: "sticker",
    waarnemingen: [w(18450, "onbekend", T20_LAN)],
  },
  {
    id: "keukenprinter-wifi",
    soort: "keukenprinter",
    naam: "Keukenprinter (wifi, netwerk en bluetooth)",
    model: "Epson TM-m30III",
    wat: "Bestellingen in de keuken en bij de bar op papier, ook als het scherm uitvalt. Past bij onze bluetooth- en netwerkprint (lib/locatie/printen).",
    eigenMerk: "sticker",
    waarnemingen: [w(25579, "excl", M30), w(30950, "incl", M30)],
  },
  {
    id: "keukenscherm-156",
    soort: "keukenscherm",
    naam: "Keukenscherm 15,6 inch",
    model: "Sunmi D2s KDS (spatwaterdicht, IP55)",
    wat: "Scherm voor keuken of bar waarop de bestellingen binnenkomen met status, zoals het ZekerFlex keukenscherm.",
    eigenMerk: "oem",
    waarnemingen: [w(39500, "excl", KDS), w(47795, "incl", KDS)],
    let: "De leverancier noemt staffelkorting op aanvraag.",
  },
  {
    id: "handheld-v2",
    soort: "handheld",
    naam: "Handheld voor de bediening",
    model: "Sunmi V2 Pro (Android, wifi, 4G, NFC, scanner)",
    wat: "Bestelling opnemen en afrekenen aan tafel.",
    eigenMerk: "oem",
    waarnemingen: [w(29417, "excl", V2_RIS), w(40472, "incl", V2_RIS), w(34820, "onbekend", V2_JARL)],
    let: "Een oplaadstation kost nog € 25,73 (Jarltech).",
  },
  {
    id: "betaalterminal-s700",
    soort: "betaalterminal",
    naam: "Betaalterminal (pin)",
    model: "Stripe Reader S700 (de WisePOS E staat bij Stripe op uitfasering, onbevestigd)",
    wat: "Pinbetalingen via Stripe, zonder apart pinabonnement. De betaling komt in de ZekerFlex-kassa als bon.",
    eigenMerk: "sticker",
    waarnemingen: [w(25900, "excl", STRIPE)],
    let: "Hangt aan het Stripe-account van de klant zelf (zoals nu ook bij afrekenen). De prijs komt van een Duitstalige Stripe-pagina; controleer die voor Nederland.",
  },
  {
    id: "kassalade-410",
    soort: "kassalade",
    naam: "Kassalade 410 mm",
    model: "Star CB-2002 FN (RJ11/RJ12, 24 V)",
    wat: "Gaat open via de bonprinter. Werkt met Epson- en Star-printers.",
    eigenMerk: "sticker",
    waarnemingen: [w(8848, "excl", STAR), w(10706, "incl", STAR), w(4300, "onbekend", BYPOS_LADE)],
    let: "Een goedkopere lade (EQT-410) kost € 43; controleer maat, aansluiting en spanning voor je bestelt.",
  },
  {
    id: "scanner-2d",
    soort: "scanner",
    naam: "Barcodescanner 2D",
    model: "Zebra DS2208 (USB)",
    wat: "Voor de winkelkant (flessen, verkoop aan de balie) en voor het scannen van QR-codes.",
    eigenMerk: "sticker",
    waarnemingen: [w(7727, "excl", ZEBRA), w(9350, "incl", ZEBRA)],
  },
  {
    id: "netwerk-router",
    soort: "netwerk",
    naam: "Router voor het kassanetwerk",
    model: "Ubiquiti UniFi Dream Router 7",
    wat: "Eigen, beveiligd netwerk voor de kassa en printers, los van het gastenwifi. Past bij ZekerFlex Verbinding (wifi, VPN).",
    eigenMerk: "sticker",
    waarnemingen: [w(21736, "excl", UDR7), w(26300, "incl", UDR7)],
    let: "De oudere Dream Router is niet meer te bestellen; dit is de opvolger.",
  },
  {
    id: "netwerk-accesspoint",
    soort: "netwerk",
    naam: "Access point voor extra wifi-dekking",
    model: "Ubiquiti UniFi U6 Pro",
    wat: "Voor grotere zalen of terrassen waar één router niet genoeg dekking geeft.",
    eigenMerk: "sticker",
    waarnemingen: [w(15999, "onbekend", U6)],
  },
  {
    id: "kassarollen-80",
    soort: "verbruik",
    naam: "Kassarollen 80 mm (doos van 50)",
    model: "Thermisch 80 × 80 × 12 mm, 75 meter",
    wat: "Verbruik voor de bonprinters. Bedrukt met ZekerFlex en de naam van de zaak kan, prijs op aanvraag.",
    eigenMerk: "oem",
    merkNotitie: "Bedrukte rollen met een eigen ontwerp zijn bij drukkerijen te bestellen; vraag een offerte voor de afname per jaar.",
    waarnemingen: [w(5395, "excl", ROL), w(6528, "incl", ROL)],
  },
  {
    id: "qr-tafelstandaard",
    soort: "verbruik",
    naam: "QR-tafelstandaard met ZekerFlex-logo",
    model: "Acryl of karton, per tafel",
    wat: "Voor bestellen en afrekenen aan tafel. De QR-codes maakt ZekerFlex al zelf per tafel (module Bestellen aan tafel).",
    eigenMerk: "oem",
    merkNotitie: "Eigen ontwerp laten drukken of lasersnijden; prijs hangt af van aantal en materiaal.",
    waarnemingen: [],
    let: "Nog geen prijs: eerst een offerte bij een drukker of lasersnijder.",
  },
];

// ── Rekenen met de prijzen ───────────────────────────────────────────────────

/** Een waarneming exclusief btw: "onbekend" telt als exclusief (voorzichtig). */
export function exclCent(x: Waarneming): number {
  return x.btw === "incl" ? Math.round(x.cent / BTW) : x.cent;
}

export interface Inkoopbereik {
  vanCent: number;
  totCent: number;
}

/** Laagste en hoogste inkoop exclusief btw, of null als er nog geen prijs bekend is. */
export function inkoopBereik(item: Pick<HardwareItem, "waarnemingen">): Inkoopbereik | null {
  const lijst = item.waarnemingen.map(exclCent);
  if (lijst.length === 0) return null;
  return { vanCent: Math.min(...lijst), totCent: Math.max(...lijst) };
}

/** De inkoop waarmee we rekenen: de hoogste (voorzichtig), zodat de marge nooit te rooskleurig is. */
export function inkoopVoorRekenen(item: Pick<HardwareItem, "waarnemingen">): number | null {
  return inkoopBereik(item)?.totCent ?? null;
}

export const STANDAARD_MARGE_PCT = 30;

/** Inkoop plus marge, naar boven afgerond op € 5, exclusief btw. */
export function voorstelCent(inkoopCent: number, margePct: number): number {
  const kaal = inkoopCent * (1 + Math.max(0, margePct) / 100);
  return Math.ceil(kaal / 500) * 500;
}

/** De marge die overblijft bij een gekozen verkoopprijs, in procenten van de verkoopprijs. */
export function margeVanVerkoop(verkoopCent: number, inkoopCent: number): number | null {
  return verkoopCent > 0 ? Math.round(((verkoopCent - inkoopCent) / verkoopCent) * 1000) / 10 : null;
}

// ── Pakketten bij afname van het ZekerFlex horeca-systeem ────────────────────

export interface PakketRegel {
  item: string;
  aantal: number;
}

export interface Pakket {
  id: string;
  naam: string;
  voorWie: string;
  regels: PakketRegel[];
  /** wat erbij zit, zonder dat het hardware is */
  erbij: string[];
}

/** Alles wat bij elk pakket hoort: de installatie en de instructie, met het volgsysteem voor de monteur. */
export const STANDAARD_ERBIJ = [
  "Installatie en aansluiten door een ZekerFlex-monteur, met een tijdvak vooraf",
  "Je volgt de monteur live op de kaart: wanneer hij vertrekt, hoe laat hij er is en wanneer hij klaar is",
  "Menukaart en tafels klaargezet voordat de monteur komt",
  "Uitleg aan het personeel op locatie (ongeveer een uur)",
  "Eén contactpunt voor storingen",
];

export const PAKKETTEN: Pakket[] = [
  {
    id: "start",
    naam: "Horeca Start",
    voorWie: "Een kleine zaak met één kassa: café, lunchroom, snackbar.",
    regels: [
      { item: "kassa-156", aantal: 1 },
      { item: "bonprinter-usb", aantal: 1 },
      { item: "kassalade-410", aantal: 1 },
      { item: "betaalterminal-s700", aantal: 1 },
      { item: "kassarollen-80", aantal: 1 },
    ],
    erbij: STANDAARD_ERBIJ,
  },
  {
    id: "compleet",
    naam: "Horeca Compleet",
    voorWie: "Restaurant met keuken, bediening aan tafel en gasten die zelf bestellen via QR.",
    regels: [
      { item: "kassa-156", aantal: 1 },
      { item: "klantendisplay-sunmi", aantal: 1 },
      { item: "bonprinter-usb", aantal: 1 },
      { item: "kassalade-410", aantal: 1 },
      { item: "keukenprinter-wifi", aantal: 1 },
      { item: "keukenscherm-156", aantal: 1 },
      { item: "handheld-v2", aantal: 2 },
      { item: "betaalterminal-s700", aantal: 2 },
      { item: "netwerk-router", aantal: 1 },
      { item: "kassarollen-80", aantal: 2 },
      { item: "qr-tafelstandaard", aantal: 10 },
    ],
    erbij: STANDAARD_ERBIJ,
  },
  {
    id: "groot",
    naam: "Horeca Groot",
    voorWie: "Grote zaak of terras: meerdere werkplekken, bar én keuken, extra wifi-dekking.",
    regels: [
      { item: "kassa-156", aantal: 2 },
      { item: "klantendisplay-sunmi", aantal: 2 },
      { item: "bonprinter-usb", aantal: 1 },
      { item: "bonprinter-lan", aantal: 1 },
      { item: "kassalade-410", aantal: 2 },
      { item: "keukenprinter-wifi", aantal: 2 },
      { item: "keukenscherm-156", aantal: 2 },
      { item: "handheld-v2", aantal: 4 },
      { item: "betaalterminal-s700", aantal: 3 },
      { item: "netwerk-router", aantal: 1 },
      { item: "netwerk-accesspoint", aantal: 2 },
      { item: "scanner-2d", aantal: 1 },
      { item: "kassarollen-80", aantal: 4 },
      { item: "qr-tafelstandaard", aantal: 20 },
    ],
    erbij: STANDAARD_ERBIJ,
  },
];

export interface Instellingen {
  /** marge in procenten op de inkoop */
  margePct: number;
  /** eigen verkoopprijs per apparaat (excl. btw, in centen), die het voorstel vervangt */
  verkoopCent: Record<string, number>;
  /** apparaten die niet in de verkoop zijn */
  uit: string[];
  /** de prijs van de installatie bij een pakket (excl. btw), in centen; leeg = nog niet vastgesteld */
  installatieCent: number | null;
}

export const STANDAARD_INSTELLINGEN: Instellingen = { margePct: STANDAARD_MARGE_PCT, verkoopCent: {}, uit: [], installatieCent: null };

const MAX_CENT = 10_000_000;
const geheel = (v: unknown, max = MAX_CENT): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);

/** Maakt van wat uit de opslag of een formulier komt een nette keuze: onbekende apparaten en rare getallen vallen weg. */
export function maakInstellingen(raw: unknown, items: readonly { id: string }[] = HARDWARE): Instellingen {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bekend = new Set(items.map((i) => i.id));
  const marge = typeof r.margePct === "number" && Number.isFinite(r.margePct) ? Math.min(300, Math.max(0, Math.round(r.margePct * 10) / 10)) : STANDAARD_MARGE_PCT;
  const verkoop: Record<string, number> = {};
  if (r.verkoopCent && typeof r.verkoopCent === "object") {
    for (const [id, v] of Object.entries(r.verkoopCent as Record<string, unknown>)) {
      const c = geheel(v);
      if (bekend.has(id) && c !== null) verkoop[id] = c;
    }
  }
  const uit = Array.isArray(r.uit) ? [...new Set((r.uit as unknown[]).filter((x): x is string => typeof x === "string" && bekend.has(x)))] : [];
  return { margePct: marge, verkoopCent: verkoop, uit, installatieCent: geheel(r.installatieCent) };
}

/** De verkoopprijs excl. btw van één apparaat: eigen prijs, anders het voorstel, anders null (nog geen inkoop bekend). */
export function verkoopCentVan(item: HardwareItem, inst: Instellingen): number | null {
  const eigen = inst.verkoopCent[item.id];
  if (typeof eigen === "number" && eigen >= 0) return eigen;
  const inkoop = inkoopVoorRekenen(item);
  return inkoop === null ? null : voorstelCent(inkoop, inst.margePct);
}

export interface PakketTotaal {
  /** totaal verkoop excl. btw van de regels waarvan de prijs bekend is */
  verkoopCent: number;
  inkoopCent: number;
  /** apparaten zonder bekende prijs: het totaal is dan nog niet compleet */
  zonderPrijs: string[];
}

export function pakketTotaal(p: Pakket, inst: Instellingen, items: HardwareItem[] = HARDWARE): PakketTotaal {
  let verkoopCent = 0;
  let inkoopCent = 0;
  const zonderPrijs: string[] = [];
  for (const r of p.regels) {
    const item = items.find((i) => i.id === r.item);
    if (!item) continue;
    const v = verkoopCentVan(item, inst);
    const k = inkoopVoorRekenen(item);
    if (v === null || k === null) {
      zonderPrijs.push(item.naam);
      continue;
    }
    verkoopCent += v * r.aantal;
    inkoopCent += k * r.aantal;
  }
  return { verkoopCent, inkoopCent, zonderPrijs };
}

export const OEM_FEITEN = {
  tekst:
    "Een eigen merk op de apparatuur kan op drie manieren. Beginnen kan met niets: ZekerFlex-stickers en het ZekerFlex-logo op het scherm (software). Een logo op de behuizing (OEM) levert een fabrikant vaak vanaf 50 tot 100 stuks per model; een eigen ontwerp (ODM) meestal vanaf 100 tot 500. Dat kost doorlooptijd.",
  bronnen: [
    B("Fabrikant: OEM en ODM voor Android-kassa's (MOQ 100 tot 500)", "https://www.szzcs.com/blog/how-oemodm-android-pos-manufacturers-can-help-startups-small-chains-launch-payment-infrastructure-fast.html"),
    B("Voorbeeld OEM-kassa: logo vanaf 100 stuks", "https://www.alibaba.com/product-introduction/Premium-17-Inch-POS-Terminal-OEM_1601254527865.html"),
    B("Voorbeeld OEM-kassa met printer, MOQ 1", "https://www.globalsources.com/POS-system/pos-system-1235446540p.htm"),
  ] as Bron[],
  niveaus: [
    { naam: "Niveau 1: ZekerFlex-label", wat: "Stickers, het ZekerFlex-opstartscherm en bedrukte kassarollen en QR-standaards. Kan direct en zonder minimum." },
    { naam: "Niveau 2: logo op de behuizing (OEM)", wat: "Een fabrikant levert een gelijkwaardig apparaat met ons logo. Vanaf ongeveer 50 tot 100 stuks per model, 6 tot 10 weken inclusief keuringen." },
    { naam: "Niveau 3: eigen ontwerp (ODM)", wat: "Eigen behuizing en eigen opstartsoftware. Vanaf ongeveer 100 tot 500 stuks per model, 3 tot 4 weken productie na de goedkeuring van het ontwerp." },
  ],
  advies:
    "Merkartikelen waar betaling en netwerk aan hangen (Stripe-terminal, UniFi, Epson, Star, Zebra) blijven van het merk zelf: daar gaat alleen een sticker op. Eigen merk loont bij kassa, klantendisplay, handheld, keukenscherm en rollen, zodra je per model ruim boven de minimale afname uitkomt.",
};
