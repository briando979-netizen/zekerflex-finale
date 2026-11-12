import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { isReservedTestAddress, sendMail } from "@/lib/mail";
import { aanmeldingCompleetEmailT, type AanmeldingCompleetSoort } from "@/lib/mail/werker/aanmelding-compleet";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { FOUTEN } from "@/lib/i18n/fouten";
import { kanReagerenOpKlussen } from "@/lib/onboarding/kan-reageren";
import { idMeldingStand } from "@/lib/onboarding/id-geverifieerd";

// ---------------------------------------------------------------------------
// De mail "aanmelding compleet" (10 nov, eigenaar: "als ik de gegevens heb ingevuld wil ik een
// mail van ZekerFlex zien"). De layout van /dashboard rekent de poort al uit
// (lib/onboarding/werker-poort-server.ts):
//  - zolang de start niet af is: noteerAanmeldingOpen (KV "werker-aanmelding:<userId>" = { open })
//  - zodra hij af is: meldAanmeldingCompleet, EENMALIG ({ gemeld }), en alleen als we de werker
//    eerder met een open start zagen. Wie al klaar was toen dit live ging, krijgt dus niets.
// De mail zegt hoe het ervoor staat (lib/mail: aanmeldingCompleetEmail): meteen reageren, nog één
// ding (bijv. het IBAN), of we controleren nog het ID (daarna volgt "Je ID is geverifieerd").
// Zei de ID-mail al "je kunt vanaf nu reageren", dan sturen we niet nog eens hetzelfde.
// AVG: het voorvoegsel staat in ERASABLE_KV_PREFIXES. Een storing hier raakt de app nooit: de
// functies gooien niet, en de layout roept ze na de pagina aan (runAfter).
// ---------------------------------------------------------------------------

const sleutel = (userId: string) => `werker-aanmelding:${userId}`;

interface AanmeldingStand {
  open?: string;
  gemeld?: string;
}

// Per proces onthouden wat we al weten, zodat niet elke pagina de KV leest of schrijft
// (gedeeld via globalThis: Next bundelt routes apart).
const g = globalThis as unknown as { __zfAanmelding?: Map<string, "open" | "klaar"> };
function geheugen(): Map<string, "open" | "klaar"> {
  if (!g.__zfAanmelding || g.__zfAanmelding.size > 20_000) g.__zfAanmelding = new Map();
  return g.__zfAanmelding;
}

/** Alleen voor tests: vergeet wat dit proces al wist. */
export function vergeetAanmeldingGeheugen(): void {
  g.__zfAanmelding = new Map();
}

export async function noteerAanmeldingOpen(userId: string, now = new Date()): Promise<void> {
  if (geheugen().get(userId) === "open") return;
  try {
    const stand = await kvGet<AanmeldingStand>(sleutel(userId));
    if (!stand?.open) await kvSet(sleutel(userId), { ...(stand ?? {}), open: now.toISOString() });
    geheugen().set(userId, "open");
  } catch (err) {
    logger.warn("aanmelding: open noteren mislukt", { error: (err as Error).message });
  }
}

export type CompleetUitslag =
  | { verstuurd: true; soort: AanmeldingCompleetSoort; mail: boolean }
  | { verstuurd: false; reden: "al-gemeld" | "nooit-open" | "geen-werker" | "zelfde-als-id-mail" | "fout" };

export async function meldAanmeldingCompleet(userId: string, now = new Date()): Promise<CompleetUitslag> {
  if (geheugen().get(userId) === "klaar") return { verstuurd: false, reden: "al-gemeld" };
  try {
    const stand = await kvGet<AanmeldingStand>(sleutel(userId));
    if (!stand?.open) {
      geheugen().set(userId, "klaar");
      return { verstuurd: false, reden: "nooit-open" };
    }
    if (stand.gemeld) {
      geheugen().set(userId, "klaar");
      return { verstuurd: false, reden: "al-gemeld" };
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, kycStatus: true, disabledAt: true, memberships: { select: { role: true } } },
    });
    if (!user || user.disabledAt || !user.memberships.some((m) => m.role === "FREELANCER")) {
      geheugen().set(userId, "klaar");
      return { verstuurd: false, reden: "geen-werker" };
    }

    const reageren = user.kycStatus === "VERIFIED" ? await kanReagerenOpKlussen(userId, now) : null;
    const soort: AanmeldingCompleetSoort = !reageren ? "id-in-controle" : reageren.ok ? "kan-reageren" : "nog-iets";

    // eerst de markering, dan versturen: liever één mail te weinig dan er twee
    await kvSet(sleutel(userId), { ...stand, gemeld: now.toISOString() });
    geheugen().set(userId, "klaar");

    if (soort === "kan-reageren" && (await idMeldingStand(userId).catch(() => null))?.kanReageren) {
      return { verstuurd: false, reden: "zelfde-als-id-mail" };
    }

    // een testaccount (.test/.example/…) krijgt geen echte mail
    let mail = false;
    if (!isReservedTestAddress(user.email)) {
      const taal = await mailTaalVoorWerker(userId);
      // de reden is Nederlands; met een sleutel (lib/fiscal/eligibility.ts) vertalen we hem naar de taal van de werker
      const reden = (reageren?.sleutel && taal !== "nl" ? FOUTEN[reageren.sleutel]?.[taal] : undefined) ?? reageren?.reden ?? null;
      const r = await sendMail({
        ...aanmeldingCompleetEmailT({ fullName: user.fullName, appUrl: env.APP_BASE_URL, soort, reden }, taal),
        to: user.email,
      }).catch(() => null);
      mail = Boolean(r?.delivered);
    }
    return { verstuurd: true, soort, mail };
  } catch (err) {
    logger.warn("aanmelding: compleet-mail mislukt", { error: (err as Error).message });
    return { verstuurd: false, reden: "fout" };
  }
}
