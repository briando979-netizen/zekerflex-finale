import type { Metadata } from "next";
import { RijschoolBeheer } from "@/components/rijschool/beheer/RijschoolBeheer";

export const metadata: Metadata = { title: "Rijschool" };
export const dynamic = "force-dynamic";

// Toegang is al afgedwongen in app/werkgever/layout.tsx; de API controleert
// daarnaast dat je de beheerder van het bedrijf bent (lib/rijschool/toegang.ts).
export default function RijschoolPage() {
  return <RijschoolBeheer />;
}
