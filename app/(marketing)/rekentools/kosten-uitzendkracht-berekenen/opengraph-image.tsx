import { deelkaart, DEELKAART_SIZE } from "@/components/marketing/rekentools/deelkaart";

// Edge runtime, like app/opengraph-image.tsx (the node build of next/og trips
// over Windows paths with a space).
export const runtime = "edge";
export const alt = "Kosten uitzendkracht of zzp'er berekenen — gratis rekentool van ZekerFlex";
export const size = DEELKAART_SIZE;
export const contentType = "image/png";

export default function Image() {
  return deelkaart({
    title: "Wat kost een flexkracht?",
    sub: "Een uitzendbureau naast een zzp'er via ZekerFlex, per uur en voor de hele periode.",
    example: "Voorbeeld: € 30,40 via een bureau, € 28,50 via ZekerFlex",
  });
}
