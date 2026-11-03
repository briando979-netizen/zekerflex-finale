import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reviewByToken } from "@/lib/review-requests/store";
import { ReviewFlow } from "@/components/reviews/ReviewFlow";

export const dynamic = "force-dynamic";

// /review/<token> — a customer gives the company stars, then chooses: share it
// on Google, and/or tell the company privately what can be better. Both options
// are there for every score (no review gating, lib/review-requests/shared.ts).

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await reviewByToken((await params).token);
  return { title: found ? `Je ervaring met ${found.settings.naam}` : "Review", robots: { index: false, follow: false } };
}

export default async function ReviewPage({ params }: Props) {
  const { token } = await params;
  const found = await reviewByToken(token);
  if (!found) notFound();
  const { req, settings } = found;
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-soft px-4 py-12 sm:items-center">
      <div className="w-full max-w-lg">
        <ReviewFlow token={token} bedrijf={settings.naam} voornaam={req.naam.split(/\s+/)[0] ?? ""} hasGoogle={Boolean(settings.googleUrl)} initialRating={req.rating} feedbackSent={Boolean(req.feedback)} />
        <p className="mt-6 text-center text-xs text-neutralx-500">Verstuurd via ZekerFlex namens {settings.naam}. Je gegevens worden alleen gebruikt voor deze vraag.</p>
      </div>
    </main>
  );
}
