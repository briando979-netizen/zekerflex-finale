// ---------------------------------------------------------------------------
// Kan deze zzp'er of flexwerker factureren? Eén regel voor reageren (lib/fiscal/eligibility.ts) én voor uren goedkeuren en
// uitbetalen (lib/timesheets/approve.ts, lib/billing/payout-gate.ts): een geldig KVK-nummer, óf een geldig btw-nummer, óf de
// kleineondernemersregeling (KOR). Tot 21 nov eiste uitbetalen KVK én btw: een werker met de KOR (zonder btw-nummer) of met
// alleen een EU-btw-nummer kon dan wel werken, maar kreeg zijn geld nooit. Puur bestand (geen prisma of kv).
// ---------------------------------------------------------------------------

/** De velden van FreelancerProfile (database) die meetellen; null = geen profiel. */
export interface BedrijfProfiel {
  kvkValid?: boolean | null;
  vatValid?: boolean | null;
}

/** De velden van de fiscale gegevens (lib/fiscal/store.ts) die meetellen. */
export interface BedrijfFiscaal {
  workerKind?: string | null;
  vatValid?: boolean | null;
  korApplies?: boolean | null;
}

/** Een geldig btw-nummer, in het profiel of in de fiscale gegevens. */
export function btwGeldig(profiel: BedrijfProfiel | null | undefined, fiscaal: BedrijfFiscaal): boolean {
  return Boolean(profiel?.vatValid || fiscaal.vatValid);
}

/** Bedrijf ok: KVK geldig, óf btw geldig, óf de KOR. */
export function bedrijfOk(profiel: BedrijfProfiel | null | undefined, fiscaal: BedrijfFiscaal): boolean {
  return Boolean(profiel?.kvkValid || btwGeldig(profiel, fiscaal) || fiscaal.korApplies);
}

/**
 * Geen btw op de factuur op naam van de werker door de KOR. Dezelfde regel als het weekoverzicht van de werker
 * (lib/payroll/compute.ts): bij een flexwerker wint de KOR, bij een zzp'er een geldig btw-nummer (de KOR-keuze staat in de
 * app alleen bij flexwerker; een zzp'er met een oude KOR-vink en een geldig btw-nummer rekent dus gewoon btw).
 */
export function korZonderBtw(fiscaal: BedrijfFiscaal, metGeldigBtw: boolean): boolean {
  if (!fiscaal.korApplies) return false;
  return fiscaal.workerKind !== "zzp" || !metGeldigBtw;
}
