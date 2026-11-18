import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { fixedWindow } from "@/lib/rate-limit";
import { kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import {
  BEWAAR_DAGEN,
  DIRECT_PER_UUR,
  DIRECT_WERKERS_PER_UUR,
  GEBEURTENIS_VOORVOEGSEL,
  binnenMeldtijd,
  gebeurtenisSleutel,
  magDirect,
  maakGebeurtenis,
  normaliseerNummer,
  samenvattingTekst,
  telefoonTekst,
  whatsappJid,
  type Gebeurtenis,
  type NieuweGebeurtenis,
} from "@/lib/ops/gebeurtenis";

// De melder voor de eigenaar, de kant met opslag en versturen (de regels staan puur in lib/ops/gebeurtenis.ts).
// Elke gebeurtenis komt in het logboek (KV, 30 dagen). Een belangrijke gaat direct naar de telefoon, de rest wacht op de
// uursamenvatting. Kanaal: de WhatsApp-brug van de eigenaar (Admin, WhatsApp) als die gekoppeld is en aan staat, anders push
// naar alle platformbeheerders: dezelfde push als bij alertOwner (lib/ops/alert.ts), er is geen tweede kanaal. Nooit gooien:
// een storing in de melder mag de gebeurtenis zelf nooit raken.

export const K_MELDER = "ops:melder";

export interface MelderInstelling {
  /** meldingen naar de telefoon aan of uit; het logboek blijft gewoon bijhouden */
  aan: boolean;
  /** cijfers met landcode (31612345678), niet in de code maar hier ingesteld */
  telefoon: string | null;
  /** ook via de WhatsApp-brug sturen (alleen zinvol als die gekoppeld is) */
  whatsapp: boolean;
}

const STANDAARD: MelderInstelling = { aan: true, telefoon: null, whatsapp: false };

export async function leesInstelling(): Promise<MelderInstelling> {
  const v = await kvGet<Partial<MelderInstelling>>(K_MELDER).catch(() => null);
  const telefoon = typeof v?.telefoon === "string" ? normaliseerNummer(v.telefoon) : null;
  return { aan: v?.aan !== false, telefoon, whatsapp: v?.whatsapp === true && telefoon !== null };
}

/** Bewaart de instelling; een ongeldig nummer wordt een fout, een leeg nummer wist het. */
export async function bewaarInstelling(nieuw: { aan: boolean; telefoon: string; whatsapp: boolean }): Promise<MelderInstelling> {
  const invoer = nieuw.telefoon.trim();
  const telefoon = invoer === "" ? null : normaliseerNummer(invoer);
  if (invoer !== "" && !telefoon) throw new Error("Dit lijkt geen telefoonnummer.");
  const instelling: MelderInstelling = { aan: nieuw.aan, telefoon, whatsapp: nieuw.whatsapp && telefoon !== null };
  await kvSet(K_MELDER, instelling);
  return instelling;
}

type Kanaal = "whatsapp" | "push";

// De push-modules één keer inladen en de belofte delen (net als bij alertOwner blijft het dynamisch, zodat prisma niet statisch meekomt).
// Bij gelijktijdige gebeurtenissen gaf een eigen import() per aanroep in de testomgeving op de server (vitest 5.0.0, Node 24.22) alleen de
// eerste aanroep de nagemaakte module: 44 van 45 gingen naar de echte database en vielen om (18 nov, officiële controle).
type PushModules = { platformAdminIds: () => Promise<string[]>; sendUserPush: typeof import("@/lib/notifications/push").sendUserPush };
let pushModulesBelofte: Promise<PushModules> | null = null;
function pushModules(): Promise<PushModules> {
  pushModulesBelofte ??= Promise.all([import("@/lib/messaging/contacts"), import("@/lib/notifications/push")])
    .then(([c, p]) => ({ platformAdminIds: c.platformAdminIds, sendUserPush: p.sendUserPush }))
    .catch((err: unknown) => {
      pushModulesBelofte = null; // een mislukte inlading mag de volgende poging niet blokkeren
      throw err;
    });
  return pushModulesBelofte;
}

/** Stuurt één bericht naar de eigenaar. Geeft het kanaal terug waarmee het lukte, of null als niets het bereikte. */
export async function stuurNaarEigenaar(tekst: string, url: string | null, tag: string, instelling: MelderInstelling): Promise<Kanaal | null> {
  if (instelling.whatsapp && instelling.telefoon) {
    try {
      const { brugIngericht, liveStuur } = await import("@/lib/whatsapp/brug");
      if (brugIngericht()) {
        await liveStuur(whatsappJid(instelling.telefoon), tekst);
        return "whatsapp";
      }
    } catch {
      /* niet gekoppeld of niet bereikbaar: val terug op push */
    }
  }
  try {
    const { platformAdminIds, sendUserPush } = await pushModules();
    const [eerste = "ZekerFlex", ...rest] = tekst.split("\n");
    const bereikt = await sendUserPush(await platformAdminIds(), {
      title: eerste.slice(0, 80),
      body: (rest.join("\n") || eerste).slice(0, 240),
      data: { type: "ops-gebeurtenis", url: url ?? "/admin/automatisch", tag },
      ttlSeconds: 6 * 3600,
    });
    return bereikt > 0 ? "push" : null;
  } catch {
    return null;
  }
}

/** Het moment tot waar het uurbericht alles al heeft gemeld (ISO). Een rij wordt na het schrijven nooit meer aangepast. */
export const K_SAMENGEVAT = "ops:melder:samengevat";

/**
 * Alle gebeurtenissen in het logboek, nieuwste eerst. Een rij wordt één keer geschreven en nooit meer aangepast (zo blijft de
 * volgorde op tijd en verdringt een uurbericht geen directe rijen); wat het uurbericht al heeft gemeld, volgt uit K_SAMENGEVAT.
 */
export async function leesGebeurtenissen(limit = 500): Promise<Gebeurtenis[]> {
  const [rijen, markering] = await Promise.all([
    kvListEntries<Gebeurtenis>(GEBEURTENIS_VOORVOEGSEL, limit).catch(() => []),
    kvGet<{ tot?: string }>(K_SAMENGEVAT).catch(() => null),
  ]);
  const tot = typeof markering?.tot === "string" ? markering.tot : null;
  return rijen
    .map((r) => (tot !== null && r.value.gemeld === "wacht" && r.value.at <= tot ? ({ ...r.value, gemeld: "samenvatting" } satisfies Gebeurtenis) : r.value))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Is er nog ruimte voor een direct bericht? Atomaire tellers per uur in Redis (fixedWindow), dus ook bij gelijktijdige gebeurtenissen
 * en los van het logboek: hoogstens DIRECT_WERKERS_PER_UUR nieuwe werkers en DIRECT_PER_UUR berichten in totaal. Bij een storing in
 * Redis geen direct bericht (het komt dan in het uurbericht).
 */
async function ruimteVoorDirect(soort: Gebeurtenis["soort"]): Promise<boolean> {
  if (soort === "werker-aangemeld" && !(await fixedWindow("melder:werker", DIRECT_WERKERS_PER_UUR, 3600, { failOpen: false })).ok) return false;
  return (await fixedWindow("melder:direct", DIRECT_PER_UUR, 3600, { failOpen: false })).ok;
}

/**
 * Legt een gebeurtenis vast en meldt hem zo nodig direct. Geeft de opgeslagen gebeurtenis terug, of null bij een storing.
 * Nooit gooien.
 */
export async function meldGebeurtenis(n: NieuweGebeurtenis, now: Date = new Date()): Promise<Gebeurtenis | null> {
  try {
    const g = maakGebeurtenis(n, now, randomBytes(4).toString("hex"));
    if (magDirect(g, now)) {
      const instelling = await leesInstelling();
      if (instelling.aan && (await ruimteVoorDirect(g.soort).catch(() => false))) {
        const kanaal = await stuurNaarEigenaar(telefoonTekst(g), g.url, `gebeurtenis-${g.id}`, instelling);
        if (kanaal) g.gemeld = "direct";
      }
    }
    await kvSet(gebeurtenisSleutel(g), g);
    return g;
  } catch (err) {
    logger.warn("melder: gebeurtenis niet vastgelegd", { soort: n.soort, error: (err as Error).message });
    return null;
  }
}

/** Voor plekken waar niet gewacht mag worden (hete paden): nooit awaited, nooit gooien. */
export function meldLater(n: NieuweGebeurtenis): void {
  void meldGebeurtenis(n).catch(() => undefined);
}

export interface SamenvattingUitslag {
  aantal: number;
  gemeld: boolean;
  reden: string | null;
}

/**
 * Het uurbericht (cron, elk uur op :50): alles wat nog wacht, in één bericht. Alleen tussen 07:00 en 23:00 Amsterdam.
 * Lukt het versturen niet (geen kanaal), dan blijft alles wachten tot het volgende uur. Ruimt ook gebeurtenissen op die ouder zijn
 * dan 30 dagen.
 */
export async function stuurSamenvatting(now: Date = new Date()): Promise<SamenvattingUitslag> {
  await kvDeleteStale(GEBEURTENIS_VOORVOEGSEL, new Date(now.getTime() - BEWAAR_DAGEN * 86_400_000)).catch(() => 0);
  if (!binnenMeldtijd(now)) return { aantal: 0, gemeld: false, reden: "buiten de meldtijd" };
  const instelling = await leesInstelling();
  if (!instelling.aan) return { aantal: 0, gemeld: false, reden: "meldingen staan uit" };
  const wacht = (await leesGebeurtenissen(5000)).filter((g) => g.gemeld === "wacht").sort((a, b) => a.at.localeCompare(b.at));
  const tekst = samenvattingTekst(wacht, env.APP_BASE_URL);
  const laatste = wacht[wacht.length - 1];
  if (!tekst || !laatste) return { aantal: 0, gemeld: false, reden: "niets te melden" };
  const kanaal = await stuurNaarEigenaar(tekst, "/admin/automatisch", `samenvatting-${now.getTime()}`, instelling);
  if (!kanaal) return { aantal: wacht.length, gemeld: false, reden: "geen kanaal bereikte de eigenaar" };
  // één markering in plaats van elke rij opnieuw te schrijven: de rijen blijven in de volgorde van hun tijd en er gaat er geen verloren
  await kvSet(K_SAMENGEVAT, { tot: laatste.at });
  return { aantal: wacht.length, gemeld: true, reden: null };
}
