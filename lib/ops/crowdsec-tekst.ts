// ---------------------------------------------------------------------------
// Teksten en rekenwerk voor de aanvalsbescherming (CrowdSec), zonder server-
// afhankelijkheden: ook in tests en client-code bruikbaar. De aanroepen naar de
// engine staan in lib/ops/crowdsec.ts.
// ---------------------------------------------------------------------------

/** Een actieve blokkade zoals de lokale API hem geeft (GET /v1/decisions). */
export interface Blokkade {
  id: number;
  /** "crowdsec" = eigen detectie; "CAPI"/"lists" = blokkadelijst van de community; "cscli" = met de hand */
  origin: string;
  type: string;
  scope: string;
  value: string;
  /** resterende duur zoals de API hem geeft, bv. "3h12m4.5s" (negatief = verlopen) */
  duration: string;
  scenario: string;
}

/** Een melding (alert) van de engine: één adres dat zich als aanvaller gedroeg. */
export interface Melding {
  id: number;
  created_at: string;
  scenario: string;
  source: { scope?: string; value?: string; ip?: string; cn?: string; as_name?: string };
  decisions?: { duration: string; type: string; origin?: string }[] | null;
  events_count?: number;
  message?: string;
}

export interface BlokkadeSamenvatting {
  totaal: number;
  /** door de eigen engine herkend (uit onze logs) */
  eigen: number;
  /** van de blokkadelijst van de community */
  community: number;
  /** met de hand gezet (cscli) */
  handmatig: number;
  /** de eigen detecties per soort, grootste eerst */
  perScenario: { scenario: string; aantal: number }[];
}

export const LEGE_SAMENVATTING: BlokkadeSamenvatting = { totaal: 0, eigen: 0, community: 0, handmatig: 0, perScenario: [] };

export function samenvatBlokkades(lijst: Blokkade[]): BlokkadeSamenvatting {
  const tel = new Map<string, number>();
  let eigen = 0;
  let community = 0;
  let handmatig = 0;
  for (const b of lijst) {
    if (b.origin === "crowdsec") {
      eigen += 1;
      tel.set(b.scenario, (tel.get(b.scenario) ?? 0) + 1);
    } else if (b.origin === "cscli") handmatig += 1;
    else community += 1;
  }
  const perScenario = [...tel]
    .map(([scenario, aantal]) => ({ scenario, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.scenario.localeCompare(b.scenario))
    .slice(0, 8);
  return { totaal: lijst.length, eigen, community, handmatig, perScenario };
}

// De scenario's van de CrowdSec-hub in gewone taal; onbekende krijgen hun korte naam.
const SCENARIO_TEKST: [RegExp, string][] = [
  [/community-blocklist/, "Bekende aanvaller (community-lijst)"],
  [/http-probing/, "Zoekt naar kwetsbare pagina's"],
  [/http-crawl-non_statics/, "Doorzoekt de site als een robot"],
  [/http-bad-user-agent/, "Bekende aanvalssoftware"],
  [/http-sensitive-files/, "Probeert gevoelige bestanden te lezen"],
  [/http-path-traversal/, "Probeert buiten de webmap te lezen"],
  [/http-sqli/, "Probeert in te breken via invoer (SQL)"],
  [/http-xss/, "Probeert in te breken via invoer (XSS)"],
  [/http-backdoors/, "Zoekt achterdeurtjes"],
  [/http-admin-interface/, "Zoekt beheerpanelen"],
  [/http-open-proxy/, "Misbruikt de server als open proxy"],
  // ssh vóór het algemene "-bf"-patroon, anders heet ssh-bf ook "raadt wachtwoorden"
  [/ssh-bf|ssh-slow-bf|ssh-cve/, "Probeert in te loggen op de server (ssh)"],
  [/http-wordpress|http-generic-bf|http-generic-401|-bf$/, "Raadt wachtwoorden"],
  [/http-dos|http-flood/, "Overbelast de server"],
  [/http-cve-|CVE-/i, "Bekende kwetsbaarheid (CVE)"],
];

export function scenarioTekst(scenario: string): string {
  for (const [re, tekst] of SCENARIO_TEKST) if (re.test(scenario)) return tekst;
  return scenario.split("/").pop() || scenario;
}

/** "3h12m4.5s" → "nog 3 u 12 min"; negatief of leeg → "verlopen". */
export function duurTekst(duur: string | null | undefined): string {
  if (!duur) return "verlopen";
  const m = /^(-)?(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(duur.trim());
  if (!m) return duur;
  if (m[1]) return "verlopen";
  const uren = Number(m[2] ?? 0);
  const minuten = Number(m[3] ?? 0);
  const seconden = Number(m[4] ?? 0);
  const totaalMin = uren * 60 + minuten + (seconden >= 30 ? 1 : 0);
  if (totaalMin <= 0 && seconden <= 0) return "verlopen";
  if (totaalMin < 1) return "nog minder dan een minuut";
  if (totaalMin >= 48 * 60) {
    const dagen = Math.floor(totaalMin / (24 * 60));
    const restUren = Math.floor((totaalMin - dagen * 24 * 60) / 60);
    return `nog ${dagen} d${restUren ? ` ${restUren} u` : ""}`;
  }
  const u = Math.floor(totaalMin / 60);
  const min = totaalMin % 60;
  return `nog ${u ? `${u} u` : ""}${u && min ? " " : ""}${min ? `${min} min` : ""}`;
}

/** Landcode (GeoIP) als vlag, bv. "NL" → 🇳🇱; zonder code een wereldbol. */
export function vlagVan(cn: string | null | undefined): string {
  if (!cn || !/^[A-Za-z]{2}$/.test(cn)) return "🌐";
  return [...cn.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

export function meldingAdres(m: Melding): string {
  return m.source.ip || m.source.value || "?";
}

/** De cijfers voor de openbare pagina (/beveiliging): alleen aantallen, nooit adressen. */
export interface BeveiligingsCijfers {
  blokkadesNu: number;
  community: number;
  eigen: number;
  /** eigen meldingen van de afgelopen 7 dagen; null als de meldingen niet te lezen waren */
  meldingen7d: number | null;
  bijgewerkt: string;
}

export function cijfersUit(s: BlokkadeSamenvatting, meldingen7d: number | null, op: Date): BeveiligingsCijfers {
  return { blokkadesNu: s.totaal, community: s.community, eigen: s.eigen + s.handmatig, meldingen7d, bijgewerkt: op.toISOString() };
}
