// ---------------------------------------------------------------------------
// Proefklussen (21 nov 2026, eigenaar, na het onderzoek naar Temper en YoungOnes): een nieuwe zzp'er of flexwerker mag op
// zijn eerste 2 klussen reageren en ze werken zonder KVK-nummer, btw-nummer of KOR en zonder rekeningnummer. Vanaf de derde
// klus zijn die verplicht. Het ID blijft vooraf verplicht, en voor een uitzendkracht verandert niets.
// Uitbetalen wacht op de gegevens: de poort bij uren goedkeuren (lib/timesheets/approve.ts, lib/billing/payout-gate.ts)
// blijft even streng, er komt dus nooit een factuur of betaling zonder geldig KVK + btw en IBAN.
// Puur bestand (geen prisma): de telling staat in lib/fiscal/proefklussen.ts.
// ---------------------------------------------------------------------------

/** Zoveel klussen mag een zzp'er of flexwerker aannemen voordat KVK/btw/KOR en het rekeningnummer verplicht zijn. */
export const MAX_PROEFKLUSSEN = 2;

/** Mag deze werker nog een proefklus aannemen? `aantalAangenomen` = aangenomen, niet geannuleerd, geen testklus. */
export function magProefklus(aantalAangenomen: number): boolean {
  // een onleesbaar aantal telt als "geen ruimte": dan geldt de gewone regel
  if (!Number.isFinite(aantalAangenomen) || aantalAangenomen < 0) return false;
  return aantalAangenomen < MAX_PROEFKLUSSEN;
}

/** Hoeveel proefklussen er nog over zijn (0 = geen). */
export function proefklussenOver(aantalAangenomen: number): number {
  return magProefklus(aantalAangenomen) ? MAX_PROEFKLUSSEN - Math.floor(aantalAangenomen) : 0;
}
