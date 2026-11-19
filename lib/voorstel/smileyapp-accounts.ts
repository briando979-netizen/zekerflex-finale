import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getPrincipal, hasRole } from "@/lib/auth";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import {
  accountStatus,
  geldigEmail,
  geldigeNaam,
  herstelTot,
  isUitnodigingToken,
  normEmail,
  teamActieFout,
  uitnodigingTot,
  uitnodigingVerlopen,
  wachtwoordFout,
  type AccountStatus,
  type Rol,
  type TeamActie,
  type TeamLid,
} from "@/lib/voorstel/smileyapp-account-regels";
import { stuurHerstel, stuurUitnodiging } from "@/lib/voorstel/smileyapp-mail";

// ---------------------------------------------------------------------------
// Het team van het SmileyApp-beheer (19 nov 2026): Martijn en de medewerkers
// die hij uitnodigt. Bewust los van de ZekerFlex-gebruikers en van het
// Schwarzwald-voorstel: eigen KV-voorvoegsel, eigen cookie en een eigen
// HMAC-label (beide voorstellen delen op zekerflex.com dezelfde host, dus met
// hetzelfde label zou een Schwarzwald-sessie hier ook gelden). Je komt alleen
// binnen met een uitnodiging: er is geen registratie. Van de uitnodigingslink
// staat alleen de sha256 in de opslag. Een ZekerFlex-platformbeheerder mag
// altijd in het beheer (het vangnet: zo krijgt Martijn zijn eerste uitnodiging).
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:account:";
export const SESSIE_COOKIE = "smiley_sessie";
const SESSIE_DAGEN = 14;
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface Account {
  email: string;
  naam: string;
  rol: Rol;
  /** scrypt-hash; ontbreekt zolang de uitnodiging niet is aangenomen */
  wachtwoord?: string;
  /** sha256 van het token uit de mail, en tot wanneer het geldt */
  uitnodiging?: { hash: string; tot: string };
  /** wachtwoord vergeten: sha256 van het token uit de mail, een uur geldig en één keer te gebruiken */
  herstel?: { hash: string; tot: string };
  /** gaat omhoog bij elk nieuw wachtwoord via "wachtwoord vergeten"; zit in het sessietoken, dus oude sessies vervallen */
  sessieVersie?: number;
  uitgenodigdDoor?: string;
  aangemaakt: string;
  laatstIngelogd?: string;
  geblokkeerd?: boolean;
}

/** Wat het scherm van een account te zien krijgt: nooit de hash van het wachtwoord of van de uitnodiging. */
export interface PubliekAccount {
  email: string;
  naam: string;
  rol: Rol;
  status: AccountStatus;
  aangemaakt: string;
  uitgenodigdDoor?: string;
  laatstIngelogd?: string;
  /** tot wanneer de openstaande uitnodiging geldt */
  uitnodigingTot?: string;
}

/** Wie er in het beheer zit: een SmileyApp-account, of een ZekerFlex-platformbeheerder (email leeg). */
export interface Toegang {
  naam: string;
  email: string;
  rol: Rol;
  via: "smileyapp" | "zekerflex";
  /** waar een limiet per persoon op telt */
  id: string;
}

const sleutel = (email: string) => `${PREFIX}${normEmail(email)}`;
const geheim = () => createHmac("sha256", env.AUTH_SECRET).update("voorstel-smileyapp-sessie").digest();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const lid = (a: Account): TeamLid => ({ email: a.email, rol: a.rol, heeftWachtwoord: !!a.wachtwoord, geblokkeerd: !!a.geblokkeerd });

export function publiek(a: Account): PubliekAccount {
  return {
    email: a.email,
    naam: a.naam,
    rol: a.rol,
    status: accountStatus(lid(a)),
    aangemaakt: a.aangemaakt,
    ...(a.uitgenodigdDoor ? { uitgenodigdDoor: a.uitgenodigdDoor } : {}),
    ...(a.laatstIngelogd ? { laatstIngelogd: a.laatstIngelogd } : {}),
    ...(a.uitnodiging && !a.wachtwoord ? { uitnodigingTot: a.uitnodiging.tot } : {}),
  };
}

async function hashWachtwoord(wachtwoord: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scryptAsync(wachtwoord, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

async function klopt(wachtwoord: string, opgeslagen: string | undefined): Promise<boolean> {
  const [soort, saltHex, hashHex] = (opgeslagen ?? "").split("$");
  if (soort !== "scrypt" || !saltHex || !hashHex) {
    // onbekend adres of nog geen wachtwoord: toch rekenen, zodat het antwoord even lang duurt
    await scryptAsync(wachtwoord, Buffer.alloc(16), 64);
    return false;
  }
  const verwacht = Buffer.from(hashHex, "hex");
  const h = await scryptAsync(wachtwoord, Buffer.from(saltHex, "hex"), verwacht.length);
  return timingSafeEqual(h, verwacht);
}

/**
 * Het sessietoken: e-mail, het moment waarop het account is gemaakt (een nieuw account op hetzelfde adres erft geen
 * oude sessie), de vervaldatum en, zodra er ooit een nieuw wachtwoord is gekozen via "wachtwoord vergeten", de
 * sessieversie van dat moment (een sessie van vóór het nieuwe wachtwoord geldt dan niet meer).
 */
export function tekenSessie(a: Pick<Account, "email" | "aangemaakt"> & { sessieVersie?: number | undefined }, nu = Date.now()): string {
  const inhoud = Buffer.from(JSON.stringify({ e: a.email, a: a.aangemaakt, x: nu + SESSIE_DAGEN * 86_400_000, ...(a.sessieVersie ? { v: a.sessieVersie } : {}) })).toString("base64url");
  return `${inhoud}.${createHmac("sha256", geheim()).update(inhoud).digest("base64url")}`;
}

export function leesSessie(token: string | undefined, nu = Date.now()): { email: string; aangemaakt: string; versie?: number } | null {
  if (!token) return null;
  const [inhoud, handtekening] = token.split(".");
  if (!inhoud || !handtekening) return null;
  const verwacht = createHmac("sha256", geheim()).update(inhoud).digest();
  const gekregen = Buffer.from(handtekening, "base64url");
  if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) return null;
  try {
    const { e, a, x, v } = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as { e?: unknown; a?: unknown; x?: unknown; v?: unknown };
    if (typeof e !== "string" || typeof a !== "string" || typeof x !== "number" || x <= nu) return null;
    return { email: e, aangemaakt: a, ...(typeof v === "number" && v > 0 ? { versie: v } : {}) };
  } catch {
    return null;
  }
}

async function zetSessie(a: Account): Promise<void> {
  (await cookies()).set(SESSIE_COOKIE, tekenSessie(a), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSIE_DAGEN * 86_400 });
}

export async function uitloggen(): Promise<void> {
  (await cookies()).delete(SESSIE_COOKIE);
}

export async function huidigAccount(): Promise<PubliekAccount | null> {
  const sessie = leesSessie((await cookies()).get(SESSIE_COOKIE)?.value);
  if (!sessie) return null;
  const a = await kvGet<Account>(sleutel(sessie.email)).catch(() => null);
  // geblokkeerd, verwijderd (of opnieuw aangemaakt), nog zonder wachtwoord, of een sessie van vóór een nieuw wachtwoord: geen sessie
  return a && !a.geblokkeerd && a.wachtwoord && a.aangemaakt === sessie.aangemaakt && (a.sessieVersie ?? 0) === (sessie.versie ?? 0) ? publiek(a) : null;
}

/** Wie mag in het beheer: een SmileyApp-account, of een ZekerFlex-platformbeheerder (telt als beheerder). */
export async function toegang(): Promise<Toegang | null> {
  const a = await huidigAccount();
  if (a) return { naam: a.naam, email: a.email, rol: a.rol, via: "smileyapp", id: a.email };
  const p = await getPrincipal().catch(() => null);
  // id: alleen de naam van een limiet-emmer (Redis, verloopt vanzelf), geen KV-sleutel
  return p && hasRole(p, "PLATFORM_ADMIN") ? { naam: p.fullName || "ZekerFlex-beheer", email: "", rol: "beheerder", via: "zekerflex", id: `zekerflex-${p.userId}` } : null;
}

/** Niet ingelogd = 401 (geen 403: CrowdSec telt een reeks 403's als inbraakpoging). */
export async function eisToegang(): Promise<Toegang> {
  const t = await toegang();
  if (!t) throw AppError.unauthenticated("Log eerst in.");
  return t;
}

/** Ingelogd maar geen beheerder = 423 met de code ALLEEN_BEHEERDER. */
export async function eisBeheerder(): Promise<Toegang> {
  const t = await eisToegang();
  if (t.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan het team beheren.");
  return t;
}

async function alle(): Promise<Account[]> {
  return kvListValues<Account>(PREFIX, 500);
}

export async function alleAccounts(): Promise<PubliekAccount[]> {
  return (await alle()).map(publiek).sort((x, y) => x.naam.localeCompare(y.naam, "nl"));
}

/** Is er iemand die kan inloggen en dus de chat kan lezen? Bij een storing: nee (de chat belooft dan geen medewerker). */
export async function heeftTeam(): Promise<boolean> {
  return (await alle().catch(() => [])).some((a) => !!a.wachtwoord && !a.geblokkeerd);
}

/** De adressen die een melding krijgen: beheerders met een wachtwoord die niet geblokkeerd zijn. */
export async function beheerderAdressen(): Promise<string[]> {
  return (await alle()).filter((a) => a.rol === "beheerder" && !!a.wachtwoord && !a.geblokkeerd).map((a) => a.email);
}

/**
 * Maakt of ververst een uitnodiging en stuurt de mail. Een nieuwe uitnodiging
 * maakt de vorige ongeldig (er is maar één hash). Wie al een wachtwoord heeft,
 * krijgt geen nieuwe: dan zou een beheerder iemands account kunnen overnemen.
 * `beheer` is het adres van het beheer voor de link (beheerAdres()).
 */
export async function nodigUit(o: { naam: string; email: string; rol: Rol; door: string; beheer: string }, nu = new Date()): Promise<{ account: PubliekAccount; verstuurd: boolean }> {
  if (!geldigeNaam(o.naam)) throw AppError.validation("Vul een naam in van 2 tot 80 tekens.");
  if (!geldigEmail(o.email)) throw AppError.validation("Vul een geldig e-mailadres in.");
  const email = normEmail(o.email);
  const bestaand = await kvGet<Account>(sleutel(email));
  if (bestaand?.wachtwoord) throw AppError.validation(`${bestaand.naam} heeft al een account.`);
  if (bestaand?.geblokkeerd) throw AppError.validation(`${bestaand.naam} is geblokkeerd. Deblokkeer het account eerst.`);
  const token = randomBytes(32).toString("base64url");
  const account: Account = {
    email,
    naam: o.naam.trim(),
    rol: o.rol,
    uitnodiging: { hash: hashToken(token), tot: uitnodigingTot(nu) },
    uitgenodigdDoor: o.door,
    aangemaakt: bestaand?.aangemaakt ?? nu.toISOString(),
  };
  await kvSet(sleutel(email), account);
  const verstuurd = await stuurUitnodiging({ naam: account.naam, email, door: o.door, link: `${o.beheer}?uitnodiging=${encodeURIComponent(token)}` });
  return { account: publiek(account), verstuurd };
}

/** Het account dat bij dit token hoort, als de uitnodiging nog geldt. Vergelijkt de hash in constante tijd. */
async function accountBijToken(token: string, nu: Date): Promise<Account | null> {
  if (!isUitnodigingToken(token)) return null;
  const gekregen = Buffer.from(hashToken(token), "hex");
  let gevonden: Account | null = null;
  for (const a of await alle()) {
    if (!a.uitnodiging || a.wachtwoord || a.geblokkeerd) continue;
    const verwacht = Buffer.from(a.uitnodiging.hash, "hex");
    if (verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen) && !uitnodigingVerlopen(a.uitnodiging.tot, nu)) gevonden = a;
  }
  return gevonden;
}

/** Voor de kaart "Kies een wachtwoord": naam en adres, of null als de link niet (meer) werkt. */
export async function bekijkUitnodiging(token: string, nu = new Date()): Promise<{ naam: string; email: string } | null> {
  const a = await accountBijToken(token, nu).catch(() => null);
  return a ? { naam: a.naam, email: a.email } : null;
}

/** Wachtwoord kiezen met de link uit de mail: de uitnodiging vervalt en je bent ingelogd. */
export async function neemUitnodigingAan(o: { token: string; wachtwoord: string }, nu = new Date()): Promise<PubliekAccount> {
  const fout = wachtwoordFout(o.wachtwoord);
  if (fout) throw AppError.validation(fout);
  const a = await accountBijToken(o.token, nu);
  if (!a) throw AppError.validation("Deze link werkt niet meer. Vraag een nieuwe uitnodiging.");
  const { uitnodiging: _weg, ...rest } = a;
  const bij: Account = { ...rest, wachtwoord: await hashWachtwoord(o.wachtwoord), laatstIngelogd: nu.toISOString() };
  await kvSet(sleutel(a.email), bij);
  await zetSessie(bij);
  return publiek(bij);
}

// --- wachtwoord vergeten ---------------------------------------------------------

/**
 * Maakt een herstellink en stuurt de mail, alleen voor een account dat kan inloggen (wachtwoord gekozen, niet
 * geblokkeerd). Een nieuwe aanvraag maakt de vorige link ongeldig (er is maar één hash). Geeft terug wat er
 * gebeurde; het openbare scherm laat dat nooit zien (dat zegt altijd hetzelfde), het beheer wel.
 */
export async function vraagHerstel(emailRuw: string, beheer: string, nu = new Date()): Promise<"verstuurd" | "niet-afgeleverd" | "geen"> {
  if (!geldigEmail(emailRuw)) return "geen";
  const a = await kvGet<Account>(sleutel(emailRuw));
  if (!a || !a.wachtwoord || a.geblokkeerd) return "geen";
  const token = randomBytes(32).toString("base64url");
  await kvSet(sleutel(a.email), { ...a, herstel: { hash: hashToken(token), tot: herstelTot(nu) } } satisfies Account);
  return (await stuurHerstel({ naam: a.naam, email: a.email, link: `${beheer}?herstel=${encodeURIComponent(token)}` })) ? "verstuurd" : "niet-afgeleverd";
}

/** Het account dat bij deze herstellink hoort, als hij nog geldt. Vergelijkt de hash in constante tijd. */
async function accountBijHerstel(token: string, nu: Date): Promise<Account | null> {
  if (!isUitnodigingToken(token)) return null;
  const gekregen = Buffer.from(hashToken(token), "hex");
  let gevonden: Account | null = null;
  for (const a of await alle()) {
    if (!a.herstel || !a.wachtwoord || a.geblokkeerd) continue;
    const verwacht = Buffer.from(a.herstel.hash, "hex");
    if (verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen) && !uitnodigingVerlopen(a.herstel.tot, nu)) gevonden = a;
  }
  return gevonden;
}

/** Voor de kaart "Kies een nieuw wachtwoord": naam en adres, of null als de link niet (meer) werkt. */
export async function bekijkHerstel(token: string, nu = new Date()): Promise<{ naam: string; email: string } | null> {
  const a = await accountBijHerstel(token, nu).catch(() => null);
  return a ? { naam: a.naam, email: a.email } : null;
}

/** Een nieuw wachtwoord kiezen met de link uit de mail: de link vervalt, alle oude sessies ook, en je bent ingelogd. */
export async function kiesNieuwWachtwoord(o: { token: string; wachtwoord: string }, nu = new Date()): Promise<PubliekAccount> {
  const fout = wachtwoordFout(o.wachtwoord);
  if (fout) throw AppError.validation(fout);
  const a = await accountBijHerstel(o.token, nu);
  if (!a) throw AppError.validation("Deze link werkt niet meer. Vraag een nieuwe aan via 'Wachtwoord vergeten?'.");
  const { herstel: _weg, ...rest } = a;
  const bij: Account = { ...rest, wachtwoord: await hashWachtwoord(o.wachtwoord), sessieVersie: (a.sessieVersie ?? 0) + 1, laatstIngelogd: nu.toISOString() };
  await kvSet(sleutel(a.email), bij);
  await zetSessie(bij);
  return publiek(bij);
}

export async function inloggen(emailRuw: string, wachtwoord: string, nu = new Date()): Promise<PubliekAccount> {
  const a = await kvGet<Account>(sleutel(emailRuw));
  // zelfde melding bij een onbekend adres, een account zonder wachtwoord en een fout wachtwoord
  if (!(await klopt(wachtwoord, a?.wachtwoord)) || !a) throw AppError.validation("E-mailadres of wachtwoord klopt niet.");
  if (a.geblokkeerd) throw AppError.validation("Dit account is geblokkeerd. Vraag een beheerder van SmileyApp om hulp.");
  const bij: Account = { ...a, laatstIngelogd: nu.toISOString() };
  await kvSet(sleutel(a.email), bij);
  await zetSessie(bij);
  return publiek(bij);
}

// --- team beheren (alleen een beheerder; de regels staan in smileyapp-account-regels.ts) ---

async function metRegel(ik: Toegang, email: string, actie: TeamActie): Promise<Account> {
  const team = await alle();
  const fout = teamActieFout({ email: ik.email, rol: ik.rol }, email, actie, team.map(lid));
  if (fout) throw ik.rol === "beheerder" ? AppError.validation(fout) : AppError.alleenBeheerder(fout);
  const a = team.find((t) => t.email === normEmail(email));
  if (!a) throw AppError.notFound("Dit account bestaat niet (meer).");
  return a;
}

export async function wijzigRol(ik: Toegang, email: string, rol: Rol): Promise<PubliekAccount> {
  const a = await metRegel(ik, email, { soort: "rol", rol });
  const bij: Account = { ...a, rol };
  await kvSet(sleutel(a.email), bij);
  return publiek(bij);
}

export async function blokkeer(ik: Toegang, email: string, geblokkeerd: boolean): Promise<PubliekAccount> {
  const a = await metRegel(ik, email, { soort: "blokkeren", geblokkeerd });
  const { geblokkeerd: _weg, ...rest } = a;
  const bij: Account = geblokkeerd ? { ...rest, geblokkeerd: true } : rest;
  await kvSet(sleutel(a.email), bij);
  return publiek(bij);
}

export async function verwijderAccount(ik: Toegang, email: string): Promise<void> {
  const a = await metRegel(ik, email, { soort: "verwijderen" });
  await kvDelete(sleutel(a.email));
}
