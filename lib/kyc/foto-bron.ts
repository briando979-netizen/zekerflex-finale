// ---------------------------------------------------------------------------
// Kwam een ID-foto van de live camera of uit de bestandskeuze (12 nov 2026, voor de meting en Beheer)? De live
// camera (components/app/IdScan.tsx, fotoVanCanvas) noemt een foto "<vorm>-<wijze>-<tijd>.jpg": vorm kaart (document)
// of ovaal (selfie), wijze auto (vanzelf, de camera vond het beeld goed) of knop (de werker drukte zelf). Foto's van
// vóór die wijze heten "<vorm>-<tijd>.jpg" (live, wijze onbekend); een gekozen bestand houdt zijn eigen naam. Puur.
//
// Alleen om te meten en te tonen: de bestandsnaam komt uit de browser, dus hij beslist nergens over (automatisch
// goedkeuren leunt op de live reeks van de server, lib/onboarding/auto-redenen.ts).
// ---------------------------------------------------------------------------

export type FotoBron = "live-auto" | "live-knop" | "live" | "bestand";
export type FotoVak = "front" | "back" | "selfie" | "selfie2";

const LIVE = /^(kaart|ovaal)-(?:(auto|knop)-)?\d{10,}\.jpe?g$/i;

export function fotoBron(bestandsnaam: string | null | undefined): FotoBron {
  const m = LIVE.exec((bestandsnaam ?? "").trim());
  if (!m) return "bestand";
  const wijze = m[2]?.toLowerCase();
  return wijze === "auto" ? "live-auto" : wijze === "knop" ? "live-knop" : "live";
}

/** Live camera, op welke wijze ook. */
export function isLiveBron(b: unknown): boolean {
  return b === "live" || b === "live-auto" || b === "live-knop";
}

const VAK_NAAM: Record<FotoVak, string> = { front: "voorkant", back: "achterkant", selfie: "selfie", selfie2: "tweede selfie" };
const BRON_KORT: Record<FotoBron, string> = { "live-auto": "live (vanzelf)", "live-knop": "live (knop)", live: "live", bestand: "uit bestand" };
const isBron = (v: unknown): v is FotoBron => v === "bestand" || isLiveBron(v);

/** "Alles van de live camera (vanzelf)", "Alles uit de bestandskeuze" of per vak; null als er niets bewaard is (oudere controle). */
export function fotoBronTekst(bron: unknown): string | null {
  if (!bron || typeof bron !== "object" || Array.isArray(bron)) return null;
  const b = bron as Record<string, unknown>;
  const vakken = (Object.keys(VAK_NAAM) as FotoVak[]).filter((k) => isBron(b[k]));
  if (vakken.length === 0) return null;
  if (vakken.every((k) => b[k] === "live-auto")) return "alles van de live camera (vanzelf)";
  if (vakken.every((k) => b[k] === "live")) return "alles van de live camera";
  if (vakken.every((k) => b[k] === "bestand")) return "alles uit de bestandskeuze (zelf gekozen)";
  return vakken.map((k) => `${VAK_NAAM[k]} ${BRON_KORT[b[k] as FotoBron]}`).join(", ");
}
