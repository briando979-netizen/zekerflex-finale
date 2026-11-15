"use client";

import Link from "next/link";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import { KLUS_STUK_HREF, type KlusStuk } from "@/lib/onboarding/klaar-voor-klus";

/**
 * Bovenaan Klussen, ná de 5 stappen van de aanmelding (WerkerStartWizard): wat er nog nodig is voordat je op een klus kunt
 * reageren (lib/onboarding/klaar-voor-klus.ts), met per stuk de plek waar je het invult. Zelfde uiterlijk als de stappen,
 * zodat het één doorlopend rijtje is in plaats van een tweede startkaart met andere stappen (15 nov, eigenaar).
 */
export function KlaarVoorKlusKaart({ stukken }: { stukken: KlusStuk[] }) {
  const ft = useFT();
  const t = ft.klaarVoorKlus;
  if (stukken.length === 0) return null;
  const tekst: Record<KlusStuk, { kop: string; hint: string }> = {
    bsn: t.bsn,
    contract: t.contract,
    bedrijf: t.bedrijf,
    iban: t.iban,
    werkrecht: { kop: ft.start.werkrechtStep, hint: ft.start.werkrechtBody },
    idWacht: t.idWacht,
  };
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-hair bg-white shadow-sm" aria-labelledby="klaar-voor-klus-titel">
      <div className="bg-gradient-to-br from-brand-700 via-brand-700 to-brand-500 px-5 pb-8 pt-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{ft.start.eyebrow}</p>
        <h2 id="klaar-voor-klus-titel" className="mt-1 font-display text-2xl font-bold leading-tight">{t.titel}</h2>
        <p className="mt-1 text-sm text-white/85" role="status">
          {stukken.length === 1 ? t.uitlegEen : vulIn(t.uitlegMeer, { n: stukken.length })}
        </p>
      </div>
      <ul className="relative -mt-4 space-y-3 rounded-t-2xl bg-white px-4 pb-4 pt-5">
        {stukken.map((s, i) => {
          const href = KLUS_STUK_HREF[s];
          const wacht = s === "idWacht";
          return (
            <li key={s} className={`flex gap-3 rounded-xl border p-4 ${wacht ? "border-hair bg-paper-soft" : "border-brand-500/40 bg-white shadow-sm"}`}>
              <span
                aria-hidden
                className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${wacht ? "bg-hair text-neutralx-500" : "bg-brand-500 text-white"}`}
              >
                {wacht ? "…" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{tekst[s].kop}</p>
                <p className="mt-0.5 text-xs leading-snug text-neutralx-600">{tekst[s].hint}</p>
                {href && (
                  <Link href={href} className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
                    {t.knop} <span aria-hidden>›</span>
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
