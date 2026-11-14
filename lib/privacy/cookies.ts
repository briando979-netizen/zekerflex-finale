import { BANK_AAN } from "@/lib/app-mode";

// ---------------------------------------------------------------------------
// De cookies van zekerflex.com en de app (14 nov 2026): de lijst in /cookiebeleid §6. Per cookie de echte naam (zoals in
// productie), het doel en de looptijd uit de code. Vroeger stonden er drie soorten zonder looptijd, en "tijdens je bezoek"
// voor een inlog van 8 uur of 30 dagen. tests/cookiebeleid-cookies.test.ts houdt deze lijst gelijk aan de code: een nieuwe
// cookie of een andere looptijd laat de test falen. Websites van klanten (lib/sites) staan op hun eigen domein en vallen
// hierbuiten. Puur: de pagina en de test gebruiken dit.
// ---------------------------------------------------------------------------

const MINUUT = 60;
const UUR = 60 * MINUUT;
const DAG = 24 * UUR;
const JAAR = 365 * DAG;

/** Seconden, of "sessie": weg zodra je de browser sluit. */
export type Looptijd = number | "sessie";

export interface GeplaatsteCookie {
  /** de naam of namen zoals de browser ze ziet (in productie) */
  namen: readonly string[];
  doel: string;
  looptijd: Looptijd;
  /** een tweede looptijd, met wanneer die geldt */
  anders?: { looptijd: Looptijd; wanneer: string };
  /** false = deze cookie wordt nu niet gezet (de functie staat uit) en hoort dan niet in de lijst */
  aan?: boolean;
}

export const GEPLAATSTE_COOKIES: readonly GeplaatsteCookie[] = [
  { namen: ["__Secure-zekerflex.session"], doel: "houdt je ingelogd", looptijd: 8 * UUR, anders: { looptijd: 30 * DAG, wanneer: "als je \"ingelogd blijven\" kiest" } },
  { namen: ["__Secure-authjs.state", "__Secure-authjs.nonce", "__Secure-authjs.pkce.code_verifier"], doel: "rondt inloggen met Google of Apple veilig af", looptijd: 15 * MINUUT },
  { namen: ["__Secure-authjs.callback-url"], doel: "onthoudt waar je na het inloggen met Google of Apple terugkomt", looptijd: "sessie" },
  { namen: ["__Host-authjs.csrf-token"], doel: "beschermt het inloggen tegen misbruik vanaf een andere website", looptijd: "sessie" },
  { namen: ["zf_passkey"], doel: "rondt inloggen met een passkey af", looptijd: 5 * MINUUT },
  { namen: ["zf_cookie_consent"], doel: "onthoudt dat je de cookiemelding hebt gezien", looptijd: JAAR },
  { namen: ["zf_locale"], doel: "onthoudt je taal", looptijd: JAAR },
  { namen: ["zf_theme"], doel: "onthoudt of je de lichte of donkere weergave koos", looptijd: JAAR },
  { namen: ["zf_dashboard"], doel: "onthoudt welke werkruimte je als werkgever het laatst koos", looptijd: JAAR },
  { namen: ["zf_shop_modus"], doel: "onthoudt of je in de webshop particulier of zakelijk winkelt", looptijd: JAAR },
  { namen: ["zf_welkom"], doel: "onthoudt dat je het welkomstscherm al hebt gezien", looptijd: JAAR },
  { namen: ["zf_balk_dicht"], doel: "onthoudt dat je de aankondigingsbalk hebt weggeklikt", looptijd: 30 * DAG },
  { namen: ["zf_app", "zf_app_ios", "zf_app_chip"], doel: "onthoudt dat je de Android- of iPhone-app gebruikt (en of die de chip van een ID-kaart kan lezen), zodat je de app-weergave krijgt", looptijd: JAAR },
  { namen: ["zf_taal_geteld"], doel: "zorgt dat de taal van je browser maar één keer per bezoek anoniem wordt meegeteld; zonder id", looptijd: "sessie" },
  { namen: ["zf_horeca_scherm"], doel: "koppelt een tablet of scherm aan een horecazaak, alleen op dat apparaat", looptijd: JAAR },
  { namen: ["zf_rijles"], doel: "houdt een leerling ingelogd in de omgeving van een rijschool", looptijd: 60 * DAG },
  { namen: ["zf_view_as"], doel: "alleen voor beheerders: een scherm alleen-lezend bekijken zoals een gebruiker het ziet", looptijd: 2 * UUR },
  { namen: ["schw_sessie"], doel: "alleen op een websitevoorstel: houdt je ingelogd op dat voorstel", looptijd: 30 * DAG },
  { namen: ["schw_google"], doel: "alleen op een websitevoorstel: rondt het koppelen met Google af", looptijd: 10 * MINUUT },
  // de doorverwijsbonus werd op ZekerFlex Bank gestort en staat met de bank uit (lib/app-mode.ts): dan zet /r/<code> niets
  { namen: ["zf_ref"], doel: "onthoudt via welke doorverwijslink je binnenkwam, voor de doorverwijsbonus", looptijd: 30 * DAG, aan: BANK_AAN },
];

/** De cookies die nu echt gezet kunnen worden (de lijst op /cookiebeleid). */
export function cookiesNu(): readonly GeplaatsteCookie[] {
  return GEPLAATSTE_COOKIES.filter((c) => c.aan !== false);
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function looptijdTekst(l: Looptijd): string {
  if (l === "sessie") return "tot je de browser sluit";
  if (l % JAAR === 0) return meervoud(l / JAAR, "jaar", "jaar");
  if (l % DAG === 0) return meervoud(l / DAG, "dag", "dagen");
  if (l % UUR === 0) return meervoud(l / UUR, "uur", "uur");
  if (l % MINUUT === 0) return meervoud(l / MINUUT, "minuut", "minuten");
  return meervoud(l, "seconde", "seconden");
}

/** Eén regel voor de lijst: namen, doel en looptijd. */
export function cookieRegel(c: GeplaatsteCookie): string {
  const anders = c.anders ? `, of ${looptijdTekst(c.anders.looptijd)} ${c.anders.wanneer}` : "";
  return `${c.namen.join(", ")}: ${c.doel}. Looptijd: ${looptijdTekst(c.looptijd)}${anders}.`;
}
