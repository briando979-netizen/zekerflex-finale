import { BASE, beeld } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// De SmileyApp-app (PWA): het manifest waarmee de site op een telefoon als app
// te installeren is. Geen native app: een snelkoppeling op het beginscherm die
// zonder adresbalk opent, met hun naam, kleuren en het smiley-icoon uit het
// logo (public/voorstel/smileyapp). Op het eigen subdomein begint hij op "/",
// op zekerflex.com op het lange pad. Puur, dus los te testen.
// ---------------------------------------------------------------------------

export function smileyappManifest(subdomein: boolean) {
  const start = subdomein ? "/" : BASE;
  const pad = (p: string) => (subdomein ? p : `${BASE}${p === "/" ? "" : p}`);
  return {
    id: start,
    name: "Smileyapp",
    short_name: "Smileyapp",
    description: "Klanttevredenheid meten met een smiley die je swipet. Ontwerpvoorstel van ZekerFlex.",
    lang: "nl",
    dir: "ltr",
    start_url: start,
    scope: start,
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFBEA",
    theme_color: "#0E2A20",
    categories: ["business", "productivity"],
    icons: [
      { src: beeld("icoon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: beeld("icoon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: beeld("icoon-maskeerbaar-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pakketten", url: `${pad("/")}#pakketten`, icons: [{ src: beeld("icoon-192.png"), sizes: "192x192" }] },
      { name: "Contact", url: pad("/contact"), icons: [{ src: beeld("icoon-192.png"), sizes: "192x192" }] },
    ],
  };
}
