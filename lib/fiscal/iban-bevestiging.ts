import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { fixedWindow } from "@/lib/rate-limit";
import { hasTwoFactor, verifySecondFactor } from "@/lib/auth/two-factor";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { ibanCodeMailT } from "@/lib/mail/werker/iban-code";

// ---------------------------------------------------------------------------
// Een ander rekeningnummer voor uitbetalingen vraagt een tweede bewijs: een
// gekaapte sessie mag uitbetalingen niet kunnen omleiden. Heeft de werker
// tweestapsverificatie, dan telt een geldige code uit de app (of een
// herstelcode). Anders sturen we een eenmalige code naar het bekende
// e-mailadres. De code is willekeurig, 15 minuten geldig, gebonden aan het
// nieuwe IBAN en wordt maar eenmaal geaccepteerd. Alleen een HMAC van de code
// staat in de KV (sleutel `iban-wijziging:<userId>`, wisbaar volgens AVG).
//
// Fouten gaan als 423 met een eigen `code` (nooit 403: CrowdSec).
// ---------------------------------------------------------------------------

const TTL_MS = 15 * 60_000;
const MAX_POGINGEN = 5;

const key = (userId: string) => `iban-wijziging:${userId}`;

interface Wachtend {
  iban: string;
  codeHmac: string;
  expiresAt: number;
  pogingen: number;
}

export type IbanBevestiging =
  | { ok: true }
  | { ok: false; status: 423 | 429 | 503; code: string; message: string };

const nee = (status: 423 | 429 | 503, code: string, message: string): IbanBevestiging => ({ ok: false, status, code, message });

function hmac(userId: string, iban: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`iban-wijziging|${userId}|${iban}|${code}`).digest("hex");
}

function gelijk(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Laatste vier tekens, zodat de mail het nieuwe rekeningnummer herkenbaar maar niet volledig toont. */
function gemaskeerd(iban: string): string {
  return `…${iban.slice(-4)}`;
}

export async function bevestigIbanWijziging(
  userId: string,
  nieuwIban: string,
  code: string | undefined,
  now = Date.now(),
): Promise<IbanBevestiging> {
  const schoon = code?.trim();

  if (await hasTwoFactor(userId)) {
    if (!schoon) {
      return nee(423, "IBAN_2FA_NODIG", "Vul je code uit de verificatie-app in om je rekeningnummer te wijzigen.");
    }
    const gate = await fixedWindow(`iban-wijziging:rl:2fa:${userId}`, 5, 15 * 60);
    if (!gate.ok) return nee(429, "IBAN_TE_VEEL_POGINGEN", "Te veel pogingen. Probeer het over een kwartier opnieuw.");
    if (!(await verifySecondFactor(userId, schoon)).ok) {
      return nee(423, "IBAN_CODE_ONGELDIG", "Deze code klopt niet of is al gebruikt.");
    }
    await auditWijziging(userId, nieuwIban, "2fa");
    return { ok: true };
  }

  if (!schoon) return stuurCode(userId, nieuwIban, now);

  const rec = await kvGet<Wachtend>(key(userId));
  if (!rec || rec.iban !== nieuwIban || rec.expiresAt < now) {
    return nee(423, "IBAN_CODE_VERLOPEN", "Er is geen geldige code voor dit rekeningnummer. Vraag een nieuwe code aan.");
  }
  if (rec.pogingen >= MAX_POGINGEN) {
    await kvDelete(key(userId));
    return nee(423, "IBAN_CODE_VERLOPEN", "Te veel foute pogingen. Vraag een nieuwe code aan.");
  }
  if (!gelijk(rec.codeHmac, hmac(userId, nieuwIban, schoon))) {
    await kvSet(key(userId), { ...rec, pogingen: rec.pogingen + 1 });
    return nee(423, "IBAN_CODE_ONGELDIG", "Deze code klopt niet.");
  }
  await kvDelete(key(userId)); // eenmalig
  await auditWijziging(userId, nieuwIban, "mail");
  return { ok: true };
}

async function stuurCode(userId: string, nieuwIban: string, now: number): Promise<IbanBevestiging> {
  const gate = await fixedWindow(`iban-wijziging:rl:mail:${userId}`, 3, 60 * 60);
  if (!gate.ok) return nee(429, "IBAN_TE_VEEL_POGINGEN", "Je hebt al een aantal codes aangevraagd. Probeer het over een uur opnieuw.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } });
  if (!user) return nee(423, "IBAN_GEEN_MAIL", "We kunnen je geen code sturen. Neem contact op met de klantenservice.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rec: Wachtend = { iban: nieuwIban, codeHmac: hmac(userId, nieuwIban, code), expiresAt: now + TTL_MS, pogingen: 0 };
  await kvSet(key(userId), rec);

  const first = user.fullName.split(" ")[0] || user.fullName;
  const taal = await mailTaalVoorWerker(userId);
  const { subject, text } = ibanCodeMailT(first, gemaskeerd(nieuwIban), code, taal);
  const res = await sendMail({ to: user.email, subject, kind: "iban-wijziging-code", text }).catch(() => null);
  if (!res?.delivered) {
    await kvDelete(key(userId));
    return nee(503, "IBAN_MAIL_MISLUKT", "De code kon niet worden verstuurd. Probeer het later opnieuw.");
  }
  return nee(423, "IBAN_BEVESTIGING_NODIG", `We hebben een code gestuurd naar je e-mailadres. Vul die in om je nieuwe rekeningnummer ${gemaskeerd(nieuwIban)} te bevestigen.`);
}

async function auditWijziging(userId: string, iban: string, via: "2fa" | "mail"): Promise<void> {
  await recordAudit({
    category: "SECURITY",
    action: "fiscal.iban.change_confirmed",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Nieuw rekeningnummer ${gemaskeerd(iban)} bevestigd (${via === "2fa" ? "tweestapsverificatie" : "code per e-mail"})`,
    targetType: "user",
    targetId: userId,
  }).catch(() => undefined);
}

/** Een ontbrekende of foute bevestiging, vanuit diepere code (onboarding) naar de route; nooit 403 (CrowdSec). */
export class IbanBevestigingFout extends Error {
  constructor(
    readonly status: 423 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IbanBevestigingFout";
  }
}

/**
 * Gedeelde poort voor elke schrijfroute: alleen het WIJZIGEN van een bestaand
 * IBAN vraagt een bevestiging; een eerste IBAN en een ongewijzigd IBAN blijven
 * vrij. `nieuwIban` en `bestaandIban` zijn al genormaliseerd (hoofdletters,
 * zonder spaties). Gooit IbanBevestigingFout bij weigering.
 */
export async function eisIbanBevestiging(
  userId: string,
  bestaandIban: string | null | undefined,
  nieuwIban: string,
  code: string | undefined,
  now = Date.now(),
): Promise<void> {
  if (!bestaandIban || bestaandIban === nieuwIban) return;
  const r = await bevestigIbanWijziging(userId, nieuwIban, code, now);
  if (!r.ok) throw new IbanBevestigingFout(r.status, r.code, r.message);
}

/** Antwoord in dezelfde vorm als /api/me/fiscal, of null als dit geen IBAN-bevestigingsfout is. */
export function ibanBevestigingAntwoord(
  err: unknown,
): { status: number; body: { error: { code: string; message: string } } } | null {
  if (!(err instanceof IbanBevestigingFout)) return null;
  return { status: err.status, body: { error: { code: err.code, message: err.message } } };
}
