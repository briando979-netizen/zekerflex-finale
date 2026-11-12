// ---------------------------------------------------------------------------
// Boekhouding: het rekeningschema en de btw-codes in een administratie zaaien. Dun prisma-deel; de gegevens staan in
// rgs-schema.ts. Een administratie krijgt zijn eigen kopie, zodat een entiteit rekeningen kan verbergen of toevoegen
// zonder de andere te raken. Opnieuw uitvoeren is veilig: wat er al is wordt overgeslagen.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { boekDatum } from "./boekstuk";
import { BASIS_BTW_CODES, BASIS_REKENINGSCHEMA, BTW_CODES_GELDIG_VANAF } from "./rgs-schema";
import type { RekeningSjabloon } from "./rgs-types";

/** Controleert het schema: unieke nummers, en elke ouder bestaat, is een kopje en gaat vooraf. */
export function controleerRekeningschema(schema: readonly RekeningSjabloon[]): void {
  const gezien = new Map<string, RekeningSjabloon>();
  for (const r of schema) {
    if (gezien.has(r.nummer)) throw AppError.validation(`Rekeningnummer ${r.nummer} komt twee keer voor in het schema.`);
    if (r.ouder !== undefined) {
      const ouder = gezien.get(r.ouder);
      if (!ouder) throw AppError.validation(`Rekening ${r.nummer}: het kopje ${r.ouder} ontbreekt of staat te laat.`);
      if (ouder.boekbaar) throw AppError.validation(`Rekening ${r.nummer}: ${r.ouder} is geen kopje.`);
    }
    gezien.set(r.nummer, r);
  }
}

/** Zaait de rekeningen; geeft het aantal nieuw aangemaakte rekeningen terug. */
export async function importeerRekeningschema(
  tx: Prisma.TransactionClient,
  administratieId: string,
  schema: readonly RekeningSjabloon[] = BASIS_REKENINGSCHEMA,
): Promise<number> {
  controleerRekeningschema(schema);
  const bestaand = await tx.boekRekening.findMany({
    where: { administratieId },
    select: { id: true, nummer: true },
  });
  const idPerNummer = new Map(bestaand.map((r) => [r.nummer, r.id] as const));
  let nieuw = 0;
  // Het schema staat gesorteerd met de kopjes eerst: een ouder bestaat dus altijd al als zijn kind komt.
  for (const r of schema) {
    if (idPerNummer.has(r.nummer)) continue;
    const ouderId = r.ouder !== undefined ? idPerNummer.get(r.ouder) : undefined;
    const gemaakt = await tx.boekRekening.create({
      data: {
        administratieId,
        nummer: r.nummer,
        naam: r.naam,
        soort: r.soort,
        boekbaar: r.boekbaar,
        ...(r.rgsCode !== undefined ? { rgsCode: r.rgsCode } : {}),
        ...(ouderId !== undefined ? { parentId: ouderId } : {}),
      },
      select: { id: true },
    });
    idPerNummer.set(r.nummer, gemaakt.id);
    nieuw += 1;
  }
  return nieuw;
}

/** Zaait de btw-codes; geeft het aantal nieuw aangemaakte codes terug. */
export async function importeerBtwCodes(tx: Prisma.TransactionClient, administratieId: string): Promise<number> {
  const resultaat = await tx.boekBtwCode.createMany({
    data: BASIS_BTW_CODES.map((c) => ({
      administratieId,
      code: c.code,
      omschrijving: c.omschrijving,
      richting: c.richting,
      tariefBasispunten: c.tariefBasispunten,
      grondslagRubriek: c.grondslagRubriek,
      btwRubriek: c.btwRubriek,
      geldigVanaf: boekDatum(BTW_CODES_GELDIG_VANAF),
    })),
    skipDuplicates: true,
  });
  return resultaat.count;
}
