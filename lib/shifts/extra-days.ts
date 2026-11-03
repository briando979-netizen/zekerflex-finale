// De dagen die je in "Nieuwe dienst" als extra dag van een reeks kunt aanvinken:
// de 21 kalenderdagen ná de begindatum. Puur rekenen op de yyyy-mm-dd van het
// datetime-local-veld, los van de tijdzone (toISOString() is UTC en schoof bij
// een begintijd vóór 01:00/02:00 Nederlandse tijd alles een dag terug).

export function extraDayOptions(startDay: string, count = 21): string[] {
  const [y, m, d] = startDay.split("-").map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i + 1)).toISOString().slice(0, 10));
}
