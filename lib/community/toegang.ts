import { hasRole, type Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { accountTeNieuw, GRENZEN } from "@/lib/community/regels";
import { leesInstelling, uitsluitingVan } from "@/lib/community/store";

// ---------------------------------------------------------------------------
// Wie mag schrijven in de community. Lezen en melden kan iedereen; een onderwerp starten, reageren, een foto uploaden en
// "Handig" geven alleen met een gratis account, werker én bedrijf. Niet: een account van minder dan 10 minuten oud (tegen
// spam), een account zonder bevestigd e-mailadres, iemand die beheer uitsloot, of als beheer nieuwe berichten tijdelijk
// dichtzette (het ZekerFlex-team zelf mag dan wel). Altijd 423 met een eigen code, nooit 403 (CrowdSec, AGENTS.md).
// ---------------------------------------------------------------------------

export type SchrijfStatus = { kan: true } | { kan: false; reden: string };

export const UITGESLOTEN_TEKST =
  "Je kunt op dit moment niet meedoen in de community: beheer heeft je account uitgesloten. Denk je dat dit niet klopt? Mail support@zekerflex.com.";
export const DICHT_TEKST = "Nieuwe berichten staan even dicht in de community. Lezen kan gewoon; probeer het later nog eens.";
export const NIEUW_TEKST = `Welkom! Je account is net gemaakt. Over ${GRENZEN.accountMinuten} minuten kun je meedoen in de community.`;
export const BEVESTIG_TEKST = "Bevestig eerst je e-mailadres (kijk in je mail), dan kun je meedoen in de community.";

/** Zelfde controle als magSchrijven, maar zonder te gooien: voor de pagina, die dan een uitleg toont in plaats van het formulier. */
export async function schrijfStatus(p: Principal, nu = new Date()): Promise<SchrijfStatus> {
  const team = hasRole(p, "PLATFORM_ADMIN");
  const [instelling, uitsluiting, gebruiker] = await Promise.all([
    leesInstelling(),
    uitsluitingVan(p.userId).catch(() => null),
    prisma.user.findUnique({ where: { id: p.userId }, select: { createdAt: true } }),
  ]);
  if (uitsluiting) return { kan: false, reden: UITGESLOTEN_TEKST };
  if (instelling.schrijvenDicht && !team) return { kan: false, reden: DICHT_TEKST };
  if (!team && !p.emailVerifiedAt) return { kan: false, reden: BEVESTIG_TEKST };
  if (!team && gebruiker && accountTeNieuw(gebruiker.createdAt, nu)) return { kan: false, reden: NIEUW_TEKST };
  return { kan: true };
}

/** Gooit een 423 met een eigen code als deze persoon nu niet mag schrijven. */
export async function magSchrijven(p: Principal, nu = new Date()): Promise<void> {
  const s = await schrijfStatus(p, nu);
  if (s.kan) return;
  if (s.reden === UITGESLOTEN_TEKST) throw AppError.communityUitgesloten(s.reden);
  if (s.reden === DICHT_TEKST) throw AppError.communityDicht(s.reden);
  throw AppError.communityWacht(s.reden);
}
