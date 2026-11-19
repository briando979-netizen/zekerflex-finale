import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdvertentieResultaat } from "@/components/marketing/advertentie/AdvertentieResultaat";
import { ONTWERPEN, isAdvertentieId, ontwerpVrij } from "@/lib/advertentie/regels";
import { haalAdvertentie, leesPrijzen } from "@/lib/advertentie/store";

// De eigen pagina van één advertentie op maat: zes ontwerpen als voorbeeld (klein, met watermerk, van de beeldroute),
// "Deze wil ik", en na vrijgave de schone bestanden om te downloaden. Het id in het adres is de sleutel: niet in de
// sitemap, niet in zoekmachines, niet in de nachtelijke rondgang (dynamische route).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Je advertentie",
  robots: { index: false, follow: false },
};

export default async function AdvertentieResultaatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdvertentieId(id)) notFound();
  const [ad, prijzen] = await Promise.all([haalAdvertentie(id), leesPrijzen()]);
  if (!ad) notFound();
  return (
    <AdvertentieResultaat
      id={ad.id}
      bedrijf={ad.invoer.bedrijf}
      tekst={ad.tekst}
      status={ad.status}
      keuze={ad.aanvraag ? { ontwerp: ad.aanvraag.ontwerp, pakket: ad.aanvraag.pakket } : null}
      vrij={ONTWERPEN.map((o) => o.nr).filter((nr) => ontwerpVrij(ad, nr))}
      prijzen={prijzen}
    />
  );
}
