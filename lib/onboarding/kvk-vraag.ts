// ---------------------------------------------------------------------------
// De werkvorm als eenvoudige vraag: "Heb je een KVK-nummer?" (22 nov 2026, gebruikersonderzoek punt 7). De keuze
// "ZZP'er / Flexwerker / Uitzendkracht" was verwarrend: op de voorpagina is iedereen een flexwerker, maar hier betekende
// "Flexwerker" juist: met KVK, vaak onder de KOR. Nu: Ja = voor jezelf (daaronder zzp'er of flexwerker met de KOR),
// Nee = via een aangesloten uitzendbureau. De opgeslagen waarden (workerKind) blijven precies hetzelfde.
// Puur bestand: het startscherm, de stappen en de tests lezen het allemaal.
// ---------------------------------------------------------------------------

export type Werkvorm = "zzp" | "flexwerker" | "uitzendkracht";
export type KvkAntwoord = "ja" | "nee";

/** Met een KVK-nummer kies je daarna nog: zzp'er of flexwerker (vaak met de KOR). */
export const WERKVORMEN_MET_KVK = ["zzp", "flexwerker"] as const satisfies readonly Werkvorm[];

/** Het antwoord dat bij een al gekozen werkvorm hoort (null = nog niets gekozen). */
export function kvkAntwoordVan(w: Werkvorm | null | undefined): KvkAntwoord | null {
  if (!w) return null;
  return w === "uitzendkracht" ? "nee" : "ja";
}

/** De werkvorm bij het antwoord: "nee" is altijd uitzendkracht; "ja" heeft nog de keuze zzp'er of flexwerker nodig. */
export function werkvormNaAntwoord(antwoord: KvkAntwoord | null, metKvk: Werkvorm | null): Werkvorm | null {
  if (antwoord === "nee") return "uitzendkracht";
  if (antwoord === "ja" && (metKvk === "zzp" || metKvk === "flexwerker")) return metKvk;
  return null;
}

/** Is de invoer een Nederlandse postcode ("9712 HN", "9712hn")? Dan geeft hij meteen de thuisbasis (punt 6). */
export function nlPostcode(invoer: string): string | null {
  const m = /^\s*([1-9]\d{3})\s*([a-zA-Z]{2})\s*$/.exec(invoer);
  if (!m) return null;
  const letters = (m[2] ?? "").toUpperCase();
  // SA, SD en SS worden in Nederland niet uitgegeven
  if (letters === "SA" || letters === "SD" || letters === "SS") return null;
  return `${m[1]}${letters}`;
}
