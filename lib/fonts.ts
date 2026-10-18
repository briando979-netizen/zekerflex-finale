import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

// Self-hosted at build time by next/font: served from our own origin and
// preloaded, with a size-matched fallback so text doesn't jump when the font
// arrives. Replaces the fonts.googleapis.com stylesheet, which cost an extra
// connection on slow mobile networks (late LCP on the homepage) and sent every
// visitor's IP address to Google (an AVG/GDPR risk).
export const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

export const fontSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const fontVariables = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
