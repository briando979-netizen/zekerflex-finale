// ---------------------------------------------------------------------------
// Kwam een ID-foto van de live camera of uit de bestandskeuze (12 nov 2026, voor de meting en Beheer)? De live
// camera (components/app/IdScan.tsx, fotoVanCanvas) noemt een foto "<vorm>-<tijd>.jpg" met vorm kaart (document) of
// ovaal (selfie); een gekozen bestand houdt zijn eigen naam. Puur bestand.
//
// Alleen om te meten en te tonen: de bestandsnaam komt uit de browser, dus hij beslist nergens over (automatisch
// goedkeuren leunt op de live reeks van de server, lib/onboarding/auto-redenen.ts).
// ---------------------------------------------------------------------------

export type FotoBron = "live" | "bestand";
export type FotoVak = "front" | "back" | "selfie" | "selfie2";

const LIVE = /^(kaart|ovaal)-\d{10,}\.jpe?g$/i;

export function fotoBron(bestandsnaam: string | null | undefined): FotoBron {
  return LIVE.test((bestandsnaam ?? "").trim()) ? "live" : "bestand";
}

const VAK_NAAM: Record<FotoVak, string> = { front: "voorkant", back: "achterkant", selfie: "selfie", selfie2: "tweede selfie" };

/** "Alles van de live camera", "Alles uit de bestandskeuze" of per vak; null als er niets bewaard is (oudere controle). */
export function fotoBronTekst(bron: unknown): string | null {
  if (!bron || typeof bron !== "object" || Array.isArray(bron)) return null;
  const b = bron as Record<string, unknown>;
  const vakken = (Object.keys(VAK_NAAM) as FotoVak[]).filter((k) => b[k] === "live" || b[k] === "bestand");
  if (vakken.length === 0) return null;
  if (vakken.every((k) => b[k] === "live")) return "alles van de live camera";
  if (vakken.every((k) => b[k] === "bestand")) return "alles uit de bestandskeuze (zelf gekozen)";
  return vakken.map((k) => `${VAK_NAAM[k]} ${b[k] === "live" ? "live" : "uit bestand"}`).join(", ");
}
