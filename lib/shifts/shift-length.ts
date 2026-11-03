// Vangnet voor de lengte van een dienst, bij aanmaken, bewerken en via de API.
// - Langer dan 24 uur is vrijwel altijd een tikfout in de einddatum.
// - Een uitzendkracht is werknemer: de Arbeidstijdenwet staat dan maximaal
//   12 uur werk per dienst toe (pauze telt niet mee).
// Geeft de foutmelding terug, of null als de dienst in orde is. Puur, zodat het te testen is.

export const MAX_SHIFT_SPAN_HOURS = 24;
export const MAX_UITZEND_WORK_HOURS = 12;

export function shiftLengthProblem(w: {
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  viaUitzendbureau: boolean;
}): string | null {
  const spanHours = (w.endsAt.getTime() - w.startsAt.getTime()) / 3_600_000;
  if (spanHours > MAX_SHIFT_SPAN_HOURS) {
    return `Deze dienst duurt ${Math.round(spanHours)} uur. Een dienst duurt maximaal ${MAX_SHIFT_SPAN_HOURS} uur; controleer de einddatum.`;
  }
  const workHours = spanHours - w.breakMinutes / 60;
  if (w.viaUitzendbureau && workHours > MAX_UITZEND_WORK_HOURS) {
    const shown = (Math.round(workHours * 10) / 10).toString().replace(".", ",");
    return `Een uitzendkracht mag volgens de Arbeidstijdenwet maximaal ${MAX_UITZEND_WORK_HOURS} uur per dienst werken (deze dienst: ${shown} uur zonder pauze). Kort hem in of splits hem in twee diensten.`;
  }
  return null;
}
