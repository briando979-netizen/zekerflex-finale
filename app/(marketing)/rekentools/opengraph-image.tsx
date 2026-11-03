import { deelkaart, DEELKAART_SIZE } from "@/components/marketing/rekentools/deelkaart";

// Edge runtime, like app/opengraph-image.tsx (the node build of next/og trips
// over Windows paths with a space).
export const runtime = "edge";
export const alt = "Gratis rekentools voor zzp'ers en werkgevers — ZekerFlex";
export const size = DEELKAART_SIZE;
export const contentType = "image/png";

export default function Image() {
  return deelkaart({
    title: "Reken het zelf uit",
    sub: "Je uurtarief als zzp'er, de kosten van een flexkracht en de Wet DBA-check. Gratis, zonder account.",
    example: "Alles wordt in je eigen browser berekend, we bewaren niets",
  });
}
