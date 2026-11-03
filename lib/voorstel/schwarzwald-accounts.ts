import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getPrincipal, hasRole } from "@/lib/auth";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";

// ---------------------------------------------------------------------------
// Accounts van de Schwarzwald-site: klanten (eigen reserveringen) en
// beheerders (de beheeromgeving). Bewust los van de ZekerFlex-gebruikers:
// een gast van Het Schwarzwald wordt geen ZekerFlex-gebruiker. Opslag in de
// KeyValueStore (geen migratie), wachtwoord met scrypt, sessie in een
// ondertekend httpOnly-cookie. ZekerFlex-platformbeheerders mogen altijd in
// het beheer (om de eerste beheerder van Het Schwarzwald aan te wijzen).
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:account:";
export const SESSIE_COOKIE = "schw_sessie";
const SESSIE_DAGEN = 30;
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Rol = "klant" | "beheerder";

export interface Account {
  email: string;
  naam: string;
  telefoon: string;
  rol: Rol;
  geblokkeerd: boolean;
  aangemaakt: string;
  laatstIngelogd?: string;
  hash: string;
}

export type PubliekAccount = Omit<Account, "hash">;

const publiek = ({ hash: _hash, ...rest }: Account): PubliekAccount => rest;
const sleutel = (email: string) => `${PREFIX}${email.trim().toLowerCase()}`;
const geheim = () => createHmac("sha256", env.AUTH_SECRET).update("voorstel-schwarzwald-sessie").digest();

async function hashWachtwoord(wachtwoord: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scryptAsync(wachtwoord, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

async function klopt(wachtwoord: string, opgeslagen: string): Promise<boolean> {
  const [soort, saltHex, hashHex] = opgeslagen.split("$");
  if (soort !== "scrypt" || !saltHex || !hashHex) return false;
  const verwacht = Buffer.from(hashHex, "hex");
  const h = await scryptAsync(wachtwoord, Buffer.from(saltHex, "hex"), verwacht.length);
  return timingSafeEqual(h, verwacht);
}

function teken(email: string): string {
  const inhoud = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSIE_DAGEN * 86_400_000 })).toString("base64url");
  return `${inhoud}.${createHmac("sha256", geheim()).update(inhoud).digest("base64url")}`;
}

function leesToken(token: string | undefined): string | null {
  if (!token) return null;
  const [inhoud, handtekening] = token.split(".");
  if (!inhoud || !handtekening) return null;
  const verwacht = createHmac("sha256", geheim()).update(inhoud).digest();
  const gekregen = Buffer.from(handtekening, "base64url");
  if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as { e?: string; x?: number };
    return typeof e === "string" && typeof x === "number" && x > Date.now() ? e : null;
  } catch {
    return null;
  }
}

/** Wijzigende verzoeken alleen als JSON en vanaf deze site (geen formulier-post van een andere site). */
export function eisZelfdeHerkomst(request: Request): void {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
  if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website.");
}

async function zetSessie(email: string): Promise<void> {
  (await cookies()).set(SESSIE_COOKIE, teken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSIE_DAGEN * 86_400,
  });
}

export async function uitloggen(): Promise<void> {
  (await cookies()).delete(SESSIE_COOKIE);
}

export async function huidigAccount(): Promise<PubliekAccount | null> {
  const email = leesToken((await cookies()).get(SESSIE_COOKIE)?.value);
  if (!email) return null;
  const a = await kvGet<Account>(sleutel(email)).catch(() => null);
  return a && !a.geblokkeerd ? publiek(a) : null;
}

/** Wie mag in het beheer: een Schwarzwald-beheerder of een ZekerFlex-platformbeheerder. */
export async function beheerder(): Promise<{ naam: string } | null> {
  const a = await huidigAccount();
  if (a?.rol === "beheerder") return { naam: a.naam };
  const p = await getPrincipal().catch(() => null);
  return p && hasRole(p, "PLATFORM_ADMIN") ? { naam: p.fullName ?? "ZekerFlex-beheer" } : null;
}

export async function eisBeheerder(): Promise<{ naam: string }> {
  const b = await beheerder();
  if (!b) throw AppError.forbidden("Alleen voor beheerders.");
  return b;
}

export async function registreer(input: { email: string; naam: string; telefoon: string; wachtwoord: string }): Promise<PubliekAccount> {
  const email = input.email.trim().toLowerCase();
  if (await kvGet<Account>(sleutel(email))) throw AppError.validation("Er bestaat al een account met dit e-mailadres. Log in.");
  const account: Account = {
    email,
    naam: input.naam.trim(),
    telefoon: input.telefoon.trim(),
    rol: "klant",
    geblokkeerd: false,
    aangemaakt: new Date().toISOString(),
    laatstIngelogd: new Date().toISOString(),
    hash: await hashWachtwoord(input.wachtwoord),
  };
  await kvSet(sleutel(email), account);
  await zetSessie(email);
  return publiek(account);
}

export async function inloggen(emailRuw: string, wachtwoord: string): Promise<PubliekAccount> {
  const a = await kvGet<Account>(sleutel(emailRuw));
  // zelfde melding bij onbekend adres en fout wachtwoord
  if (!a || !(await klopt(wachtwoord, a.hash))) throw AppError.validation("E-mailadres of wachtwoord klopt niet.");
  if (a.geblokkeerd) throw AppError.forbidden("Dit account is geblokkeerd. Neem contact op met Het Schwarzwald.");
  const bij = { ...a, laatstIngelogd: new Date().toISOString() };
  await kvSet(sleutel(a.email), bij);
  await zetSessie(a.email);
  return publiek(bij);
}

export async function wijzigProfiel(email: string, input: { naam: string; telefoon: string; nieuwWachtwoord?: string | undefined }): Promise<PubliekAccount> {
  const a = await kvGet<Account>(sleutel(email));
  if (!a) throw AppError.notFound("Account niet gevonden.");
  const bij: Account = { ...a, naam: input.naam.trim(), telefoon: input.telefoon.trim() };
  if (input.nieuwWachtwoord) bij.hash = await hashWachtwoord(input.nieuwWachtwoord);
  await kvSet(sleutel(email), bij);
  return publiek(bij);
}

// --- beheer ---------------------------------------------------------------

export async function alleAccounts(): Promise<PubliekAccount[]> {
  return (await kvListValues<Account>(PREFIX, 5000)).map(publiek).sort((x, y) => y.aangemaakt.localeCompare(x.aangemaakt));
}

export async function beheerAccount(email: string, wijziging: { rol?: Rol | undefined; geblokkeerd?: boolean | undefined }): Promise<PubliekAccount> {
  const a = await kvGet<Account>(sleutel(email));
  if (!a) throw AppError.notFound("Account niet gevonden.");
  const bij: Account = { ...a, ...(wijziging.rol ? { rol: wijziging.rol } : {}), ...(wijziging.geblokkeerd !== undefined ? { geblokkeerd: wijziging.geblokkeerd } : {}) };
  await kvSet(sleutel(email), bij);
  return publiek(bij);
}

export async function verwijderAccount(email: string): Promise<void> {
  await kvDelete(sleutel(email));
}
