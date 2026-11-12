import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { fixedWindow } from "@/lib/rate-limit";
import { PasskeyFout } from "@/lib/auth/passkey/fout";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import type { MailTaal } from "@/lib/mail/vorm";
import { mailTijdstip, passkeyCodeMailT, passkeyMeldingMailT } from "@/lib/mail/werker/passkey";

// ---------------------------------------------------------------------------
// Mail rond passkeys.
//
// 1. Een code per mail om een passkey toe te voegen aan een account zonder
//    wachtwoord (alleen Google): zonder wachtwoord is er anders niets dan de
//    sessie, en een gestolen sessiecookie mag nooit een eigen passkey kunnen
//    toevoegen. Zelfde regels als de bevestiging van een IBAN-wijziging
//    (lib/fiscal/iban-bevestiging.ts): 6 cijfers, 15 minuten geldig, hooguit 5
//    pogingen, eenmalig, alleen een HMAC in de KV (`passkey-toevoegen:<userId>`,
//    wisbaar volgens AVG), hooguit 3 codes per uur.
// 2. Altijd een melding naar het bekende adres als er een passkey bij komt of
//    weggaat, met toestelnaam en tijd. Die melding mag het toevoegen of
//    verwijderen niet laten mislukken: een fout wordt gelogd, verder niets.
//    Ook na een wachtwoordherstel (alle passkeys weg) en bij het aanzetten van
//    tweestapsverificatie (passkeys blijven, de gebruiker ziet welke).
//    Testadressen (.test/.example/.invalid) houdt sendMail zelf in de eigen
//    postbus; er gaat hier niets naar een intern adres.
//
// Fouten als 423/429/503 met een eigen code (nooit 403: CrowdSec).
// ---------------------------------------------------------------------------

const TTL_MS = 15 * 60_000;
const MAX_POGINGEN = 5;
const MAX_CODES_PER_UUR = 3;

const sleutel = (userId: string) => `passkey-toevoegen:${userId}`;

interface Wachtend {
  codeHmac: string;
  expiresAt: number;
  pogingen: number;
}

function hmac(userId: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`passkey-toevoegen|${userId}|${code}`).digest("hex");
}

function gelijk(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const voornaam = (fullName: string) => fullName.split(" ")[0] || fullName;

/** Stuur een nieuwe code naar het bekende adres. Gooit altijd: 423 (code gestuurd, vul hem in), 429 of 503. */
export async function stuurPasskeyMailcode(userId: string, now = Date.now()): Promise<never> {
  const gate = await fixedWindow(`passkey-toevoegen:rl:mail:${userId}`, MAX_CODES_PER_UUR, 60 * 60);
  if (!gate.ok) throw new PasskeyFout("TE_VAAK", "Je hebt al een aantal codes aangevraagd. Probeer het over een uur opnieuw.", 429);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } });
  if (!user) throw new PasskeyFout("PASSKEY_MAIL_MISLUKT", "We kunnen je geen code sturen. Neem contact op met de klantenservice.", 503);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rec: Wachtend = { codeHmac: hmac(userId, code), expiresAt: now + TTL_MS, pogingen: 0 };
  await kvSet(sleutel(userId), rec);

  const taal = await mailTaalVoorWerker(userId);
  const { subject, text } = passkeyCodeMailT(voornaam(user.fullName), code, taal);
  const res = await sendMail({ to: user.email, subject, kind: "passkey-code", text }).catch(() => null);
  if (!res?.delivered) {
    await kvDelete(sleutel(userId));
    throw new PasskeyFout("PASSKEY_MAIL_MISLUKT", "De code kon niet worden verstuurd. Probeer het later opnieuw.", 503);
  }
  throw new PasskeyFout("PASSKEY_MAILCODE_GESTUURD", "We hebben een code naar je e-mailadres gestuurd. Vul die in om de passkey toe te voegen.", 423);
}

/** Klopt de code uit de mail? Eenmalig: bij succes is hij weg. Gooit een PasskeyFout (423) als het niet klopt. */
export async function controleerPasskeyMailcode(userId: string, code: string, now = Date.now()): Promise<void> {
  const schoon = code.trim();
  const rec = await kvGet<Wachtend>(sleutel(userId));
  if (!rec || rec.expiresAt < now) {
    throw new PasskeyFout("PASSKEY_MAILCODE_VERLOPEN", "Er is geen geldige code (meer). Vraag een nieuwe code aan.", 423);
  }
  if (rec.pogingen >= MAX_POGINGEN) {
    await kvDelete(sleutel(userId));
    throw new PasskeyFout("PASSKEY_MAILCODE_VERLOPEN", "Te veel foute pogingen. Vraag een nieuwe code aan.", 423);
  }
  if (!/^\d{6}$/.test(schoon) || !gelijk(rec.codeHmac, hmac(userId, schoon))) {
    await kvSet(sleutel(userId), { ...rec, pogingen: rec.pogingen + 1 });
    throw new PasskeyFout("PASSKEY_MAILCODE_ONGELDIG", "Die code klopt niet.", 423);
  }
  await kvDelete(sleutel(userId)); // eenmalig
}

/** "9 november 2026 om 15:04" in Nederlandse tijd (de server draait in UTC). */
export function nlTijdstip(d: Date): string {
  return mailTijdstip(d, "nl");
}

/** Waar beheert deze gebruiker zijn passkeys? Een werker in zijn app, anders in de werkgeversomgeving. */
export function passkeyAccountPad(rollen: readonly string[]): string {
  return rollen.includes("FREELANCER") ? "/dashboard/account/passkeys" : "/werkgever/account";
}

export interface PasskeyMelding {
  /** toegevoegd/verwijderd: één toestel; herstel/tweestaps: de namen achter elkaar */
  wat: "toegevoegd" | "verwijderd" | "herstel" | "tweestaps";
  email: string;
  fullName: string;
  toestel: string;
  rollen: readonly string[];
  tijdstip: Date;
}

/** Onderwerp en tekst van de melding (puur, voor de test). Standaard Nederlands; een werker krijgt zijn app-taal. */
export function passkeyMeldingMail(m: PasskeyMelding, basis: string, taal: MailTaal = "nl"): { subject: string; text: string } {
  const schoon = basis.replace(/\/+$/, "");
  return passkeyMeldingMailT(
    { wat: m.wat, voornaam: voornaam(m.fullName), toestel: m.toestel, wanneer: mailTijdstip(m.tijdstip, taal), link: `${schoon}${passkeyAccountPad(m.rollen)}`, basis: schoon },
    taal,
  );
}

async function taalVoorAdres(email: string): Promise<MailTaal> {
  try {
    const lid = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return lid ? await mailTaalVoorWerker(lid.id) : "nl";
  } catch {
    return "nl";
  }
}

/** Stuur de melding; een fout wordt gelogd en verder genegeerd (het toevoegen of verwijderen is al gebeurd). */
export async function meldPasskeyWijziging(m: PasskeyMelding): Promise<void> {
  try {
    // alleen een werker (uitsluitend FREELANCER) krijgt de melding in zijn app-taal; het adres is uniek
    const werker = m.rollen.length > 0 && m.rollen.every((r) => r === "FREELANCER");
    // een storing in de opzoeking geeft Nederlands: de melding mag nooit wegblijven
    const taal = werker ? await taalVoorAdres(m.email) : "nl";
    const { subject, text } = passkeyMeldingMail(m, env.APP_BASE_URL, taal);
    const res = await sendMail({ to: m.email, subject, text, kind: `passkey-${m.wat}` });
    if (!res.delivered) logger.warn("passkey: melding niet bezorgd", { wat: m.wat, error: res.error });
  } catch (err) {
    logger.warn("passkey: melding versturen mislukt", { wat: m.wat, error: (err as Error).message });
  }
}
