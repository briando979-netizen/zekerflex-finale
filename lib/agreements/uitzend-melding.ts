import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { sendMail } from "@/lib/mail";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { uitzendBijgewerktEmailT } from "@/lib/mail/werker/uitzend-bijgewerkt";
import { UITZEND_NIEUW } from "@/lib/agreements/uitzend-nieuw-teksten";
import { CONTRACTEN_PREFIX, SJABLOON_HUIDIG, sjabloonVan, type UitzendContract } from "@/lib/agreements/uitzend-contract";

// ---------------------------------------------------------------------------
// Uitzendkrachten die alleen nog een geldige overeenkomst in een oudere versie hebben (v1, tot 12 nov 2026), moeten de nieuwe lezen en
// tekenen. Dit telt hoeveel er zijn (droog: alleen aantallen, niets verstuurd) en meldt ze één keer in hun app-taal: EERST een push; bereikt die
// geen enkel apparaat (geen abonnement), dan een mail met een link naar de contractstap op Verificatie. Pas als het echt aankwam wordt de
// werker gemarkeerd (push > 0 of mail bezorgd), met het kanaal en de tijd; mislukt alles, dan niet, zodat de volgende run het opnieuw probeert
// (nooit een tweede poging binnen dezelfde run). Nooit voor een testadres of geblokkeerd account. Hooguit MAX_PER_RUN werkers per run.
// Per werker één keer (KV "uitzend-v2-melding:<userId>", wordt bij wissen van het account ook gewist).
// ---------------------------------------------------------------------------

export const MELDING_PREFIX = "uitzend-v2-melding:";
export const MAX_PER_RUN = 50;

export interface MeldingTelling {
  /** werkers met een nog geldige overeenkomst in een oudere versie en zonder geldige huidige */
  oudeVersie: number;
  /** daarvan: testadres of geblokkeerd account (die krijgen niets) */
  overgeslagen: number;
  /** daarvan: al eerder gemeld */
  alGemeld: number;
  /** nu te melden */
  teMelden: number;
  /** van de te melden: via welk kanaal ze bereikbaar zijn (push-abonnement, anders een bevestigd mailadres, anders niets) */
  perKanaal: { push: number; mail: number; geen: number };
  /** alleen bij versturen: pushes die een apparaat bereikten */
  bereikt: number;
  /** alleen bij versturen: gemarkeerd als gemeld door een push */
  verstuurdPush: number;
  /** alleen bij versturen: gemarkeerd als gemeld door een mail */
  verstuurdMail: number;
  /** alleen bij versturen: werkers die we niet hebben bereikt (mail mislukt of geen kanaal): niet gemarkeerd */
  nietBereikt: number;
  /** alleen bij versturen: gemarkeerd, totaal (push + mail) */
  verstuurd: number;
  /** te melden, maar niet in deze run (limiet per run) */
  overgebleven: number;
}

interface Kandidaat {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
}

export async function meldUitzendBijgewerkt(opts: { verstuur: boolean; nu?: number }): Promise<MeldingTelling> {
  const nu = opts.nu ?? Date.now();
  const uit: MeldingTelling = {
    oudeVersie: 0,
    overgeslagen: 0,
    alGemeld: 0,
    teMelden: 0,
    perKanaal: { push: 0, mail: 0, geen: 0 },
    bereikt: 0,
    verstuurdPush: 0,
    verstuurdMail: 0,
    nietBereikt: 0,
    verstuurd: 0,
    overgebleven: 0,
  };
  const rijen = await kvListEntries<UitzendContract[]>(CONTRACTEN_PREFIX, 5000);
  const kandidaten: string[] = [];
  for (const r of rijen) {
    const lijst = Array.isArray(r.value) ? r.value : [];
    const geldig = lijst.filter((c) => new Date(c.validUntil).getTime() > nu);
    if (geldig.length === 0 || geldig.some((c) => sjabloonVan(c) === SJABLOON_HUIDIG)) continue;
    if (!geldig.some((c) => sjabloonVan(c) < SJABLOON_HUIDIG)) continue;
    kandidaten.push(r.key.slice(CONTRACTEN_PREFIX.length));
  }
  uit.oudeVersie = kandidaten.length;
  if (kandidaten.length === 0) return uit;

  const gebruikers = await prisma.user.findMany({
    where: { id: { in: kandidaten } },
    select: { id: true, email: true, fullName: true, emailVerifiedAt: true, disabledAt: true },
  });
  const geschikt = new Map<string, Kandidaat>(
    gebruikers.filter((u) => !u.disabledAt && !isReservedTestAddress(u.email)).map((u) => [u.id, { id: u.id, email: u.email, fullName: u.fullName, emailVerifiedAt: u.emailVerifiedAt }]),
  );

  const teDoen: Kandidaat[] = [];
  for (const id of kandidaten) {
    const k = geschikt.get(id);
    if (!k) {
      uit.overgeslagen += 1;
      continue;
    }
    if (await kvGet(`${MELDING_PREFIX}${id}`)) {
      uit.alGemeld += 1;
      continue;
    }
    teDoen.push(k);
  }
  uit.teMelden = teDoen.length;

  // het kanaal vooraf: een actief web-push-abonnement of een iPhone-app (apparaatcode) = push; anders een bevestigd mailadres = mail; anders niets
  const web = new Set(
    (await prisma.webPushSubscription.findMany({ where: { userId: { in: teDoen.map((k) => k.id) }, disabledAt: null }, select: { userId: true } }))
      .map((s) => s.userId)
      .filter((x): x is string => Boolean(x)),
  );
  const heeftPush = async (id: string): Promise<boolean> => {
    if (web.has(id)) return true;
    const apns = await kvGet<{ tokens?: unknown[] }>(`apns:${id}`).catch(() => null);
    return (apns?.tokens?.length ?? 0) > 0;
  };
  const push = new Map<string, boolean>();
  for (const k of teDoen) {
    const p = await heeftPush(k.id);
    push.set(k.id, p);
    if (p) uit.perKanaal.push += 1;
    else if (k.emailVerifiedAt) uit.perKanaal.mail += 1;
    else uit.perKanaal.geen += 1;
  }
  if (!opts.verstuur) return uit;

  const dezeRun = teDoen.slice(0, MAX_PER_RUN);
  uit.overgebleven = teDoen.length - dezeRun.length;
  for (const k of dezeRun) {
    let bereikt = 0;
    if (push.get(k.id)) {
      try {
        bereikt = await sendLocalizedPush([k.id], (_t, locale) => {
          const tekst = UITZEND_NIEUW[locale];
          return {
            title: tekst.pushTitel,
            body: tekst.pushBody,
            data: { type: "uitzend-bijgewerkt", url: "/dashboard/verificatie#uitzendovereenkomst", tag: "uitzend-v2" },
            ttlSeconds: 3 * 24 * 60 * 60,
          };
        });
      } catch (err) {
        logger.warn("uitzend v2 push mislukt", { error: (err as Error).message });
      }
    }
    if (bereikt > 0) {
      await kvSet(`${MELDING_PREFIX}${k.id}`, { at: new Date(nu).toISOString(), kanaal: "push", bereikt });
      uit.bereikt += bereikt;
      uit.verstuurdPush += 1;
      uit.verstuurd += 1;
      continue;
    }
    // geen apparaat bereikt: een mail in de mailtaal van de werker, met de link naar Verificatie (geen bijlage, geen contracttekst)
    if (!k.emailVerifiedAt) {
      uit.nietBereikt += 1;
      continue;
    }
    try {
      const taal = await mailTaalVoorWerker(k.id);
      const res = await sendMail({ ...uitzendBijgewerktEmailT(k.fullName, env.APP_BASE_URL, taal), to: k.email });
      if (res.delivered) {
        await kvSet(`${MELDING_PREFIX}${k.id}`, { at: new Date(nu).toISOString(), kanaal: "mail" });
        uit.verstuurdMail += 1;
        uit.verstuurd += 1;
      } else {
        uit.nietBereikt += 1;
      }
    } catch (err) {
      logger.warn("uitzend v2 mail mislukt", { error: (err as Error).message });
      uit.nietBereikt += 1;
    }
  }
  return uit;
}
