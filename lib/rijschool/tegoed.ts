// ---------------------------------------------------------------------------
// Lestegoed van een leerling, in minuten (zie RijschoolTegoed in het schema).
// Puur en client-veilig: de beheer-, leerling- en instructeur-schermen tonen
// hetzelfde saldo met dezelfde woorden.
// ---------------------------------------------------------------------------

export const saldo = (mutaties: { minuten: number }[]) => mutaties.reduce((s, m) => s + m.minuten, 0);

/** 270 min bij lessen van 60 → "4 lessen en 30 min"; negatief → "2 lessen te weinig". */
export function tegoedTekst(minuten: number, lesMinuten: number): string {
  if (minuten === 0) return "Geen tegoed";
  const abs = Math.abs(minuten);
  const lessen = Math.floor(abs / lesMinuten);
  const rest = abs % lesMinuten;
  const delen = [lessen > 0 ? `${lessen} ${lessen === 1 ? "les" : "lessen"}` : "", rest > 0 ? `${rest} min` : ""].filter(Boolean);
  const tekst = delen.join(" en ");
  return minuten > 0 ? tekst : `${tekst} te weinig`;
}

/** Hoeveel minuten een les kost: de geplande duur, afgerond op hele minuten. */
export const lesduur = (start: Date | string, eind: Date | string) =>
  Math.max(0, Math.round((new Date(eind).getTime() - new Date(start).getTime()) / 60_000));
