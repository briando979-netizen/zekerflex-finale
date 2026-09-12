import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Served at /manifest.webmanifest; Next auto-injects <link rel="manifest">.
// This is what makes ZekerFlex installable and what Bubblewrap / PWABuilder
// read to build the Play Store bundle — see docs/MOBILE-APP.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.shortDescription,
    id: "/",
    start_url: "/start?utm_source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FCFCFA",
    theme_color: "#0C0E12",
    lang: "nl-NL",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Mijn klussen", url: "/dashboard/klussen" },
      { name: "Uren", url: "/dashboard/uren" },
      { name: "Diensten uitzetten", url: "/werkgever/diensten/nieuw" },
    ],
  };
}
