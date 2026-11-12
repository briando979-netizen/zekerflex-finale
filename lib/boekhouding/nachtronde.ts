// ---------------------------------------------------------------------------
// Nachtelijke boekhoudronde: de aansluiting op database, kv en meldingen (cron -> /api/internal/boekhouding/nachtronde).
// De logica staat in nachtronde-kern.ts. Staat standaard UIT (flag "boekhouding-nachtronde").
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";
import { alertOwner } from "@/lib/ops/alert";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { featureEnabled } from "@/lib/flags";
import { boekDatum } from "./boekstuk";
import { leesBtwConcept, maakBtwConcept } from "./btw/concept";
import { deadlineLijst } from "./deadlines";
import { boekOpenFacturen } from "./inkomsten";
import { kwartaalGrenzen } from "./lezen-kern";
import { verwerkNieuweTransacties } from "./bank/matching";
import { KV_EVEN_KIJKEN, KV_NACHTRONDE, NACHTRONDE_FLAG, type NachtrondeUitslag, type RondeAfhankelijkheden } from "./nachtronde-kern";

/** De laatste uitslag voor Admin → Systeem → Taken (of null als de ronde nog niet draaide). */
export async function laatsteNachtronde(): Promise<NachtrondeUitslag | null> {
  return kvGet<NachtrondeUitslag>(KV_NACHTRONDE);
}

export function echteAfhankelijkheden(): RondeAfhankelijkheden {
  return {
    flagAan: () => featureEnabled(NACHTRONDE_FLAG),
    administraties: async () => {
      const rijen = await prisma.boekAdministratie.findMany({ where: { soort: "ECHT", actief: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      return rijen.map((r) => r.id);
    },
    boekFacturen: async (administratieId, sinds, nu) => {
      const r = await boekOpenFacturen(administratieId, { sinds, limiet: 1000, now: nu });
      if (r.fouten.length > 0) logger.warn("boekronde: facturen om na te kijken", { administratieId, aantal: r.fouten.length });
      return { nieuw: r.nieuweFacturen + r.nieuweBetalingen + r.nieuweTegenboekingen, alGeboekt: r.alGeboekt, fouten: r.fouten.length };
    },
    // Alleen NIEUWE transacties: wat al bij "even kijken" ligt beoordeelt een mens; de ronde herinnert er alleen aan (evenKijkenStap).
    verwerkBank: (administratieId) => verwerkNieuweTransacties(administratieId, { ookTwijfel: false, door: "systeem" }),
    boekingenStempel: async (administratieId, jaar, kwartaal) => {
      const { van, tot } = kwartaalGrenzen(jaar, kwartaal);
      const r = await prisma.boekBoeking.aggregate({
        where: { administratieId, datum: { gte: boekDatum(van), lte: boekDatum(tot) } },
        _count: { _all: true },
        _max: { createdAt: true },
      });
      return { aantal: r._count._all, laatsteAanmaak: r._max.createdAt };
    },
    btwToestand: async (administratieId, jaar, kwartaal) => {
      const { laatste } = await leesBtwConcept(administratieId, jaar, kwartaal);
      return laatste ? { status: laatste.status, berekendOp: new Date(laatste.berekendOp) } : null;
    },
    maakBtwConcept: async (administratieId, jaar, kwartaal, nu) => {
      await maakBtwConcept(administratieId, jaar, kwartaal, nu);
    },
    telEvenKijken: async (administratieId, grens) => {
      const [bank, bonnen] = await Promise.all([
        prisma.boekBankTransactie.count({ where: { status: "TWIJFEL", boekingId: null, createdAt: { lt: grens }, bankRekening: { administratieId } } }),
        prisma.boekBon.count({ where: { administratieId, status: "EVEN_KIJKEN", updatedAt: { lt: grens } } }),
      ]);
      return bank + bonnen;
    },
    deadlines: (nu) => deadlineLijst(nu, 1),
    meldingVerstuurd: async (sleutel) => (await kvGet<{ at: string }>(sleutel)) !== null,
    markeerVerstuurd: async (sleutel, nu) => {
      await kvSet(sleutel, { at: nu.toISOString() });
    },
    stuurMelding: (m) => alertOwner({ key: m.key, title: m.title, detail: m.detail, severity: m.severity, url: m.url }),
    laatsteEvenKijkenHerinnering: async () => {
      const r = await kvGet<{ at: string }>(KV_EVEN_KIJKEN);
      return r ? amsterdamDayKey(new Date(r.at)) : null;
    },
    bewaarUitslag: (u) => kvSet(KV_NACHTRONDE, u),
    meldFout: (stap, e, administratieId) => {
      logger.error("boekronde: stap mislukt", { stap, soort: e instanceof Error ? e.name : "onbekend", ...(administratieId ? { administratieId } : {}) });
    },
  };
}
