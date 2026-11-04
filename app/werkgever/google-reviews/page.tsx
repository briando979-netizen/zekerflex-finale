import { GoogleReviews } from "@/components/app/GoogleReviews";
import { ReviewScan } from "@/components/reviews/ReviewScan";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getReviewSettings } from "@/lib/review-requests/store";

export const dynamic = "force-dynamic";

// Toegang is al afgedwongen in app/werkgever/layout.tsx; de API (lib/review-requests/store.ts)
// laat alleen de beheerder van het bedrijf instellingen opslaan en verzoeken sturen.
// Daaronder de review-scan (lib/review-scan): hoe sta je ervoor, en wat kan beter.
export default async function GoogleReviewsPage() {
  const p = await requirePrincipal();
  const tenantId = (await resolveEmployerScope(p)).tenantIds[0];
  const instellingen = tenantId ? await getReviewSettings(tenantId, p.email).catch(() => null) : null;
  // de opgeslagen reviewlink (g.page/r/…) wijst naar het eigen bedrijf; anders de bedrijfsnaam
  const start = instellingen?.googleUrl ?? instellingen?.naam ?? "";
  return (
    <div className="space-y-10">
      <div id="verzoeken" className="scroll-mt-24">
        <GoogleReviews />
      </div>
      <section aria-labelledby="review-scan-kop" className="space-y-4">
        <header>
          <p className="eyebrow">Review-scan</p>
          <h2 id="review-scan-kop" className="mt-1 font-display text-2xl font-bold text-ink">
            Hoe sta je ervoor op Google?
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
            Je reviewscore, hoe je het doet tegenover bedrijven in de buurt, wat klanten zeggen, wat je kunt verbeteren en per review een voorstel voor je antwoord.
          </p>
        </header>
        <ReviewScan variant="werkgever" startInvoer={start} />
      </section>
    </div>
  );
}
