import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribe } from "@/lib/newsletter/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuwsbrief afmelden", robots: { index: false } };

export default async function AfmeldenPage({
  searchParams,
}: {
  searchParams: { token?: string; done?: string };
}) {
  // Reached directly from a mail link with ?token= → unsubscribe now.
  // Reached via the one-click API redirect → ?done=1, already unsubscribed.
  if (searchParams.token && !searchParams.done) {
    await unsubscribe(searchParams.token).catch(() => null);
  }

  return (
    <div className="hero-ink text-white">
      <div className="shell flex min-h-[60vh] flex-col justify-center py-20 md:py-28">
        <p className="eyebrow text-brand-mint">Nieuwsbrief</p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          Je bent afgemeld
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          Je ontvangt de ZekerFlex-nieuwsbrief niet meer. Van gedachten veranderd? Je kunt je
          onderaan de homepage opnieuw inschrijven.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-mint">
            Naar de homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
