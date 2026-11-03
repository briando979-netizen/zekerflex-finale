// The site's fonts are self-hosted from public/fonts, with the @font-face rules in
// app/fonts.css: the same files, unicode-ranges and size-matched fallbacks that
// next/font/google produced. next/font fetched them from Google on every build,
// and a bad Google response failed the build twice on 3 Nov 2026. Served from
// our own origin and never from Google, so no visitor IP goes there (AVG/GDPR).

/** On <html>: sets --font-display, --font-sans and --font-mono (app/fonts.css). */
export const fontVariables = "zf-fonts";

/** What every page needs first (the latin files), preloaded as next/font did. */
export const FONT_PRELOADS = [
  "/fonts/instrument-sans-latin.6219bc4b.woff2",
  "/fonts/bricolage-grotesque-latin.4fd48b2c.woff2",
  "/fonts/ibm-plex-mono-400-latin.c36f509c.woff2",
  "/fonts/ibm-plex-mono-500-latin.a76f53ca.woff2",
] as const;
