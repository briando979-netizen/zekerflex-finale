// ---------------------------------------------------------------------------
// ZekerFlex Op locatie: vier modules voor de werkvloer, bovenop de eigen
// ZekerFlex-omgeving van een bedrijf. Alles draait op de eigen server met
// vrije software, dus zonder licentiekosten bij een ander:
//   portofoon  spraak via de app (WebRTC over onze eigen TURN-server)
//   toegang    kentekenherkenning bij slagboom of hek, besluit op het rooster
//   kluis      sleutels, codes en inloggegevens, zichtbaar zolang de dienst duurt
//   printen    badges, naamstickers en labels, direct bij het inchecken
// Puur bestand (geen prisma, kv of env): ook de schermen in de browser lezen
// hieruit. Er zijn nog geen prijzen van de eigenaar, dus "op aanvraag"
// (zie lib/marketing/aanbod.ts: geen verzonnen prijzen).
// ---------------------------------------------------------------------------

export const MODULES = ["portofoon", "toegang", "kluis", "printen"] as const;
export type ModuleSleutel = (typeof MODULES)[number];
export const isModule = (s: unknown): s is ModuleSleutel => typeof s === "string" && (MODULES as readonly string[]).includes(s);

export interface ModuleDef {
  sleutel: ModuleSleutel;
  naam: string;
  /** de naam uit het voorstel, voor wie die kent */
  ookBekendAls: string;
  /** één regel voor kaarten en het menu */
  kort: string;
  /** een paar zinnen op de eigen kaart */
  uitleg: string;
  punten: string[];
  voorWie: string;
  /** wat de klant zelf nodig heeft */
  nodig: string;
  /** waar het op draait (vrije software, eigen server) */
  techniek: string;
  prijsTekst: string;
}

export const MODULE_DEFS: Record<ModuleSleutel, ModuleDef> = {
  portofoon: {
    sleutel: "portofoon",
    naam: "Portofoon in de app",
    ookBekendAls: "Push-to-Talk",
    kort: "Druk, praat, los: je team op locatie hoort je direct, zonder losse portofoons.",
    uitleg:
      "Een flexwerker op een evenement, bouwplaats of in een distributiecentrum houdt de knop ingedrukt en praat; iedereen in hetzelfde kanaal hoort het meteen. Elke klus en elke vestiging heeft een eigen kanaal, en wie ingepland staat zit er vanzelf in. Is iemand even niet verbonden, dan laat je een spraakbericht achter dat vanzelf afspeelt.",
    punten: [
      "Een kanaal per klus en per vestiging; wie ingepland staat, zit er vanzelf in",
      "Houd de knop ingedrukt en praat; je ziet wie er luistert en wie er praat",
      "Versleuteld, rechtstreeks tussen de telefoons, via onze eigen servers",
      "Geen bereik? Spreek een bericht in; het speelt bij de ander vanzelf af",
      "Werkt op elke telefoon in de browser of de ZekerFlex-app, geen portofoons huren",
    ],
    voorWie: "Evenementen, beveiliging, bouw, logistiek en magazijnen met teams die elkaar snel moeten bereiken.",
    nodig: "Een telefoon met internet (wifi of mobiel) en toestemming voor de microfoon. Oordopjes met knop zijn handig, niet verplicht.",
    techniek: "WebRTC-spraak rechtstreeks tussen telefoons, met onze eigen TURN-server (coturn) als tussenstation. Geen Zello, geen portofoon-abonnement.",
    prijsTekst: "Op aanvraag",
  },
  toegang: {
    sleutel: "toegang",
    naam: "Toegang op kenteken",
    ookBekendAls: "Kentekenherkenning (ALPR)",
    kort: "Een camera leest het kenteken; staat de bestuurder vandaag ingepland, dan gaat de slagboom open.",
    uitleg:
      "Bij de ingang van het terrein leest een gewone IP-camera het kenteken. ZekerFlex kijkt in het rooster: staat deze flexwerker, medewerker of leverancier nu bij jullie ingepland, dan geeft de slagboom of het hek vrij. Elke aankomst staat in het logboek, de planner krijgt een melding en de flexwerker is welkom zonder te bellen of aan te melden bij de portier.",
    punten: [
      "Flexwerkers vullen hun kenteken één keer in; jij hoeft niets over te typen",
      "Open alleen voor wie nu ingepland staat, of voor een bezoeker met een tijdvenster",
      "Logboek van elke aankomst met tijd, kenteken en naam; de planner krijgt een melding",
      "Handmatig openen vanuit je ZekerFlex-beheer, met één druk op de knop",
      "Werkt met een gewone IP-camera (RTSP) en een klein kastje bij de slagboom",
    ],
    voorWie: "Bouwplaatsen, distributiecentra, evenemententerreinen en bedrijfsterreinen met een slagboom of hek.",
    nodig: "Een IP-camera (RTSP) gericht op de ingang, een klein kastje (mini-pc of Raspberry Pi) dat de camera uitleest en de slagboom aanstuurt, en internet op het terrein.",
    techniek: "Vrije kentekenherkenning (fast-alpr) op het kastje bij de ingang; het besluit komt van ZekerFlex (rooster). Geen abonnement op een toegangsdienst.",
    prijsTekst: "Op aanvraag",
  },
  kluis: {
    sleutel: "kluis",
    naam: "Sleutelkluis",
    ookBekendAls: "Secret Vault",
    kort: "Wifi-codes, alarmcodes en inloggegevens die een flexwerker alleen ziet zolang de dienst duurt.",
    uitleg:
      "Je legt per vestiging vast wat een flexwerker op de werkvloer nodig heeft: het wifi-wachtwoord, de alarmcode, de code van het sleutelkastje of de inlog van de kassa. Wie ingepland staat, ziet dat vanaf twee uur voor de dienst tot het einde ervan; daarna is het weg. Je ziet wie wat bekeken heeft, en krijgt een seintje als een code na een dienst beter vervangen kan worden.",
    punten: [
      "Versleuteld opgeslagen op onze eigen server; nooit via chat, papier of een groepsapp",
      "Zichtbaar van twee uur vóór de dienst tot het einde; daarna automatisch ingetrokken",
      "Per vestiging of voor het hele bedrijf; je eigen team ziet alles, een flexwerker alleen zijn dienst",
      "Logboek: wie bekeek welke code wanneer",
      "Een seintje als een code na een dienst beter vervangen kan worden",
    ],
    voorWie: "Horeca, retail, schoonmaak, beveiliging en kantoren die flexwerkers toegang geven tot panden, kassa's en systemen.",
    nodig: "Niets extra's: je vult de codes in via je ZekerFlex-beheer. De flexwerker ziet ze in de app bij zijn klus.",
    techniek: "Versleuteling (AES-256-GCM) op de eigen ZekerFlex-server, met toegang die het rooster volgt. Geen 1Password of Bitwarden-abonnement nodig.",
    prijsTekst: "Op aanvraag",
  },
  printen: {
    sleutel: "printen",
    naam: "Badges en labels printen",
    ookBekendAls: "Thermal Label Printing",
    kort: "Checkt een flexwerker in, dan rolt zijn bezoekersbadge of naamsticker direct uit de printer.",
    uitleg:
      "Zodra iemand incheckt op locatie maakt ZekerFlex een badge: naam, bedrijf, klus en een controlecode. Die gaat naar een goedkope thermische labelprinter op de werkvloer, via de computer of rechtstreeks via Bluetooth vanaf een telefoon. Ook naamstickers, verzendlabels en incheckbonnen print je zo, zonder printsoftware van een ander.",
    punten: [
      "Badge of naamsticker direct bij het inchecken, zonder dat iemand iets hoeft te doen",
      "Print vanaf elke computer (ook Linux of Mac) of via Bluetooth vanaf een telefoon",
      "Sjablonen voor bezoekersbadge, naamsticker, verzendlabel en incheckbon",
      "Werkt met de meeste thermische labelprinters (Brother QL, Dymo, Zebra, goedkope Bluetooth-bonprinters)",
      "Een printwachtrij per vestiging, met een logboek van wat geprint is",
    ],
    voorWie: "Evenementen, magazijnen, bouwplaatsen en kantoren waar bezoekers en flexwerkers herkenbaar moeten zijn.",
    nodig: "Een thermische labelprinter, aangesloten op een computer op locatie of met Bluetooth; voor labels een rol van 62 of 100 mm.",
    techniek: "Open printsysteem (CUPS) op de computer, of Web Bluetooth rechtstreeks naar de printer (ESC/POS). Geen printbeheersoftware van een ander.",
    prijsTekst: "Op aanvraag",
  },
};

export const MODULE_LIJST: ModuleDef[] = MODULES.map((s) => MODULE_DEFS[s]);

/** De stand van één module bij een bedrijf. */
export interface ModuleStand {
  aan: boolean;
  sinds: string;
  door: string;
  doorNaam: string;
}

export interface LocatieStand {
  tenantId: string;
  modules: Partial<Record<ModuleSleutel, ModuleStand>>;
  bijgewerkt: string;
}

export const legeStand = (tenantId: string): LocatieStand => ({ tenantId, modules: {}, bijgewerkt: "" });

export const moduleAan = (stand: LocatieStand | null | undefined, sleutel: ModuleSleutel): boolean => Boolean(stand?.modules[sleutel]?.aan);

export const aantalAan = (stand: LocatieStand | null | undefined): number => MODULES.filter((s) => moduleAan(stand, s)).length;

/* ─────────────── kentekens (toegang) ─────────────── */

/** "ab-123-cd" → "AB123CD": alleen letters en cijfers, hoofdletters; "" als het niets is. */
export function normaliseerKenteken(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

/** Een Nederlands kenteken heeft 6 tekens (2 of 3 groepen); buitenlandse mogen 4 tot 10 zijn. */
export function geldigKenteken(s: string): boolean {
  const k = normaliseerKenteken(s);
  return k.length >= 4 && k.length <= 10 && /[A-Z]/.test(k) && /[0-9]/.test(k);
}

/** Streepjes op de Nederlandse manier terug voor op het scherm: AB123CD → AB-123-CD. Anders zoals het is. */
export function toonKenteken(s: string): string {
  const k = normaliseerKenteken(s);
  if (k.length !== 6) return k;
  // de drie groepen volgen de wisselingen letter/cijfer (sidecodes 1–14)
  const groepen: string[] = [];
  let huidig = k[0] ?? "";
  for (let i = 1; i < k.length; i++) {
    const c = k[i] ?? "";
    const zelfde = /[0-9]/.test(c) === /[0-9]/.test(huidig[huidig.length - 1] ?? "");
    if (zelfde) huidig += c;
    else {
      groepen.push(huidig);
      huidig = c;
    }
  }
  groepen.push(huidig);
  if (groepen.length === 3) return groepen.join("-");
  if (groepen.length === 2) {
    // XX-99-99-stijl bestaat niet; 2 groepen betekent 4+2 of 2+4 → splits de lange in tweeën
    const [a, b] = groepen as [string, string];
    return a.length === 4 ? `${a.slice(0, 2)}-${a.slice(2)}-${b}` : `${a}-${b.slice(0, 2)}-${b.slice(2)}`;
  }
  return k;
}

export type ToegangSoort = "werker" | "medewerker" | "bezoeker" | "leverancier";

export const SOORT_LABEL: Record<ToegangSoort, string> = {
  werker: "Flexwerker",
  medewerker: "Eigen medewerker",
  bezoeker: "Bezoeker",
  leverancier: "Leverancier",
};

/** Een kenteken dat een bedrijf kent (eigen medewerker, bezoeker, leverancier) of dat een werker zelf opgaf. */
export interface Registratie {
  kenteken: string;
  soort: ToegangSoort;
  naam: string;
  /** werker/medewerker: wie */
  userId?: string;
  /** alleen op deze vestiging; leeg = overal bij dit bedrijf */
  branchId?: string;
  /** bezoeker/leverancier: alleen in dit venster (ISO) */
  geldigVan?: string;
  geldigTot?: string;
  toelichting?: string;
  /** wie het toevoegde */
  door: string;
  sinds: string;
}

export type Besluit =
  | { open: true; reden: "ingepland" | "medewerker" | "bezoeker" | "handmatig"; naam: string; soort: ToegangSoort; userId?: string }
  | { open: false; reden: "onbekend" | "niet-ingepland" | "buiten-venster" | "andere-vestiging"; naam?: string; soort?: ToegangSoort };

export interface RoosterTreffer {
  /** de werker staat nu (met marge) op deze vestiging ingepland */
  ingepland: boolean;
  shiftId?: string;
  shiftTitel?: string;
}

/** Marge rond een dienst waarin je het terrein op mag: 90 min vooraf, 60 min na. */
export const MARGE_VOOR_MS = 90 * 60_000;
export const MARGE_NA_MS = 60 * 60_000;

/** Valt `nu` binnen [start − 90 min, eind + 60 min]? */
export function binnenDienstMarge(start: Date | string, eind: Date | string, nu: Date): boolean {
  const s = new Date(start).getTime() - MARGE_VOOR_MS;
  const e = new Date(eind).getTime() + MARGE_NA_MS;
  const t = nu.getTime();
  return t >= s && t <= e;
}

/**
 * Het toegangsbesluit, puur: wie hoort bij het kenteken en mag die nu dit terrein op?
 *   - eigen medewerker: altijd (op zijn vestiging, of overal als er geen staat)
 *   - flexwerker: alleen als het rooster hem nu hier zet
 *   - bezoeker/leverancier: alleen binnen het tijdvenster
 */
export function toegangsBesluit(reg: Registratie | null, branchId: string, rooster: RoosterTreffer | null, nu: Date): Besluit {
  if (!reg) return { open: false, reden: "onbekend" };
  if (reg.branchId && reg.branchId !== branchId) return { open: false, reden: "andere-vestiging", naam: reg.naam, soort: reg.soort };
  if (reg.soort === "medewerker") return { open: true, reden: "medewerker", naam: reg.naam, soort: reg.soort, ...(reg.userId ? { userId: reg.userId } : {}) };
  if (reg.soort === "werker") {
    if (rooster?.ingepland) return { open: true, reden: "ingepland", naam: reg.naam, soort: reg.soort, ...(reg.userId ? { userId: reg.userId } : {}) };
    return { open: false, reden: "niet-ingepland", naam: reg.naam, soort: reg.soort };
  }
  const van = reg.geldigVan ? new Date(reg.geldigVan).getTime() : -Infinity;
  const tot = reg.geldigTot ? new Date(reg.geldigTot).getTime() : Infinity;
  if (nu.getTime() >= van && nu.getTime() <= tot) return { open: true, reden: "bezoeker", naam: reg.naam, soort: reg.soort };
  return { open: false, reden: "buiten-venster", naam: reg.naam, soort: reg.soort };
}

export const BESLUIT_TEKST: Record<Besluit["reden"], string> = {
  ingepland: "Ingepland: open",
  medewerker: "Eigen medewerker: open",
  bezoeker: "Bezoeker binnen het venster: open",
  handmatig: "Handmatig geopend",
  onbekend: "Onbekend kenteken",
  "niet-ingepland": "Bekend, maar nu niet ingepland",
  "buiten-venster": "Bezoeker buiten het tijdvenster",
  "andere-vestiging": "Hoort bij een andere vestiging",
};

/* ─────────────── sleutelkluis ─────────────── */

export type KluisSoort = "wifi" | "alarm" | "sleutelkastje" | "inlog" | "deur" | "overig";

export const KLUIS_SOORT_LABEL: Record<KluisSoort, string> = {
  wifi: "Wifi",
  alarm: "Alarmcode",
  sleutelkastje: "Sleutelkastje",
  inlog: "Inloggegevens",
  deur: "Deur- of poortcode",
  overig: "Overig",
};

export const KLUIS_SOORT_ICOON: Record<KluisSoort, string> = {
  wifi: "📶",
  alarm: "🚨",
  sleutelkastje: "🗝️",
  inlog: "💻",
  deur: "🚪",
  overig: "🔐",
};

/** Een geheim zonder het geheim zelf: zo gaat het naar de schermen. */
export interface KluisItemMeta {
  id: string;
  titel: string;
  soort: KluisSoort;
  /** alleen op deze vestiging; leeg = hele bedrijf */
  branchId?: string;
  gebruikersnaam?: string;
  notitie?: string;
  /** minuten vóór de dienst dat een werker het mag zien (standaard 120) */
  minutenVooraf: number;
  /** na elke dienst een seintje dat de code beter vervangen kan worden */
  vervangNaDienst: boolean;
  gewijzigd: string;
  gewijzigdDoor: string;
  /** laatste dienst waarna vervangen is aangeraden, nog niet opgevolgd */
  vervangenAanbevolenSinds?: string;
}

export const STANDAARD_MINUTEN_VOORAF = 120;

/** Mag een werker dit item nu zien, gezien de dienst waarvoor hij ingepland staat? */
export function kluisZichtbaar(item: Pick<KluisItemMeta, "minutenVooraf" | "branchId">, dienst: { branchId: string; startsAt: Date | string; endsAt: Date | string }, nu: Date): boolean {
  if (item.branchId && item.branchId !== dienst.branchId) return false;
  const start = new Date(dienst.startsAt).getTime() - item.minutenVooraf * 60_000;
  const eind = new Date(dienst.endsAt).getTime();
  return nu.getTime() >= start && nu.getTime() <= eind;
}

/* ─────────────── badges en labels ─────────────── */

export const LABEL_SOORTEN = ["badge", "naamsticker", "verzendlabel", "incheckbon"] as const;
export type LabelSoort = (typeof LABEL_SOORTEN)[number];
export const isLabelSoort = (s: unknown): s is LabelSoort => typeof s === "string" && (LABEL_SOORTEN as readonly string[]).includes(s);

export interface LabelFormaat {
  naam: string;
  /** mm */
  breedte: number;
  hoogte: number;
  uitleg: string;
}

export const LABEL_FORMAAT: Record<LabelSoort, LabelFormaat> = {
  badge: { naam: "Bezoekersbadge", breedte: 62, hoogte: 100, uitleg: "Staand, voor een badgehouder of op de kleding (Brother QL 62 mm, Dymo 59 mm)." },
  naamsticker: { naam: "Naamsticker", breedte: 62, hoogte: 29, uitleg: "Liggend, naam en bedrijf (Brother QL 62 × 29 mm, Dymo 54 × 25 mm)." },
  verzendlabel: { naam: "Verzendlabel", breedte: 100, hoogte: 150, uitleg: "Adreslabel voor pakketten (Zebra, Brother QL-1100, 100 × 150 mm)." },
  incheckbon: { naam: "Incheckbon", breedte: 58, hoogte: 0, uitleg: "Bon van een bonprinter (58 of 80 mm rol); lengte volgt de inhoud." },
};

export type PrintStatus = "wacht" | "geprint" | "mislukt" | "ingetrokken";

export const PRINT_STATUS_LABEL: Record<PrintStatus, string> = {
  wacht: "Wacht op de printer",
  geprint: "Geprint",
  mislukt: "Mislukt",
  ingetrokken: "Ingetrokken",
};

/** De inhoud van één label; alle soorten in één vorm, zodat de printwachtrij en de sjablonen hetzelfde lezen. */
export interface LabelInhoud {
  soort: LabelSoort;
  /** grote regel: naam of ontvanger */
  kop: string;
  /** daaronder: bedrijf, functie, klus */
  regels: string[];
  /** rechtsonder of onderaan */
  voet?: string;
  /** controlecode in de QR (bijv. link naar het werkpaspoort of de incheck-code) */
  qr?: string;
  /** datum/tijd als tekst (Nederlandse tijd, door de server bepaald) */
  tijd?: string;
}

export interface PrintOpdracht {
  id: string;
  tenantId: string;
  branchId?: string;
  inhoud: LabelInhoud;
  status: PrintStatus;
  aangemaakt: string;
  door: string;
  doorNaam: string;
  /** "inchecken" | "handmatig" | "agent-test" */
  bron: string;
  geprintOp?: string;
  printer?: string;
  fout?: string;
}

/** Een label op maat: tekst wordt afgebroken op het aantal tekens dat op de rol past. */
export function knipRegel(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/* ─────────────── portofoon (puur deel) ─────────────── */

export type KanaalSoort = "klus" | "vestiging";

export const kanaalId = (soort: KanaalSoort, id: string): string => `${soort}:${id}`;

export function leesKanaalId(s: string): { soort: KanaalSoort; id: string } | null {
  const m = /^(klus|vestiging):([A-Za-z0-9_-]{6,40})$/.exec(s);
  return m ? { soort: m[1] as KanaalSoort, id: m[2]! } : null;
}

/**
 * Wie van twee verbonden leden doet het aanbod (WebRTC-offer)? Altijd dezelfde
 * kant, zodat twee telefoons niet tegelijk aanbieden: de laagste userId.
 */
export const biedtAan = (ik: string, ander: string): boolean => ik < ander;
