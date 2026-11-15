import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendMail } from "@/lib/mail";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { branchesMeldingEmailT } from "@/lib/mail/werker/branches-melding";
import { BRANCHES_MELDING } from "@/lib/onboarding/branches-melding-teksten";
import { herinneringHref } from "@/lib/onboarding/herinnering-teksten";
import { BRANCHE_STAP_SINDS } from "@/lib/onboarding/werker-poort";
import { getBrancheKeuze } from "@/lib/worker/branche-store";

// ---------------------------------------------------------------------------
// Werkers die zich tussen 6 en 9 november aanmeldden (de stap "branches" bestaat sinds 10 november) en nog geen branches kozen, krijgen één
// keer "Kies je branches voor klussen die bij je passen" in hun app-taal (eigenaar, 15 nov 2026: "ja"; zonder de zin "dan kun je weer reageren": accounts van vóór 10 nov tellen als "alle branches" en staan niet stil, lib/onboarding/werker-poort.ts). Zelfde opzet als de melding over de nieuwe
// uitzendovereenkomst (lib/agreements/uitzend-melding.ts): EERST een push; bereikt die geen apparaat, dan een mail. Pas als het echt aankwam
// wordt de werker gemarkeerd (KV "branches-melding:<userId>", in ERASABLE_KV_PREFIXES); mislukt alles, dan probeert de volgende run het opnieuw,
// nooit een tweede poging binnen dezelfde run. Nooit voor een testadres of geblokkeerd account. Droog: alleen aantallen.
// ---------------------------------------------------------------------------

export const BRANCHES_MELDING_PREFIX = "branches-melding:";
export const MAX_PER_RUN = 50;
/** Aangemeld vanaf deze dag (6 november, Nederlandse tijd). */
export const AANGEMELD_VANAF = Date.parse("2026-11-06T00:00:00+01:00");

export interface BranchesMeldingTelling {
  /** werkers die tussen 6 en 9 november zijn aangemeld */
  aangemeld: number;
  /** daarvan: testadres of geblokkeerd account (die krijgen niets) */
  overgeslagen: number;
  /** daarvan: hebben al branches gekozen */
  alGekozen: number;
  /** daarvan: al eerder gemeld */
  alGemeld: number;
  teMelden: number;
  perKanaal: { push: number; mail: number; geen: number };
  bereikt: number;
  verstuurdPush: number;
  verstuurdMail: number;
  nietBereikt: number;
  verstuurd: number;
  overgebleven: number;
}

interface Kandidaat {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}

/** Puur: valt dit account in de groep (aangemeld in het venster, geen testadres, niet geblokkeerd)? */
export function inDoelgroep(u: { email: string; createdAt: Date; disabledAt: Date | null }): boolean {
  const t = u.createdAt.getTime();
  return t >= AANGEMELD_VANAF && t < BRANCHE_STAP_SINDS && !u.disabledAt && !isReservedTestAddress(u.email);
}

export async function meldBranchesKiezen(opts: { verstuur: boolean; nu?: number }): Promise<BranchesMeldingTelling> {
  const nu = opts.nu ?? Date.now();
  const uit: BranchesMeldingTelling = {
    aangemeld: 0,
    overgeslagen: 0,
    alGekozen: 0,
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
  const rijen = await prisma.user.findMany({
    where: {
      createdAt: { gte: new Date(AANGEMELD_VANAF), lt: new Date(BRANCHE_STAP_SINDS) },
      memberships: { some: { role: "FREELANCER" } },
    },
    select: { id: true, email: true, fullName: true, emailVerifiedAt: true, disabledAt: true, createdAt: true },
  });
  uit.aangemeld = rijen.length;

  const teDoen: Kandidaat[] = [];
  for (const u of rijen) {
    if (!inDoelgroep(u)) {
      uit.overgeslagen += 1;
      continue;
    }
    // een storing bij het lezen van de keuze telt als "niet zeker": liever niemand melden dan iemand die al koos
    const keuze = await getBrancheKeuze(u.id).catch(() => "storing" as const);
    if (keuze === "storing") {
      uit.overgeslagen += 1;
      continue;
    }
    if (keuze !== null) {
      uit.alGekozen += 1;
      continue;
    }
    if (await kvGet(`${BRANCHES_MELDING_PREFIX}${u.id}`)) {
      uit.alGemeld += 1;
      continue;
    }
    teDoen.push(u);
  }
  uit.teMelden = teDoen.length;

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
          const tekst = BRANCHES_MELDING[locale];
          return {
            title: tekst.pushTitel,
            body: tekst.pushBody,
            data: { type: "branches-melding", url: herinneringHref("branches"), tag: "branches-melding" },
            ttlSeconds: 3 * 24 * 60 * 60,
          };
        });
      } catch (err) {
        logger.warn("branches-melding push mislukt", { error: (err as Error).message });
      }
    }
    if (bereikt > 0) {
      await kvSet(`${BRANCHES_MELDING_PREFIX}${k.id}`, { at: new Date(nu).toISOString(), kanaal: "push", bereikt });
      uit.bereikt += bereikt;
      uit.verstuurdPush += 1;
      uit.verstuurd += 1;
      continue;
    }
    if (!k.emailVerifiedAt) {
      uit.nietBereikt += 1;
      continue;
    }
    try {
      const taal = await mailTaalVoorWerker(k.id);
      const res = await sendMail({ ...branchesMeldingEmailT(k.fullName, env.APP_BASE_URL, taal), to: k.email });
      if (res.delivered) {
        await kvSet(`${BRANCHES_MELDING_PREFIX}${k.id}`, { at: new Date(nu).toISOString(), kanaal: "mail" });
        uit.verstuurdMail += 1;
        uit.verstuurd += 1;
      } else {
        uit.nietBereikt += 1;
      }
    } catch (err) {
      logger.warn("branches-melding mail mislukt", { error: (err as Error).message });
      uit.nietBereikt += 1;
    }
  }
  return uit;
}
