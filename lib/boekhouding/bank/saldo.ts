// Bank: de controle op het afschriftsaldo (puur): openingssaldo + som van de mutaties = eindsaldo.
// Een verschil blokkeert het inlezen niet (het kan aan een ontbrekende dag of een bankexport liggen), het geeft een waarschuwing.

import { formatCenten } from "../bedrag";

export function saldoWaarschuwing(
  beginCents: number | null,
  eindCents: number | null,
  mutatiesCents: readonly number[],
  valuta: string,
  label = "Het afschrift",
): string | null {
  if (beginCents === null || eindCents === null) return null;
  const som = mutatiesCents.reduce((a, b) => a + b, 0);
  if (beginCents + som === eindCents) return null;
  const verschil = eindCents - (beginCents + som);
  return `${label}: openingssaldo ${formatCenten(beginCents, valuta)} plus de mutaties ${formatCenten(som, valuta)} is niet gelijk aan het eindsaldo ${formatCenten(eindCents, valuta)} (verschil ${formatCenten(verschil, valuta)}). Mogelijk ontbreken er transacties of is een dag dubbel geëxporteerd; controleer het bestand.`;
}
