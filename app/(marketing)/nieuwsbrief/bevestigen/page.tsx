import type { Metadata } from "next";
import Link from "next/link";
import { confirm } from "@/lib/newsletter/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nieuwsbrief bevestigen", robots: { index: false } };

export default async function BevestigenPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const result = token ? await confirm(token) : null;
  const ok = Boolean(result);

  return (
    <div className="hero-ink text-white">
      <div className="shell flex min-h-[60vh] flex-col justify-center py-20 md:py-28">
        <p className="eyebrow text-brand-mint">Nieuwsbrief</p>
        <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          {ok ? "Je bent ingeschreven" : "Deze link werkt niet meer"}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          {ok
            ? "Bedankt voor je bevestiging. Je ontvangt vanaf nu de ZekerFlex-nieuwsbrief. Afmelden kan altijd via de link onderaan elke mail."
            : "De bevestigingslink is ongeldig of al gebruikt. Schrijf je opnieuw in als je de nieuwsbrief wilt ontvangen."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-mint">
            Naar de homepage
          </Link>
          <Link href="/kennis" className="btn-ghost-invert">
            Bekijk Kennis
          </Link>
        </div>
      </div>
    </div>
  );
}
