import { NextResponse } from "next/server";

export const dynamic = "force-static";

// Het app-manifest van de horeca-schermen: op het beginscherm gezet opent
// /scherm als een eigen app, liggend of staand, zonder adresbalk. Een gekoppeld
// apparaat gaat vanaf /scherm meteen naar zijn eigen scherm.
export function GET(): NextResponse {
  return NextResponse.json(
    {
      name: "ZekerFlex Horeca – schermen",
      short_name: "Schermen",
      description: "Keuken, bar, bediening en ontvangst van je zaak.",
      id: "/scherm",
      start_url: "/scherm",
      scope: "/scherm",
      display: "standalone",
      orientation: "any",
      background_color: "#0B0F0D",
      theme_color: "#0B0F0D",
      lang: "nl-NL",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
