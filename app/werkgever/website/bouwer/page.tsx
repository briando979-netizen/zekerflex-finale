import { redirect } from "next/navigation";
import { bouwerDoorstuurPad } from "@/lib/sites/bouwer-doorsturen";

export const dynamic = "force-dynamic";

// Eén site-bouwer (masterplan Fase 0): de bouwer voor website en webshop is die van de studio. Deze oude
// ingang stuurt door, met alles wat een oude link of een betaalpagina nog meegeeft (?ontwerp=,
// ?bestelling=gelukt&domein=…). Wie geen beheerder is, komt via de studio terug op /werkgever (die laat
// alleen de beheerder bouwen; de API deed dat al).
export default async function WebsiteBouwerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(bouwerDoorstuurPad(await searchParams));
}
