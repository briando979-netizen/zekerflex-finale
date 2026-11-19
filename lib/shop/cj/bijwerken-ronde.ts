import { kvDelete, kvGet, kvSet, kvSetIfAbsent, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { bijwerkenVanCj, type BijwerkUitkomst } from "@/lib/shop/cj/importeer";

// ---------------------------------------------------------------------------
// De Bijwerken-ronde vanzelf (18 nov 2026). De knop "Categorie, voorraad en tekst bijwerken" in Beheer → Winkel-AI →
// Leverancier bleef na de uitrol van de voorraad-fix uren ongebruikt, terwijl 100+ producten met Engelse tekst in de
// winkel stonden en de voorraad op 0. Daarom loopt dezelfde functie (bijwerkenVanCj) nu ook via de cron: elke vier
// minuten één ronde binnen het tijdsbudget, met een cursor in KV zodat de volgende ronde verdergaat waar deze stopte,
// en van voren af aan zodra alles gehad is. Een slot voorkomt dat twee rondes tegelijk lopen (zelfde patroon als de
// wachtrij, lib/shop/cj/wachtrij.ts). De knop blijft bestaan voor wie niet wil wachten.
// ---------------------------------------------------------------------------

const K_STAND = "shop:cj:bijwerken:stand";
const K_SLOT = "shop:cj:bijwerken:slot";
/** een slot ouder dan dit is van een ronde die nooit netjes eindigde (herstart, time-out) en telt niet meer */
const SLOT_MAX_MS = 4 * 60_000;
/**
 * Binnen de maxDuration van de route (120 s) en de wget-grens van de cron (115 s), met ruimte voor het laatste product: een
 * product met vertaling kost ±30 s op ons eigen model (18 nov: de eerste ronde van 90 s duurde 130 s).
 */
export const RONDE_BUDGET_MS = 75_000;

export interface BijwerkStand {
  /** waar de volgende ronde begint (index in de lijst van CJ-producten) */
  vanaf: number;
  laatsteRondeOp: string | null;
  /** wanneer voor het laatst álle producten gehad zijn */
  laatsteVolledigOp: string | null;
  rondes: number;
  /** zoveel CJ-producten telde de laatste ronde (voor "x van y" in het beheerscherm) */
  totaal: number;
}

export type RondeBijwerkenUitkomst = BijwerkUitkomst & { status: "gedaan" | "bezet"; vanaf: number };

const LEEG: BijwerkUitkomst = { bekeken: 0, categorie: 0, voorraad: 0, vertaald: 0, fouten: 0, achterstand: 0, volgende: null, totaal: 0 };

export async function leesBijwerkStand(): Promise<BijwerkStand> {
  const s = await kvGet<Partial<BijwerkStand>>(K_STAND).catch(() => null);
  return {
    vanaf: typeof s?.vanaf === "number" && s.vanaf >= 0 ? Math.floor(s.vanaf) : 0,
    laatsteRondeOp: s?.laatsteRondeOp ?? null,
    laatsteVolledigOp: s?.laatsteVolledigOp ?? null,
    rondes: typeof s?.rondes === "number" ? s.rondes : 0,
    totaal: typeof s?.totaal === "number" ? s.totaal : 0,
  };
}

/** Eén ronde: verder vanaf de cursor, binnen het budget; aan het eind van de lijst begint de volgende ronde weer bij 0. */
export async function rondeBijwerken(o: { budgetMs?: number; now?: Date } = {}): Promise<RondeBijwerkenUitkomst> {
  const now = o.now ?? new Date();
  const stand = await leesBijwerkStand();
  const bezet: RondeBijwerkenUitkomst = { ...LEEG, status: "bezet", vanaf: stand.vanaf };

  const slot = { bezig: now.toISOString() };
  const oud = await kvGet<{ bezig?: string }>(K_SLOT).catch(() => null);
  if (oud?.bezig && now.getTime() - Date.parse(oud.bezig) < SLOT_MAX_MS) return bezet;
  if (oud) await kvDelete(K_SLOT).catch(() => undefined);
  if (!(await kvSetIfAbsent(K_SLOT, slot))) return bezet;

  try {
    const uit = await bijwerkenVanCj({ actorUserId: null, actorLabel: "system:cj", vanaf: stand.vanaf, budgetMs: o.budgetMs ?? RONDE_BUDGET_MS });
    const klaar = uit.volgende === null;
    await kvSet(K_STAND, {
      vanaf: klaar ? 0 : (uit.volgende ?? 0),
      laatsteRondeOp: now.toISOString(),
      laatsteVolledigOp: klaar && uit.totaal > 0 ? now.toISOString() : stand.laatsteVolledigOp,
      rondes: stand.rondes + 1,
      totaal: uit.totaal,
    } satisfies BijwerkStand);
    return { ...uit, status: "gedaan", vanaf: stand.vanaf };
  } finally {
    await kvVerwijderAlsVeld(K_SLOT, "bezig", slot.bezig).catch(() => undefined);
  }
}
