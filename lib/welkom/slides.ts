// Pure hulpjes voor de mobiele welkomstflow (/welkom): geen React, geen server-imports,
// zodat server (start-pagina) en client (carrousel) ze delen en vitest ze kan testen.

// Beelden: public/welkom/slide-1..3.webp, verkleinde Pexels-foto's uit public/marketing (Pexels License);
// herkomst per bestand in public/welkom/CREDITS.md.
export const AANTAL_SLIDES = 3;

/** Cookie waarmee de server weet dat iemand de carrousel al zag (nooit essentieel). */
export const WELKOM_COOKIE = "zf_welkom";
export const WELKOM_STORAGE_KEY = "zf_welkom_gezien";

/** De volgende slide; blijft op de laatste staan. */
export function volgendeSlide(i: number, n: number = AANTAL_SLIDES): number {
  return Math.min(Math.max(i, 0) + 1, n - 1);
}

/** De vorige slide; blijft op de eerste staan. */
export function vorigeSlide(i: number, n: number = AANTAL_SLIDES): number {
  return Math.max(Math.min(i, n - 1) - 1, 0);
}

/** Welke slide staat in beeld, uit de scrollpositie van de carrousel. */
export function slideVanScroll(scrollLeft: number, breedte: number, n: number = AANTAL_SLIDES): number {
  if (!(breedte > 0)) return 0;
  return Math.min(Math.max(Math.round(scrollLeft / breedte), 0), n - 1);
}

/** Slide die bij een swipe hoort: naar links vegen = volgende. Kleine bewegingen tellen niet. */
export function slideNaSwipe(i: number, dx: number, n: number = AANTAL_SLIDES, drempel = 40): number {
  if (dx <= -drempel) return volgendeSlide(i, n);
  if (dx >= drempel) return vorigeSlide(i, n);
  return i;
}

/** De waarde voor `document.cookie` die onthoudt dat de carrousel gezien is (een jaar). */
export function gezienCookie(): string {
  return `${WELKOM_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** True wanneer de cookie-tekst zegt dat de carrousel al gezien is. */
export function cookieIsGezien(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)zf_welkom=1(?:;|$)/.test(cookie ?? "");
}

/**
 * Waar een niet-ingelogde bezoeker van de app naartoe gaat: een eerste bezoeker in de app
 * naar de welkomstcarrousel, een teruggekeerde (en de gewone website) naar het inlogscherm.
 */
export function instroomBestemming(opts: { inApp: boolean; gezien: boolean }): "/welkom" | "/login" {
  return opts.inApp && !opts.gezien ? "/welkom" : "/login";
}

const REGISTER_SLEUTELS = ["type", "email", "name", "company", "kvk"] as const;

/** /register, met de bestaande queryparameters (type, e-mail, naam, …) behouden. */
export function registerHref(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const k of REGISTER_SLEUTELS) {
    const v = params[k];
    const eerste = Array.isArray(v) ? v[0] : v;
    if (eerste) q.set(k, eerste.slice(0, 200));
  }
  const s = q.toString();
  return s ? `/register?${s}` : "/register";
}
