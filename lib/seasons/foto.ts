import type { SeasonId, ThemeId } from "./calendar";

// ---------------------------------------------------------------------------
// Seizoensfoto's: op een feestdag toont de feestlaag (components/seasons/SeasonalDecor.tsx)
// naast de groet een kaart met de post van dat feest, in de vaste reclamestijl en met onze
// eigen foto's (dezelfde beelden als de social-mediaset van 17 nov 2026). De bestanden staan in
// public/seizoen (640x640, licht), herkomst in public/seizoen/CREDITS.md. Puur: geen Date, geen
// browser, zodat de test en de server hetzelfde zeggen.
// ---------------------------------------------------------------------------

export interface SeizoenFoto {
  src: string;
  /** de kop op het beeld, als omschrijving */
  alt: string;
}

interface Regel {
  alt: string;
  /** eigen beeld voor de werker-app (/dashboard), als dat er is; anders hetzelfde beeld voor iedereen */
  werker?: { bestand: string; alt: string };
}

export const SEIZOEN_FOTOS: Readonly<Record<SeasonId, Regel>> = {
  nieuwjaar: { alt: "Nieuw jaar: zelf bepalen wanneer je werkt?" },
  valentijn: { alt: "Valentijnsdag: restaurant vol geboekt?" },
  carnaval: { alt: "Carnaval: kroeg vol?" },
  pasen: { alt: "Pasen: paasbrunch vol geboekt?" },
  koningsdag: { alt: "Koningsdag: oranje boven?" },
  halloween: { alt: "Halloween: feest op komst?" },
  sinterklaas: { alt: "Sinterklaas: pakjesdrukte? Extra handen." },
  kerst: { alt: "Kerst: kerstdiners vol geboekt?", werker: { bestand: "kerst-werker", alt: "December: bijverdienen in december." } },
  oudjaar: { alt: "Oud & Nieuw: feest op 31 december?" },
};

const isWerkerApp = (pathname: string) => pathname === "/dashboard" || pathname.startsWith("/dashboard/");

/** Het beeld bij een feest, of null (een verjaardag heeft geen beeld). */
export function seizoenFoto(theme: ThemeId, pathname: string): SeizoenFoto | null {
  if (theme === "verjaardag") return null;
  const regel = SEIZOEN_FOTOS[theme];
  if (regel.werker && isWerkerApp(pathname)) return { src: `/seizoen/${regel.werker.bestand}.jpg`, alt: regel.werker.alt };
  return { src: `/seizoen/${theme}.jpg`, alt: regel.alt };
}
