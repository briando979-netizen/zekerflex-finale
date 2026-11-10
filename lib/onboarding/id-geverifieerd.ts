import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { idGeverifieerdEmail, isReservedTestAddress, sendMail } from "@/lib/mail";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { kanReagerenOpKlussen } from "@/lib/onboarding/kan-reageren";

// ---------------------------------------------------------------------------
// De melding aan een werker zodra zijn ID geverifieerd is (11 nov 2026): een push in zijn
// app-taal en een korte mail, met een link naar /dashboard/eerste-indruk. EENMALIG per werker:
// de markering staat in KV "werker-id-melding:<userId>" (AVG: voorvoegsel in ERASABLE_KV_PREFIXES).
// Wordt aangeroepen op elke plek waar een ID-controle op "geverifieerd" komt; wie het al
// kreeg, krijgt het niet nog eens (ook niet als de status later weer wisselt).
//
// De tekst zegt alleen wat voor het ID geldt: of hij echt kan reageren hangt ook van de rest
// van de aanmelding af (poort en lib/fiscal/eligibility.ts). Een storing hier mag de
// ID-controle nooit tegenhouden: de functie gooit nooit.
// ---------------------------------------------------------------------------

const sleutel = (userId: string) => `werker-id-melding:${userId}`;

/** Wat de ID-melding van deze werker al zei (null = nog niet verstuurd). Voor lib/onboarding/aanmelding-compleet.ts. */
export async function idMeldingStand(userId: string): Promise<{ at: string; kanReageren?: boolean } | null> {
  return kvGet<{ at: string; kanReageren?: boolean }>(sleutel(userId));
}

export type IdMeldingUitslag =
  | { verstuurd: true; push: number; mail: boolean }
  | { verstuurd: false; reden: "al-gemeld" | "geen-werker" | "niet-geverifieerd" | "fout" };

export async function meldIdGeverifieerd(userId: string, now = new Date()): Promise<IdMeldingUitslag> {
  try {
    if (await kvGet(sleutel(userId))) return { verstuurd: false, reden: "al-gemeld" };
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, kycStatus: true, disabledAt: true, memberships: { select: { role: true } } },
    });
    if (!user || user.disabledAt || !user.memberships.some((m) => m.role === "FREELANCER")) return { verstuurd: false, reden: "geen-werker" };
    if (user.kycStatus !== "VERIFIED") return { verstuurd: false, reden: "niet-geverifieerd" };

    // kan de werker nu al echt reageren (start ingevuld, IBAN, …)? Dan zegt de mail dat, zoals bij "aanmelding
    // compleet" (lib/onboarding/aanmelding-compleet.ts), die hierop let om niet twee keer hetzelfde te sturen
    const reageren = await kanReagerenOpKlussen(userId, now);

    // eerst de markering, dan versturen: liever één melding te weinig dan er twee
    await kvSet(sleutel(userId), { at: now.toISOString(), kanReageren: reageren.ok });

    const push = await sendLocalizedPush([userId], (t) => ({
      title: t.idOkTitle,
      body: t.idOkBody.slice(0, 180),
      data: { type: "PROFILE", url: "/dashboard/eerste-indruk", tag: "id-geverifieerd" },
      ttlSeconds: 3 * 86_400,
    })).catch((err) => {
      logger.warn("id-melding: push mislukt", { error: (err as Error).message });
      return 0;
    });

    // een testaccount (.test/.example/…) krijgt geen echte mail
    let mail = false;
    if (!isReservedTestAddress(user.email)) {
      const r = await sendMail({ ...idGeverifieerdEmail(user.fullName, env.APP_BASE_URL, reageren.ok), to: user.email }).catch(() => null);
      mail = Boolean(r?.delivered);
    }
    return { verstuurd: true, push, mail };
  } catch (err) {
    logger.warn("id-melding mislukt", { error: (err as Error).message });
    return { verstuurd: false, reden: "fout" };
  }
}
