import type { Metadata } from "next";
import { HorecaBeheer } from "@/components/horeca/beheer/HorecaBeheer";
import { getLocale } from "@/lib/i18n/server";
import { personeelTeksten } from "@/lib/horeca-personeel/teksten";

export const metadata: Metadata = { title: "Horeca" };
export const dynamic = "force-dynamic";

// Toegang is al afgedwongen in app/werkgever/layout.tsx; de API controleert
// daarnaast dat je de beheerder van het bedrijf bent (lib/horeca/toegang.ts).
// De tekst van het tabblad Personeel komt van de server, in de taal van de werkgeversapp.
export default async function HorecaPage() {
  return <HorecaBeheer personeel={personeelTeksten(await getLocale())} />;
}
