import { deelkaart, DEELKAART_SIZE } from "@/components/marketing/rekentools/deelkaart";

// Edge runtime, like app/opengraph-image.tsx (the node build of next/og trips
// over Windows paths with a space).
export const runtime = "edge";
export const alt = "Zzp uurtarief berekenen — gratis rekentool van ZekerFlex";
export const size = DEELKAART_SIZE;
export const contentType = "image/png";

export default function Image() {
  return deelkaart({
    title: "Welk uurtarief heb je nodig?",
    sub: "Van netto inkomen naar uurtarief, met vakantie, ziekte, pensioen, verzekering en belasting erin.",
    example: "Voorbeeld: € 3.000 netto per maand vraagt € 45,21 per uur",
  });
}
