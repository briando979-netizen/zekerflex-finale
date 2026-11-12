// ---------------------------------------------------------------------------
// Stripe: de uitbetalingen uit een payout-rapport boeken (datalaag, met prisma). Alleen lezen uit het bestand dat de
// eigenaar aanlevert: geen Stripe-aanroep. Idempotent via boek() (bronId "stripe-payout:<id>"): hetzelfde rapport twee
// keer geeft niets dubbels. Een fout bij een payout (periode vergrendeld, andere valuta) wordt gemeld en de rest gaat door.
// In de uitkomst alleen payout-id's en aantallen.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { boek } from "../boek";
import { REKENING_BANK, REKENING_BETAALKOSTEN, REKENING_STRIPE_SALDO, bouwPayoutBoeking } from "./boeking-kern";
import { parseStripePayoutRapport, type RapportFout } from "./rapport";
import type { StripeUitbetaling } from "./rapport";

export interface StripeImportUitkomst {
  totaal: number;
  nieuw: number;
  alBekend: number;
  /** boekingen met Stripe-kosten zonder btw: de accountant bevestigt de btw-behandeling */
  doorAccountantTeBevestigen: number;
  fouten: { payoutId: string | null; regel: number | null; fout: string }[];
}

/** Boekt de uitbetalingen op bank 1100, Stripe-saldo 1150 en betaalkosten 4200 van deze administratie. */
export async function boekStripeUitbetalingen(
  administratieId: string,
  uitbetalingen: readonly StripeUitbetaling[],
  door: string,
  rapportFouten: readonly RapportFout[] = [],
): Promise<StripeImportUitkomst> {
  const administratie = await prisma.boekAdministratie.findUnique({
    where: { id: administratieId },
    select: { id: true, valuta: true, actief: true },
  });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
  if (!administratie.actief) throw AppError.validation("Deze administratie is niet actief: er wordt niet meer in geboekt.");
  const rekeningen = await prisma.boekRekening.findMany({
    where: { administratieId, nummer: { in: [REKENING_BANK, REKENING_STRIPE_SALDO, REKENING_BETAALKOSTEN] } },
    select: { id: true, nummer: true },
  });
  const perNummer = new Map(rekeningen.map((r) => [r.nummer, r.id] as const));
  const ctx = {
    administratieId,
    valuta: administratie.valuta,
    aangemaaktDoor: door,
    rekeningId: (nummer: string) => {
      const id = perNummer.get(nummer);
      if (!id) throw AppError.validation(`Rekening ${nummer} ontbreekt in deze administratie.`);
      return id;
    },
  };

  const uit: StripeImportUitkomst = {
    totaal: uitbetalingen.length,
    nieuw: 0,
    alBekend: 0,
    doorAccountantTeBevestigen: 0,
    fouten: rapportFouten.map((f) => ({ payoutId: null, regel: f.regel, fout: f.fout })),
  };
  for (const p of uitbetalingen) {
    try {
      const r = await boek(bouwPayoutBoeking(p, ctx));
      if (!r.nieuw) uit.alBekend += 1;
      else {
        uit.nieuw += 1;
        if (p.feeCents !== 0) uit.doorAccountantTeBevestigen += 1;
      }
    } catch (e) {
      uit.fouten.push({ payoutId: p.payoutId, regel: null, fout: e instanceof Error ? e.message : "Onbekende fout" });
    }
  }
  return uit;
}

/** Leest het csv-rapport en boekt het. "Formaat niet herkend" komt als AppError.validation naar boven. */
export async function importeerStripeRapport(administratieId: string, csv: string, door: string): Promise<StripeImportUitkomst> {
  const rapport = parseStripePayoutRapport(csv);
  const uit = await boekStripeUitbetalingen(administratieId, rapport.uitbetalingen, door, rapport.fouten);
  return { ...uit, totaal: rapport.uitbetalingen.length + rapport.fouten.length };
}
