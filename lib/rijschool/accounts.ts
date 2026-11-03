import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import type { Rijschool, RijschoolInstructeur, RijschoolLeerling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getPrincipal, hasRole } from "@/lib/auth";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";

// ---------------------------------------------------------------------------
// Accounts van leerlingen en instructeurs van een rijschool. Bewust los van de
// ZekerFlex-gebruikers: een leerling wordt geen ZekerFlex-gebruiker. Wachtwoord
// met scrypt, sessie in een ondertekend httpOnly-cookie (sleutel afgeleid van
// AUTH_SECRET). Een account krijgt een wachtwoord via een uitnodigingslink die
// de rijschool stuurt; in de database staat alleen de sha256 van die link.
// De eigenaar van de rijschool komt als instructeur binnen met zijn
// ZekerFlex-login, als er een instructeur met zijn e-mailadres bestaat.
// ---------------------------------------------------------------------------

export const SESSIE_COOKIE = "zf_rijles";
const SESSIE_DAGEN = 60;
const UITNODIGING_DAGEN = 14;
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Soort = "leerling" | "instructeur";

interface Sessie {
  rijschoolId: string;
  soort: Soort;
  id: string;
}

const geheim = () => createHmac("sha256", env.AUTH_SECRET).update("rijschool-sessie").digest();
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashWachtwoord(wachtwoord: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scryptAsync(wachtwoord, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

async function klopt(wachtwoord: string, opgeslagen: string | null): Promise<boolean> {
  const [soort, saltHex, hashHex] = (opgeslagen ?? "").split("$");
  if (soort !== "scrypt" || !saltHex || !hashHex) return false;
  const verwacht = Buffer.from(hashHex, "hex");
  const h = await scryptAsync(wachtwoord, Buffer.from(saltHex, "hex"), verwacht.length);
  return timingSafeEqual(h, verwacht);
}

/** Een nieuwe uitnodigingslink: het token gaat in de mail, alleen de hash in de database. */
export function nieuweUitnodiging(nu = new Date()): { token: string; hash: string; tot: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), tot: new Date(nu.getTime() + UITNODIGING_DAGEN * 86_400_000) };
}

function teken(s: Sessie): string {
  const inhoud = Buffer.from(JSON.stringify({ r: s.rijschoolId, s: s.soort, i: s.id, x: Date.now() + SESSIE_DAGEN * 86_400_000 })).toString("base64url");
  return `${inhoud}.${createHmac("sha256", geheim()).update(inhoud).digest("base64url")}`;
}

function leesToken(token: string | undefined): Sessie | null {
  if (!token) return null;
  const [inhoud, handtekening] = token.split(".");
  if (!inhoud || !handtekening) return null;
  const verwacht = createHmac("sha256", geheim()).update(inhoud).digest();
  const gekregen = Buffer.from(handtekening, "base64url");
  if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) return null;
  try {
    const { r, s, i, x } = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as Record<string, unknown>;
    if (typeof r !== "string" || typeof i !== "string" || typeof x !== "number" || x <= Date.now()) return null;
    return s === "leerling" || s === "instructeur" ? { rijschoolId: r, soort: s, id: i } : null;
  } catch {
    return null;
  }
}

/** Wijzigende verzoeken alleen als JSON en vanaf deze site (geen formulier-post van een andere site). */
export function eisZelfdeHerkomst(request: Request): void {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
  if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website.");
}

async function zetSessie(s: Sessie): Promise<void> {
  (await cookies()).set(SESSIE_COOKIE, teken(s), {
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

async function sessie(rijschoolId: string): Promise<Sessie | null> {
  const s = leesToken((await cookies()).get(SESSIE_COOKIE)?.value);
  return s && s.rijschoolId === rijschoolId ? s : null;
}

export async function huidigeLeerling(r: Pick<Rijschool, "id">): Promise<RijschoolLeerling | null> {
  const s = await sessie(r.id);
  if (s?.soort !== "leerling") return null;
  const l = await prisma.rijschoolLeerling.findFirst({ where: { id: s.id, rijschoolId: r.id } });
  return l && l.status !== "GESTOPT" ? l : null;
}

/** Wie is eigenaar of beheerder van deze rijschool (ZekerFlex-login)? */
export async function isEigenaar(r: Pick<Rijschool, "tenantId">): Promise<{ email: string; naam: string } | null> {
  const p = await getPrincipal().catch(() => null);
  if (!p) return null;
  const eigen = p.grants.some((g) => g.role === "HQ_ADMIN" && g.organizationId === r.tenantId);
  return eigen || hasRole(p, "PLATFORM_ADMIN") ? { email: p.email, naam: p.fullName } : null;
}

export async function huidigeInstructeur(r: Pick<Rijschool, "id" | "tenantId">): Promise<RijschoolInstructeur | null> {
  const s = await sessie(r.id);
  if (s?.soort === "instructeur") {
    const i = await prisma.rijschoolInstructeur.findFirst({ where: { id: s.id, rijschoolId: r.id, actief: true } });
    if (i) return i;
  }
  // de eigenaar die zelf lesgeeft, komt binnen met zijn ZekerFlex-login
  const eigenaar = await isEigenaar(r);
  if (!eigenaar) return null;
  return prisma.rijschoolInstructeur.findFirst({ where: { rijschoolId: r.id, email: eigenaar.email.toLowerCase(), actief: true } });
}

export async function eisLeerling(r: Pick<Rijschool, "id">): Promise<RijschoolLeerling> {
  const l = await huidigeLeerling(r);
  if (!l) throw AppError.unauthenticated("Log opnieuw in.");
  return l;
}

export async function eisInstructeur(r: Pick<Rijschool, "id" | "tenantId">): Promise<RijschoolInstructeur> {
  const i = await huidigeInstructeur(r);
  if (!i) throw AppError.unauthenticated("Log in als instructeur.");
  return i;
}

const ONBEKEND = "E-mailadres of wachtwoord klopt niet.";

export async function inloggen(r: Pick<Rijschool, "id">, soort: Soort, emailRuw: string, wachtwoord: string): Promise<void> {
  const email = emailRuw.trim().toLowerCase();
  const nu = new Date();
  if (soort === "leerling") {
    const l = await prisma.rijschoolLeerling.findUnique({ where: { rijschoolId_email: { rijschoolId: r.id, email } } });
    // zelfde melding bij onbekend adres en fout wachtwoord
    if (!l || !(await klopt(wachtwoord, l.wachtwoordHash))) throw AppError.validation(ONBEKEND);
    if (l.status === "GESTOPT") throw AppError.forbidden("Dit account is gesloten. Neem contact op met je rijschool.");
    await prisma.rijschoolLeerling.update({ where: { id: l.id }, data: { laatstIngelogd: nu } });
    await zetSessie({ rijschoolId: r.id, soort, id: l.id });
    return;
  }
  const i = await prisma.rijschoolInstructeur.findUnique({ where: { rijschoolId_email: { rijschoolId: r.id, email } } });
  if (!i || !(await klopt(wachtwoord, i.wachtwoordHash))) throw AppError.validation(ONBEKEND);
  if (!i.actief) throw AppError.forbidden("Dit account staat uit. Neem contact op met de rijschool.");
  await prisma.rijschoolInstructeur.update({ where: { id: i.id }, data: { laatstIngelogd: nu } });
  await zetSessie({ rijschoolId: r.id, soort, id: i.id });
}

/** Wachtwoord kiezen met de link uit de uitnodiging; logt daarna meteen in. */
export async function wachtwoordMetUitnodiging(r: Pick<Rijschool, "id">, token: string, wachtwoord: string): Promise<Soort> {
  const hash = hashToken(token);
  const nu = new Date();
  const verlopen = AppError.validation("Deze link is verlopen of al gebruikt. Vraag je rijschool om een nieuwe.");
  const nieuw = await hashWachtwoord(wachtwoord);
  const l = await prisma.rijschoolLeerling.findUnique({ where: { uitnodigingHash: hash } });
  if (l) {
    if (l.rijschoolId !== r.id || !l.uitnodigingTot || l.uitnodigingTot < nu) throw verlopen;
    await prisma.rijschoolLeerling.update({
      where: { id: l.id },
      data: { wachtwoordHash: nieuw, uitnodigingHash: null, uitnodigingTot: null, laatstIngelogd: nu, ...(l.status === "AANMELDING" ? { status: "ACTIEF" } : {}) },
    });
    await zetSessie({ rijschoolId: r.id, soort: "leerling", id: l.id });
    return "leerling";
  }
  const i = await prisma.rijschoolInstructeur.findUnique({ where: { uitnodigingHash: hash } });
  if (!i || i.rijschoolId !== r.id || !i.uitnodigingTot || i.uitnodigingTot < nu) throw verlopen;
  await prisma.rijschoolInstructeur.update({
    where: { id: i.id },
    data: { wachtwoordHash: nieuw, uitnodigingHash: null, uitnodigingTot: null, laatstIngelogd: nu },
  });
  await zetSessie({ rijschoolId: r.id, soort: "instructeur", id: i.id });
  return "instructeur";
}
