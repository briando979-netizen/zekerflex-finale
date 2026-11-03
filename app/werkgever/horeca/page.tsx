import type { Metadata } from "next";
import { HorecaBeheer } from "@/components/horeca/beheer/HorecaBeheer";

export const metadata: Metadata = { title: "Horeca" };
export const dynamic = "force-dynamic";

// Toegang is al afgedwongen in app/werkgever/layout.tsx; de API controleert
// daarnaast dat je de beheerder van het bedrijf bent (lib/horeca/toegang.ts).
export default function HorecaPage() {
  return <HorecaBeheer />;
}
