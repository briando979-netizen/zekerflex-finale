// ---------------------------------------------------------------------------
// De stappen van "Uren invullen" (components/app/TimesheetSubmitForm.tsx) als kleine stappenmachine.
// Puur, zodat hij getest kan worden: Terug gaat vanaf elke stap één voor één terug, tot en met stap 1
// (wens eigenaar, 12 nov: eerder liep Terug vast bij de uren en de extra kosten). Een uitzendkracht wordt
// verloond en heeft dus geen stap voor de uitbetaling. "Niet gewerkt" is een zijpad van stap 1.
// ---------------------------------------------------------------------------

export type IndienStap = "worked" | "notWorked" | "hours" | "extra" | "review" | "payout" | "confirm";

export function stappenVolgorde(payroll: boolean): IndienStap[] {
  return ["worked", "hours", "extra", "review", ...(payroll ? [] : (["payout"] as IndienStap[])), "confirm"];
}

/** De volgende stap; op de laatste blijft hij staan. */
export function volgendeStap(volgorde: readonly IndienStap[], stap: IndienStap): IndienStap {
  const i = volgorde.indexOf(stap);
  return volgorde[Math.min(volgorde.length - 1, i + 1)] ?? stap;
}

/** De vorige stap, of null op stap 1 (daar is geen Terug). */
export function vorigeStap(volgorde: readonly IndienStap[], stap: IndienStap): IndienStap | null {
  if (stap === "notWorked") return "worked";
  const i = volgorde.indexOf(stap);
  return i > 0 ? (volgorde[i - 1] ?? null) : null;
}
