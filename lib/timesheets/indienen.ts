// ---------------------------------------------------------------------------
// Wanneer mag een werker zijn uren indienen? Pas als de klus voorbij is: na de geplande eindtijd, of
// eerder als hij al is uitgecheckt (bijvoorbeeld vroeg naar huis gestuurd). Tijdens de klus is er alleen
// inchecken (/dashboard/inchecken/<id>). De urenpagina, de knoppen en POST /api/timesheets/<id>/submit
// volgen alle drie deze regel. Puur: geen database, de klok komt van buiten.
// ---------------------------------------------------------------------------

export interface IndienMoment {
  scheduledEnd: Date;
  actualEnd: Date | null;
}

export function urenIndienenOpen(ts: IndienMoment, nu: number): boolean {
  return ts.actualEnd !== null || nu >= ts.scheduledEnd.getTime();
}

