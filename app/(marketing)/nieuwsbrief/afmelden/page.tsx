import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAny } from "@/lib/newsletter/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuwsbrief afmelden", robots: { index: false } };

export default async function AfmeldenPage(
  props: {
    searchParams: Promise<{ token?: string; done?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // Reached directly from a mail link with ?token= → unsubscribe now.
  // Reached via the one-click API redirect → ?done=1, already unsubscribed.
  if (searchParams.token && !searchParams.done) {
    await unsubscribeAny(searchParams.token).catch(() => null);
  }

  return (
    <div className="hero-ink text-white">
      <div className="shell flex min-h-[60vh] flex-col justify-center py-20 md:py-28">
        <p className="eyebrow text-brand-mint">Nieuwsbrief</p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          Je bent afgemeld
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          Je ontvangt geen nieuwsbrieven en aankondigingen van ZekerFlex meer. Berichten over je
          eigen klussen, uren en betalingen blijf je wel krijgen. Van gedachten veranderd? Je kunt
          je onderaan de homepage opnieuw inschrijven.
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
