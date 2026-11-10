import { ageOn, minimumHourlyCents } from "@/lib/payroll/cao";
import { HOLIDAY_ALLOWANCE_PCT, HOLIDAY_HOURS_PCT } from "@/lib/payroll/compute";

// ---------------------------------------------------------------------------
// De opbouw van het uurloon bij een uitzendklus, zoals de loonberekening hem ook maakt
// (lib/payroll/compute.ts): het uurtarief van de klus is het bruto uurloon, met als ondergrens
// het minimumloon voor de leeftijd van de werker; vakantiegeld en de reservering voor vakantiedagen
// komen daar als percentage overheen. Indicatie: het exacte loon staat op de loonstrook.
// ---------------------------------------------------------------------------

export interface UurloonOpbouw {
  /** leeftijd op de dag van de klus, of null als de geboortedatum ontbreekt */
  leeftijd: number | null;
  brutoCents: number;
  /** het uurtarief lag onder het minimumloon voor deze leeftijd: de ondergrens is toegepast */
  minimumToegepast: boolean;
  vakantiegeldCents: number;
  vakantiedagenCents: number;
  totaalCents: number;
  vakantiegeldPct: number;
  vakantiedagenPct: number;
}

export function uurloonOpbouw(input: { hourlyRateCents: number; birthDate: string | null; op: Date }): UurloonOpbouw {
  const leeftijd = ageOn(input.birthDate, input.op);
  const minimum = minimumHourlyCents(leeftijd, input.op);
  const minimumToegepast = input.hourlyRateCents < minimum;
  const brutoCents = Math.max(input.hourlyRateCents, minimum);
  const vakantiegeldCents = Math.round(brutoCents * HOLIDAY_ALLOWANCE_PCT);
  const vakantiedagenCents = Math.round(brutoCents * HOLIDAY_HOURS_PCT);
  return {
    leeftijd,
    brutoCents,
    minimumToegepast,
    vakantiegeldCents,
    vakantiedagenCents,
    totaalCents: brutoCents + vakantiegeldCents + vakantiedagenCents,
    vakantiegeldPct: Math.round(HOLIDAY_ALLOWANCE_PCT * 10000) / 100,
    vakantiedagenPct: Math.round(HOLIDAY_HOURS_PCT * 10000) / 100,
  };
}
