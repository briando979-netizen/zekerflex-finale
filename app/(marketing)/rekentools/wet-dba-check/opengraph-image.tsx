import { deelkaart, DEELKAART_SIZE } from "@/components/marketing/rekentools/deelkaart";

// Edge runtime, like app/opengraph-image.tsx (the node build of next/og trips
// over Windows paths with a space).
export const runtime = "edge";
export const alt = "Wet DBA-check — gratis rekentool van ZekerFlex";
export const size = DEELKAART_SIZE;
export const contentType = "image/png";

export default function Image() {
  return deelkaart({
    title: "Lijkt jouw zzp-opdracht op loondienst?",
    sub: "Doe de Wet DBA-check: gezag, inbedding, duur, vervanging en ondernemerschap.",
    example: "10 vragen · direct je uitkomst met tips",
  });
}
