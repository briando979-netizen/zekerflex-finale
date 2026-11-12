import type { SharedTeksten } from "@/lib/chat/teksten-shared";

// Machine-assisted translations: native-speaker review recommended.
export const SHARED_EN: SharedTeksten = {
  locale: "en-GB",
  vandaag: "Today",
  gisteren: "Yesterday",
  online: "online",
  laatstGezienOm: "last seen at {tijd}",
  laatstGezienGisteren: "last seen yesterday at {tijd}",
  laatstGezien: "last seen {datum}",
};
export const SHARED_PL: SharedTeksten = {
  locale: "pl-PL",
  vandaag: "Dzisiaj",
  gisteren: "Wczoraj",
  online: "online",
  laatstGezienOm: "ostatnio widziano o {tijd}",
  laatstGezienGisteren: "ostatnio widziano wczoraj o {tijd}",
  laatstGezien: "ostatnio widziano {datum}",
};
export const SHARED_RO: SharedTeksten = {
  locale: "ro-RO",
  vandaag: "Astăzi",
  gisteren: "Ieri",
  online: "online",
  laatstGezienOm: "văzut ultima dată la {tijd}",
  laatstGezienGisteren: "văzut ultima dată ieri la {tijd}",
  laatstGezien: "văzut ultima dată {datum}",
};
export const SHARED_UK: SharedTeksten = {
  locale: "uk-UA",
  vandaag: "Сьогодні",
  gisteren: "Вчора",
  online: "онлайн",
  laatstGezienOm: "був(-ла) в мережі о {tijd}",
  laatstGezienGisteren: "був(-ла) в мережі вчора о {tijd}",
  laatstGezien: "був(-ла) в мережі {datum}",
};
