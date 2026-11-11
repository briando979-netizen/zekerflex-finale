import type { Metadata } from "next";
import { naarOpenbaar } from "@/lib/offertes/model";
import { offerteVanToken } from "@/lib/offertes/store";
import { OfferteKlantScherm } from "@/components/offertes/OfferteKlantScherm";

export const dynamic = "force-dynamic";

// /offerte/<token>: de klant bekijkt een offerte en gaat akkoord of wijst af. De geheime link is de sleutel. Niet voor
// zoekmachines, en zonder referrer, zodat de link nergens in een kop van een andere site terechtkomt.

export const metadata: Metadata = { title: "Offerte", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

export default async function OffertePagina({ params }: Props) {
  const { token } = await params;
  const gevonden = await offerteVanToken(token);
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-soft px-4 py-10 sm:py-14">
      <div className="w-full max-w-3xl">
        {gevonden ? (
          <OfferteKlantScherm token={token} begin={naarOpenbaar(gevonden.offerte, new Date())} />
        ) : (
          <div className="rounded-xl border border-hair bg-white p-6">
            <h1 className="font-display text-xl font-bold text-ink">Deze offerte is niet beschikbaar</h1>
            <p className="mt-2 text-sm text-neutralx-600">De link klopt niet, of het bedrijf heeft de offerte ingetrokken of vervangen. Vraag het bedrijf om een nieuwe link.</p>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-neutralx-500">Offerte via ZekerFlex namens het bedrijf. Je gegevens gaan alleen naar dit bedrijf.</p>
      </div>
    </main>
  );
}
