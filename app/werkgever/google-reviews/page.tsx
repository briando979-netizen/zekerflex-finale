import { GoogleReviews } from "@/components/app/GoogleReviews";

export const dynamic = "force-dynamic";

// Toegang is al afgedwongen in app/werkgever/layout.tsx; de API (lib/review-requests/store.ts)
// laat alleen de beheerder van het bedrijf instellingen opslaan en verzoeken sturen.
export default function GoogleReviewsPage() {
  return <GoogleReviews />;
}
