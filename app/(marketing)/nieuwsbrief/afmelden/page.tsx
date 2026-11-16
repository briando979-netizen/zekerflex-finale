import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAny } from "@/lib/newsletter/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuwsbrief afmelden", robots: { index: false } };

export default async function AfmeldenPage(
  props: {
    searchParams: Promise<{ token?: string; done?: string; ongeldig?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // Reached directly from a mail link with ?token= → unsubscribe now.
  // Reached via the one-click API redirect → ?done=1 (already unsubscribed) or ?ongeldig=1 (the code did not match).
  // 16 nov 2026: zonder (geldige) code stond hier toch "Je bent afgemeld"; nu staat er hoe je je wel afmeldt.
  let afgemeld = searchParams.done === "1";
  if (searchParams.token && !searchParams.done) {
    afgemeld = await unsubscribeAny(searchParams.token).catch(() => false);
  }
  const ongeldig = !afgemeld && (Boolean(searchParams.token) || searchParams.ongeldig === "1");

  return (
    <div className="hero-ink text-white">
      <div className="shell flex min-h-[60vh] flex-col justify-center py-20 md:py-28">
        <p className="eyebrow text-brand-mint">Nieuwsbrief</p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          {afgemeld ? "Je bent afgemeld" : ongeldig ? "Deze afmeldlink werkt niet" : "Afmelden voor de nieuwsbrief"}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          {afgemeld
            ? "Je ontvangt geen nieuwsbrieven en aankondigingen van ZekerFlex meer. Berichten over je eigen klussen, uren en betalingen blijf je wel krijgen. Van gedachten veranderd? Je kunt je onderaan de homepage opnieuw inschrijven."
            : ongeldig
              ? "We konden je met deze link niet afmelden: de link is onvolledig of klopt niet meer. Gebruik de link Afmelden onderaan de laatste nieuwsbrief die je kreeg, of stuur een mail naar info@zekerflex.com, dan melden we je af."
              : "Om je af te melden gebruik je de link Afmelden onderaan een nieuwsbrief van ZekerFlex. Die link hoort bij jouw e-mailadres. Heb je geen nieuwsbrief bij de hand, stuur dan een mail naar info@zekerflex.com, dan melden we je af."}
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
