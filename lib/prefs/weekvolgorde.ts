// Puur bestand (geen prisma/kv): het weekrooster van /dashboard/beschikbaarheid deelt dit met de test.
//
// De beschikbaarheid wordt bewaard per weekdagnummer zoals JavaScript het telt: 0 = zondag … 6 = zaterdag
// (UserPrefs.availability in lib/prefs/store.ts; de dagnamen in ft.date.wd staan in dezelfde volgorde).
// In Nederland begint de week op maandag. Alleen de VOLGORDE op het scherm verandert dus: elke kolom
// houdt zijn eigen dagnummer, anders verschuift ieders bewaarde beschikbaarheid een dag.

/** De weekdagnummers in de volgorde waarin het rooster ze toont: maandag eerst, zondag laatst. */
export const WEEK_VANAF_MAANDAG = [1, 2, 3, 4, 5, 6, 0] as const;

export type Weekdagnummer = (typeof WEEK_VANAF_MAANDAG)[number];

/**
 * De kolommen van het rooster: per kolom het bewaarde dagnummer en de naam die erbij hoort.
 * `namen` is de lijst zoals de woordenboeken hem hebben (index 0 = zondag).
 */
export function weekKolommen(namen: readonly string[]): { dag: Weekdagnummer; naam: string }[] {
  return WEEK_VANAF_MAANDAG.map((dag) => {
    const kort = namen[dag] ?? "";
    return { dag, naam: kort.charAt(0).toUpperCase() + kort.slice(1) };
  });
}
