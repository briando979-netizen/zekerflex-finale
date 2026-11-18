import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import {
  BEWAAR_DAGEN,
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
  /** cijfers met landcode (31634825780), niet in de code maar hier ingesteld */
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
    const [{ platformAdminIds }, { sendUserPush }] = await Promise.all([import("@/lib/messaging/contacts"), import("@/lib/notifications/push")]);
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

/** Alle gebeurtenissen in het logboek, nieuwste eerst. */
export async function leesGebeurtenissen(limit = 500): Promise<Gebeurtenis[]> {
  const rijen = await kvListEntries<Gebeurtenis>(GEBEURTENIS_VOORVOEGSEL, limit).catch(() => []);
  return rijen.map((r) => r.value).sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Legt een gebeurtenis vast en meldt hem zo nodig direct. Geeft de opgeslagen gebeurtenis terug, of null bij een storing.
 * Nooit gooien.
 */
export async function meldGebeurtenis(n: NieuweGebeurtenis, now: Date = new Date()): Promise<Gebeurtenis | null> {
  try {
    const g = maakGebeurtenis(n, now, randomBytes(4).toString("hex"));
    if (g.belang === "direct" && binnenMeldtijd(now)) {
      const instelling = await leesInstelling();
      if (instelling.aan) {
        const recent = await leesGebeurtenissen(500);
        if (magDirect(g, recent, now)) {
          const kanaal = await stuurNaarEigenaar(telefoonTekst(g), g.url, `gebeurtenis-${g.id}`, instelling);
          if (kanaal) g.gemeld = "direct";
        }
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
  const wacht = (await leesGebeurtenissen(1000)).filter((g) => g.gemeld === "wacht").sort((a, b) => a.at.localeCompare(b.at));
  const tekst = samenvattingTekst(wacht, env.APP_BASE_URL);
  if (!tekst) return { aantal: 0, gemeld: false, reden: "niets te melden" };
  const kanaal = await stuurNaarEigenaar(tekst, "/admin/automatisch", `samenvatting-${now.getTime()}`, instelling);
  if (!kanaal) return { aantal: wacht.length, gemeld: false, reden: "geen kanaal bereikte de eigenaar" };
  for (let i = 0; i < wacht.length; i += 50) {
    await Promise.all(wacht.slice(i, i + 50).map((g) => kvSet(gebeurtenisSleutel(g), { ...g, gemeld: "samenvatting" } satisfies Gebeurtenis)));
  }
  return { aantal: wacht.length, gemeld: true, reden: null };
}
