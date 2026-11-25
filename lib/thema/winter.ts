import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De winterperiode van het feestdagenthema (eigenaar, 25 nov 2026, zoals YoungOnes):
// een kerstmuts op het logo en sneeuw in de koppen van de apps, van 25 november
// tot en met 6 januari (Driekoningen). Puur en op de Nederlandse kalenderdag,
// zodat de server en de browser hetzelfde zeggen (geen hydratiefout).
// De losse feestdagen (Sinterklaas, Kerst, Oudjaar) houden hun eigen versiering
// via lib/seasons/calendar.ts; dit is alleen de stille winterlaag eroverheen.
// ---------------------------------------------------------------------------

export function winterActief(now: Date = new Date()): boolean {
  const dag = amsterdamDayKey(now);
  const md = Number(dag.slice(5, 7)) * 100 + Number(dag.slice(8, 10));
  return md >= 1125 || md <= 106;
}
