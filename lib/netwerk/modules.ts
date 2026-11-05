// ---------------------------------------------------------------------------
// ZekerFlex Verbinding: netwerkpakketten voor bedrijven, bovenop hun eigen
// ZekerFlex-omgeving. Alles draait op de eigen server met vrije software
// (FreeRADIUS voor de wifi, Headscale/WireGuard voor de VPN, Open5GS voor een
// eigen 5G-netwerk), dus zonder maandelijkse licentiekosten bij een ander.
// Puur bestand (geen prisma, kv of env): ook de schermen in de browser lezen
// hieruit. De prijzen komen uit het prijsvoorstel van de eigenaar (5 nov 2026).
// ---------------------------------------------------------------------------

export const MODULES = ["wifi", "vpn", "5g"] as const;
export type ModuleSleutel = (typeof MODULES)[number];
export const isModule = (s: unknown): s is ModuleSleutel => typeof s === "string" && (MODULES as readonly string[]).includes(s);

export type ModuleStatus = "aangevraagd" | "wacht-op-betaling" | "actief" | "opgezegd";
export type VpnVariant = "per-gebruiker" | "onbeperkt";
export const isVpnVariant = (s: unknown): s is VpnVariant => s === "per-gebruiker" || s === "onbeperkt";

export interface ModuleDef {
  sleutel: ModuleSleutel;
  naam: string;
  /** de naam uit het prijsvoorstel, voor wie die kent */
  ookBekendAls: string;
  /** één regel voor kaarten en het menu */
  kort: string;
  /** een paar zinnen op de eigen kaart */
  uitleg: string;
  punten: string[];
  voorWie: string;
  /** waarover de prijs gaat */
  eenheid: "vestiging" | "gebruiker" | "terrein";
  eenheidLabel: { een: string; meer: string };
  /** per eenheid per maand, in centen */
  prijsCent: number;
  /** vpn: één vast bedrag per maand voor onbeperkt gebruik */
  onbeperktCent?: number;
  /** 5g: altijd eerst een gesprek (vergunning, apparatuur, terrein) */
  opAanvraag: boolean;
  prijsTekst: string;
  /** wat de klant zelf nodig heeft */
  nodig: string;
}

export const MODULE_DEFS: Record<ModuleSleutel, ModuleDef> = {
  wifi: {
    sleutel: "wifi",
    naam: "Wifi op de werkvloer",
    ookBekendAls: "Direct Access",
    kort: "Flexwerkers krijgen vanzelf wifi zodra hun dienst begint, en raken het kwijt als die eindigt.",
    uitleg:
      "Geen gedeeld wifi-wachtwoord meer op een briefje. Iedere medewerker en flexwerker logt in met een eigen naam en wachtwoord. Een flexwerker krijgt alleen toegang op de vestiging waar hij die dag ingepland staat, vanaf een half uur voor het begin tot een half uur na het einde van de dienst.",
    punten: [
      "Geen gedeelde wifi-wachtwoorden meer op de werkvloer",
      "Toegang volgt het rooster: dienst begint, wifi aan; dienst voorbij, wifi uit",
      "Eigen medewerkers hebben altijd toegang met hun ZekerFlex-login",
      "Beveiligd met WPA2/WPA3-Enterprise (RADIUS), zoals op kantoor bij grote bedrijven",
      "Werkt met de meeste zakelijke wifi-apparatuur (UniFi, Aruba, Cisco, MikroTik, TP-Link Omada)",
    ],
    voorWie: "Kantoren, horeca, magazijnen en flexwerkplekken met wisselende mensen op de vloer.",
    eenheid: "vestiging",
    eenheidLabel: { een: "vestiging", meer: "vestigingen" },
    prijsCent: 4900,
    opAanvraag: false,
    prijsTekst: "€ 49 per vestiging per maand",
    nodig: "Zakelijke wifi-apparatuur die WPA2/WPA3-Enterprise met een RADIUS-server ondersteunt, en een vast IP-adres per vestiging.",
  },
  vpn: {
    sleutel: "vpn",
    naam: "Veilige werkplek (VPN)",
    ookBekendAls: "Secure Workplace",
    kort: "Een versleutelde verbinding naar jullie eigen systemen, voor flexwerkers en medewerkers, waar ze ook zijn.",
    uitleg:
      "Wie op afstand werkt, krijgt een eigen versleutelde tunnel naar jullie interne systemen (administratie, planning, dashboards). Elk apparaat krijgt een eenmalige toegangscode uit ZekerFlex; niets staat open op internet. Gebouwd op WireGuard, de techniek achter moderne zakelijke VPN's.",
    punten: [
      "Rechtstreekse, versleutelde verbindingen tussen apparaten (zero trust: alleen wat is toegestaan)",
      "Toegangscodes maak je in ZekerFlex; een code werkt één keer en verloopt vanzelf",
      "Je ziet welke apparaten verbonden zijn en zet er één met één klik af",
      "Geen dure diensten als Tailscale, Cloudflare Teams of een bedrijfs-VPN van een derde nodig",
    ],
    voorWie: "Bedrijven met mensen op afstand of hybride, ICT-bedrijven en wie met gevoelige gegevens werkt (administratie, logistiek).",
    eenheid: "gebruiker",
    eenheidLabel: { een: "gebruiker", meer: "gebruikers" },
    prijsCent: 400,
    onbeperktCent: 14900,
    opAanvraag: false,
    prijsTekst: "€ 4 per actieve gebruiker per maand, of € 149 per maand voor het hele bedrijf",
    nodig: "Op elk apparaat de gratis Tailscale-app (Windows, Mac, Linux, Android, iPhone); de verbinding loopt via de ZekerFlex-server.",
  },
  "5g": {
    sleutel: "5g",
    naam: "Eigen 5G-netwerk op het terrein",
    ookBekendAls: "Site Infrastructure",
    kort: "Een eigen, afgeschermd mobiel netwerk op een bouwplaats, evenemententerrein of distributiecentrum.",
    uitleg:
      "Een eigen 5G-netwerk voor handterminals, camera's, routers en machines op het terrein, los van de landelijke netwerken. ZekerFlex levert de software (de netwerkkern) en het beheer van de simkaarten. Een eigen netwerk vraagt een lokale vergunning van de Rijksinspectie Digitale Infrastructuur en apparatuur op het terrein; daarom beginnen we altijd met een gesprek.",
    punten: [
      "Eigen frequentie op het terrein, zonder afhankelijkheid van KPN, Odido of VodafoneZiggo",
      "Simkaarten beheren en blokkeren vanuit je ZekerFlex-beheer",
      "Voorrang voor belangrijke verbindingen (bijvoorbeeld camera's of scanners)",
      "Apparatuur (antennes, simkaarten) leveren we erbij, tegen kostprijs plus een opslag",
    ],
    voorWie: "Bouwlocaties, evenemententerreinen, grote distributiecentra en afgesloten bedrijfsterreinen.",
    eenheid: "terrein",
    eenheidLabel: { een: "terrein", meer: "terreinen" },
    prijsCent: 29900,
    opAanvraag: true,
    prijsTekst: "vanaf € 299 per maand, exclusief apparatuur en eenmalige inrichting",
    nodig: "Een lokale frequentievergunning (3,5 GHz) van de RDI voor het terrein en apparatuur ter plaatse; wij helpen bij de aanvraag.",
  },
};

export const MODULE_LIJST: ModuleDef[] = MODULES.map((s) => MODULE_DEFS[s]);

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  aangevraagd: "Aangevraagd",
  "wacht-op-betaling": "Wacht op betaling",
  actief: "Actief",
  opgezegd: "Opgezegd",
};

/** De stand van één pakket bij een bedrijf. */
export interface ModuleStand {
  status: ModuleStatus;
  /** ISO-tijd van de laatste statuswijziging */
  sinds: string;
  /** vestigingen of gebruikers waarvoor betaald wordt (5g: terreinen) */
  aantal: number;
  variant?: VpnVariant;
  stripeSessionId?: string;
  stripeSubId?: string;
  /** kosteloos account: € 0, meteen actief */
  gratis?: boolean;
  /** wat de klant erbij schreef (5g) of een notitie van het beheer */
  toelichting?: string;
  /** opgezegd, loopt nog tot het einde van de betaalperiode */
  eindigtOp?: string;
}

export interface NetwerkStand {
  modules: Partial<Record<ModuleSleutel, ModuleStand>>;
  updatedAt: string;
}

export const LEGE_STAND: NetwerkStand = { modules: {}, updatedAt: "" };

export function moduleActief(stand: NetwerkStand | null | undefined, sleutel: ModuleSleutel): boolean {
  return stand?.modules[sleutel]?.status === "actief";
}

/** Het maandbedrag in centen voor dit pakket met dit aantal (en bij de VPN deze variant). */
export function maandbedragCent(sleutel: ModuleSleutel, aantal: number, variant?: VpnVariant): number {
  const def = MODULE_DEFS[sleutel];
  const n = Math.max(1, Math.floor(aantal));
  if (sleutel === "vpn" && variant === "onbeperkt") return def.onbeperktCent ?? def.prijsCent * n;
  return def.prijsCent * n;
}

/** Bij de VPN is onbeperkt voordeliger vanaf dit aantal gebruikers. */
export function vpnOnbeperktVanaf(): number {
  const def = MODULE_DEFS.vpn;
  return Math.ceil((def.onbeperktCent ?? 0) / def.prijsCent);
}

export interface OverzichtRegel {
  sleutel: ModuleSleutel;
  naam: string;
  omschrijving: string;
  bedragCent: number;
}

/** De actieve pakketten als factuurregels, en het totaal per maand (kosteloos = € 0). */
export function maandOverzicht(stand: NetwerkStand | null | undefined): { regels: OverzichtRegel[]; totaalCent: number } {
  const regels: OverzichtRegel[] = [];
  for (const sleutel of MODULES) {
    const m = stand?.modules[sleutel];
    if (!m || m.status !== "actief") continue;
    const def = MODULE_DEFS[sleutel];
    const omschrijving =
      sleutel === "vpn" && m.variant === "onbeperkt"
        ? "hele bedrijf, onbeperkt"
        : `${m.aantal} ${m.aantal === 1 ? def.eenheidLabel.een : def.eenheidLabel.meer}`;
    regels.push({ sleutel, naam: def.naam, omschrijving, bedragCent: m.gratis ? 0 : maandbedragCent(sleutel, m.aantal, m.variant) });
  }
  return { regels, totaalCent: regels.reduce((s, r) => s + r.bedragCent, 0) };
}

/** "€ 49" of "€ 4,50": zoals op een prijslijst, zonder losse nullen. */
export function euro(cent: number): string {
  const heel = Math.floor(Math.abs(cent) / 100);
  const rest = Math.abs(cent) % 100;
  const teken = cent < 0 ? "-" : "";
  const duizend = heel.toLocaleString("nl-NL");
  return `${teken}€ ${duizend}${rest ? `,${String(rest).padStart(2, "0")}` : ""}`;
}

/** Letters en cijfers zonder verwarrende tekens (geen 0/O, 1/l/I), als leesbare groepen: "kx7m-2pq9-h4nt-8vwz". */
const LEESBAAR = "abcdefghjkmnpqrstuvwxyz23456789";
export function leesbareCode(bytes: Uint8Array, groepen = 4, perGroep = 4): string {
  const tekens: string[] = [];
  for (let i = 0; i < groepen * perGroep; i++) tekens.push(LEESBAAR[(bytes[i] ?? 0) % LEESBAAR.length] ?? "x");
  const uit: string[] = [];
  for (let g = 0; g < groepen; g++) uit.push(tekens.slice(g * perGroep, (g + 1) * perGroep).join(""));
  return uit.join("-");
}

/** De RADIUS-server zoals de klant hem in zijn wifi-apparatuur zet. */
export const RADIUS_POORT = 1812;
