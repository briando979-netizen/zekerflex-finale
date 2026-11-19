import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogoResultaat } from "@/components/marketing/logo/LogoResultaat";
import { isAdvertentieId, kleurHex, prijsTekst } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { logosVan } from "@/lib/logo/sjablonen";
import { haalLogo } from "@/lib/logo/store";

// De eigen pagina van één aanvraag bij de logo maker: de logo's als voorbeeld (klein, met watermerk, van de beeldroute)
// op een donker podium, "Deze wil ik", en na vrijgave de schone bestanden. Het id in het adres is de sleutel: niet in de
// sitemap, niet in zoekmachines, niet in de nachtelijke rondgang (dynamische route). Een aanvraag van vóór versie 2 houdt
// zijn zes logo's van toen; de namen van de logo's komen van de server (lib/logo/sjablonen.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Je logo",
  robots: { index: false, follow: false },
};

export default async function LogoResultaatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdvertentieId(id)) notFound();
  const [logo, prijzen] = await Promise.all([haalLogo(id), leesPrijzen()]);
  if (!logo) notFound();
  return <LogoResultaat id={logo.id} naam={logo.invoer.naam} kleur={kleurHex(logo.invoer.kleur)} status={logo.status} gekozen={logo.aanvraag?.logo ?? null} prijs={prijsTekst(prijzen, "logo")} logos={logosVan(logo)} themas={logo.versie === 2} />;
}
