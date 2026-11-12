// Woorden en datumtaal van components/chat/shared.ts (dagkoppen, tijd in de lijst, "laatst gezien"). Nederlandse bron;
// de vertalingen staan in teksten-shared-talen.ts. Plaatshouders vult vulIn (lib/i18n/vul-in.ts).
export const SHARED_NL = {
  /** BCP 47-tag voor toLocaleDateString/-TimeString */
  locale: "nl-NL",
  vandaag: "Vandaag",
  gisteren: "Gisteren",
  online: "online",
  laatstGezienOm: "laatst gezien om {tijd}",
  laatstGezienGisteren: "laatst gezien gisteren om {tijd}",
  laatstGezien: "laatst gezien {datum}",
};
export type SharedTeksten = typeof SHARED_NL;
