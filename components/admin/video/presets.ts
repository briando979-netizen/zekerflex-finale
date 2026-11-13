import type { TekstClip } from "@/lib/video/model";

// Kant-en-klare tekststijlen voor de bibliotheek (puur, geen JSX).

export interface TekstPreset {
  id: string;
  label: string;
  voorbeeld: string;
  duur: number;
  /** Instellingen; y in een staand beeld (liggend wordt iets aangepast). */
  instelling: Partial<TekstClip>;
}

export const TEKST_PRESETS: TekstPreset[] = [
  { id: "titel", label: "Grote titel", voorbeeld: "Jouw titel", duur: 3, instelling: { tekst: "Jouw titel", grootte: 95, y: 0.35, stijl: "schaduw", animatieIn: "pop", animatieUit: "vervagen" } },
  { id: "onder", label: "Ondertitel", voorbeeld: "Wat er gezegd wordt", duur: 2.5, instelling: { tekst: "Wat er gezegd wordt", grootte: 52, y: 0.78, stijl: "kader", animatieIn: "geen", animatieUit: "geen", vet: true } },
  { id: "oproep", label: "Oproep (knop)", voorbeeld: "Meld je aan", duur: 3, instelling: { tekst: "Meld je aan op zekerflex.com", grootte: 56, y: 0.82, stijl: "gewoon", kleur: "#06261F", achtergrond: "#4FE0A0", animatieIn: "stuiteren", animatieUit: "vervagen" } },
  { id: "neon", label: "Neon", voorbeeld: "Vanavond", duur: 3, instelling: { tekst: "Vanavond", grootte: 110, y: 0.45, stijl: "neon", kleur: "#4FE0A0", animatieIn: "vervagen", animatieUit: "vervagen" } },
  { id: "typen", label: "Typemachine", voorbeeld: "Zo werkt het…", duur: 3.5, instelling: { tekst: "Zo werkt het…", lettertype: "IBM Plex Mono", grootte: 60, y: 0.5, stijl: "kader", vet: false, animatieIn: "typen", animatieUit: "vervagen" } },
  { id: "serif", label: "Chic", voorbeeld: "Smaakvol", duur: 3, instelling: { tekst: "Smaakvol", lettertype: "Instrument Serif", grootte: 120, y: 0.42, stijl: "schaduw", vet: false, animatieIn: "opschuiven", animatieUit: "vervagen" } },
  { id: "omlijnd", label: "Stoer omlijnd", voorbeeld: "NU OPEN", duur: 2.5, instelling: { tekst: "NU OPEN", lettertype: "Impact", grootte: 130, y: 0.4, stijl: "omlijnd", kleur: "#FFD43B", animatieIn: "pop", animatieUit: "pop" } },
  // Technieken uit "lyric"-video's: chatbubbels die woord voor woord groeien, een getypt venster, 3D met glitch.
  { id: "bubbel-blauw", label: "Chatbubbel blauw", voorbeeld: "Werk zoeken?", duur: 2.5, instelling: { tekst: "Werk zoeken?", grootte: 68, y: 0.5, breedte: 0.82, stijl: "bubbel-blauw", kleur: "#FFFFFF", vet: false, animatieIn: "woorden", animatieUit: "glitch" } },
  { id: "bubbel-groen", label: "Chatbubbel groen", voorbeeld: "Kies je klussen", duur: 2.5, instelling: { tekst: "Kies je eigen klussen", grootte: 68, y: 0.5, breedte: 0.82, stijl: "bubbel-groen", kleur: "#FFFFFF", vet: false, animatieIn: "woorden", animatieUit: "glitch" } },
  { id: "venster", label: "Venster (typen)", voorbeeld: "Zo werkt het", duur: 4, instelling: { tekst: "Kies je klus.\nSchrijf je uren in de app.", grootte: 54, y: 0.5, breedte: 0.86, stijl: "venster", kleur: "#FFFFFF", animatieIn: "typen", animatieUit: "glitch" } },
  { id: "3d", label: "3D-woord (glitch)", voorbeeld: "FLEX", duur: 2, instelling: { tekst: "FLEX", grootte: 200, y: 0.5, breedte: 0.96, stijl: "3d", kleur: "#F4F1EA", animatieIn: "glitch", animatieUit: "glitch" } },
];
