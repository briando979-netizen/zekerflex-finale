import { requirePrincipal } from "@/lib/auth";
import { OffertesBeheer } from "@/components/offertes/OffertesBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Offertes: een offerte maken, een link delen en zien of de klant akkoord is of afwijst. Er wordt niets gemaild:
// je kopieert de link en stuurt hem zelf. De klant opent /offerte/<link>.
export default async function OffertesPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Offertes</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Maak een offerte met regels, btw en korting, deel de link met je klant en zie of hij akkoord gaat.</p>
      <OffertesBeheer />
    </div>
  );
}
