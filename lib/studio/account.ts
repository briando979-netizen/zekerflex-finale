// ---------------------------------------------------------------------------
// Het account van een webshop of website, binnen de studio zelf (11 nov 2026, eigenaar: "bouw de
// hele webshop account dashboard af, apart; ik wil niet dat die in het dashboard van een werkgever
// zit dat zich bezighoudt met freelancen en klussen uitzetten"). Bedrijf, facturen, team, mail en
// je eigen inloggegevens staan onder /studio/<soort>/<onderdeel>, in het menu van de studio, en
// /werkgever/<onderdeel> stuurt wie het dashboard website of webshop open heeft daarheen
// (lib/studio/account-server.ts). Puur: het menu (client) en de pagina's (server) lezen dit.
// ---------------------------------------------------------------------------

export const ACCOUNT_ONDERDELEN = [
  { pad: "bedrijf", label: "Bedrijf" },
  { pad: "facturen", label: "Facturen" },
  { pad: "team", label: "Team" },
  { pad: "mail", label: "Mail" },
  { pad: "account", label: "Mijn account" },
] as const;

export type AccountOnderdeel = (typeof ACCOUNT_ONDERDELEN)[number]["pad"];
export type StudioSoort = "website" | "webshop";

const ONDERDELEN = new Set<string>(ACCOUNT_ONDERDELEN.map((o) => o.pad));

/** Het adres van een accountonderdeel in de studio. */
export const studioAccountAdres = (soort: StudioSoort, onderdeel: AccountOnderdeel): string => `/studio/${soort}/${onderdeel}`;

/** Is dit een accountscherm van de studio? Die werken ook zonder eigen site (StudioShell). */
export function isAccountPad(pad: string): boolean {
  const m = /^\/studio\/(website|webshop)\/([a-z]+)(?:\/|$)/.exec(pad);
  return Boolean(m && ONDERDELEN.has(m[2] ?? ""));
}

/** Initialen voor de accountknop bovenaan ("Jan de Vries" → "JV"). */
export function initialen(naam: string): string {
  const delen = naam.trim().split(/\s+/).filter(Boolean);
  const eerste = delen[0]?.[0] ?? "";
  const laatste = delen.length > 1 ? (delen[delen.length - 1]?.[0] ?? "") : "";
  return (eerste + laatste).toUpperCase() || "?";
}
