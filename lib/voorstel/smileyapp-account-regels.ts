// ---------------------------------------------------------------------------
// Regels voor het team van het SmileyApp-beheer (19 nov 2026): wie mag wat,
// wanneer een uitnodiging verloopt en naar welk adres de link in de mail wijst.
// Puur (geen kv, crypto of next), dus los te testen en ook bruikbaar in het
// scherm. De opslag en de sessie staan in lib/voorstel/smileyapp-accounts.ts.
// ---------------------------------------------------------------------------

export type Rol = "beheerder" | "medewerker";
export const ROLLEN = ["beheerder", "medewerker"] as const;
export const ROL_LABEL: Record<Rol, string> = { beheerder: "Beheerder", medewerker: "Medewerker" };

export type AccountStatus = "uitgenodigd" | "actief" | "geblokkeerd";
export const STATUS_LABEL: Record<AccountStatus, string> = {
  uitgenodigd: "Uitgenodigd, nog geen wachtwoord",
  actief: "Actief",
  geblokkeerd: "Geblokkeerd",
};

export const NAAM_MIN = 2;
export const NAAM_MAX = 80;
export const WACHTWOORD_MIN = 10;
export const WACHTWOORD_MAX = 200;
export const UITNODIGING_DAGEN = 14;

/** Wat de regels van een account moeten weten (de opslag heeft meer velden). */
export interface TeamLid {
  email: string;
  rol: Rol;
  /** er is een wachtwoord gekozen */
  heeftWachtwoord: boolean;
  geblokkeerd: boolean;
}

export const normEmail = (email: string) => email.trim().toLowerCase();

/** Eenvoudige controle: één @, iets ervoor, een domein met een punt, geen spaties. */
export function geldigEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function geldigeNaam(naam: string): boolean {
  const n = naam.trim();
  return n.length >= NAAM_MIN && n.length <= NAAM_MAX;
}

export function wachtwoordFout(wachtwoord: string): string | null {
  if (wachtwoord.length < WACHTWOORD_MIN) return `Kies een wachtwoord van minimaal ${WACHTWOORD_MIN} tekens.`;
  if (wachtwoord.length > WACHTWOORD_MAX) return "Dit wachtwoord is te lang.";
  return null;
}

export function accountStatus(a: Pick<TeamLid, "heeftWachtwoord" | "geblokkeerd">): AccountStatus {
  if (a.geblokkeerd) return "geblokkeerd";
  return a.heeftWachtwoord ? "actief" : "uitgenodigd";
}

/** Tot wanneer een uitnodiging van nu geldig is. */
export const uitnodigingTot = (nu: Date) => new Date(nu.getTime() + UITNODIGING_DAGEN * 86_400_000).toISOString();

export function uitnodigingVerlopen(tot: string, nu: Date): boolean {
  const t = new Date(tot).getTime();
  return !Number.isFinite(t) || t <= nu.getTime();
}

/** Alleen een beheerder nodigt uit, wijzigt rollen, blokkeert en verwijdert; een medewerker kijkt mee. */
export const magTeamBeheren = (rol: Rol) => rol === "beheerder";

/** Een beheerder die echt kan inloggen: wachtwoord gekozen en niet geblokkeerd. */
const actieveBeheerder = (a: TeamLid) => a.rol === "beheerder" && a.heeftWachtwoord && !a.geblokkeerd;

export type TeamActie = { soort: "rol"; rol: Rol } | { soort: "blokkeren"; geblokkeerd: boolean } | { soort: "verwijderen" };

/**
 * Mag `ik` dit met het account `doel` doen? `ik.email` is leeg voor een
 * ZekerFlex-platformbeheerder (het vangnet: die heeft geen SmileyApp-account).
 * Geeft null als het mag, anders de melding voor het scherm.
 */
export function teamActieFout(ik: { email: string; rol: Rol }, doel: string, actie: TeamActie, team: readonly TeamLid[]): string | null {
  if (!magTeamBeheren(ik.rol)) return "Alleen een beheerder kan het team beheren.";
  const e = normEmail(doel);
  const lid = team.find((t) => normEmail(t.email) === e);
  if (!lid) return "Dit account bestaat niet (meer).";
  if (ik.email && normEmail(ik.email) === e) return "Je kunt je eigen account niet blokkeren, verwijderen of een andere rol geven.";
  // valt door deze stap de laatste beheerder weg die kan inloggen?
  const neemtBeheerderWeg =
    actieveBeheerder(lid) && (actie.soort === "verwijderen" || (actie.soort === "blokkeren" && actie.geblokkeerd) || (actie.soort === "rol" && actie.rol !== "beheerder"));
  if (neemtBeheerderWeg && team.filter(actieveBeheerder).length <= 1) return "Dit is de laatste beheerder. Maak eerst iemand anders beheerder.";
  return null;
}

export const SUBDOMEIN_HOST = "smileyapp.zekerflex.com";

/**
 * Het adres van het beheer voor de link in een mail. Op het eigen subdomein
 * het korte adres, anders het lange pad op de hoofdsite. De host uit het
 * verzoek komt nooit zelf in de link: hij wordt alleen vergeleken met het ene
 * bekende subdomein (anders kan iemand met een vervalste Host-kop een link naar
 * zijn eigen site laten mailen).
 */
export function beheerAdres(o: { host: string | null | undefined; voorstelKop: string | null | undefined; appBasis: string }): string {
  const host = (o.host ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const opSubdomein = host === SUBDOMEIN_HOST || (o.voorstelKop ?? "").trim().toLowerCase() === "smileyapp";
  return opSubdomein ? `https://${SUBDOMEIN_HOST}/beheer` : `${o.appBasis.replace(/\/+$/, "")}/voorstel/smileyapp/beheer`;
}

/** Een uitnodigingstoken is 32 willekeurige bytes als base64url: 43 tekens. */
export const isUitnodigingToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
