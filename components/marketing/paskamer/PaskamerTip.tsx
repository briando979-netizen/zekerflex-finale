"use client";

import { PaskamerLink } from "@/components/marketing/PaskamerLink";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { bySize } from "@/components/marketing/shop-product";
import { usePaskamerProfiel } from "@/components/marketing/paskamer/usePaskamer";
import { maatAdvies, matenVan, pasvormVoor, type PaskamerVariant } from "@/lib/shop/paskamer";

// Op de productpagina, onder de maten: "Pas aan op je paspop" voor alles wat te
// dragen is, en met een paskamerprofiel op dit toestel meteen jouw maat met een
// knop om die te kiezen. Zonder draagbaar product toont het niets.

export function PaskamerTip({
  product,
  gekozen,
  onKiesMaat,
}: {
  product: { slug: string; name: string; gender?: string | null; variants: PaskamerVariant[] };
  gekozen: string | null;
  onKiesMaat: (maat: string) => void;
}) {
  const t = useT();
  const p = t.paskamer;
  const profiel = usePaskamerProfiel();
  const pasvorm = pasvormVoor({ slug: product.slug, name: product.name, gender: product.gender ?? null, firstColor: product.variants.find((v) => v.color)?.color ?? null });
  if (!pasvorm) return null;
  const opties = matenVan(product, bySize);
  const advies = profiel && opties.length > 0 ? maatAdvies(pasvorm.systeem, opties, profiel.lichaam) : null;

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand-100 bg-mintwash/60 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-600" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.5" r="2.5" />
          <path d="M7 9.5c1.5-1.2 3.2-1.8 5-1.8s3.5.6 5 1.8l-1.2 5.5H8.2zM9.5 15l-.8 6M14.5 15l.8 6M12 21v-6" />
        </svg>
      </span>
      <div className="min-w-0 text-[13px] leading-snug">
        {advies?.maat ? (
          <p className="font-semibold text-ink">{fmt(p.pdpAdvies, { maat: advies.maat })}</p>
        ) : (
          <p className="font-semibold text-ink">{opties.length > 0 ? p.pdpGeenProfiel : p.probeerAan}</p>
        )}
        <p className="mt-0.5 text-neutralx-600">{p.pdpUitleg}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {advies?.maat && advies.maat !== gekozen && (
            <button type="button" onClick={() => onKiesMaat(advies.maat as string)} className="font-bold text-brand-700 underline underline-offset-2">
              {fmt(p.pdpKies, { maat: advies.maat })}
            </button>
          )}
          <PaskamerLink href={`/shop/paskamer?pas=${encodeURIComponent(product.slug)}`} className="font-bold text-brand-700 underline underline-offset-2">
            {p.probeerAan} →
          </PaskamerLink>
        </div>
      </div>
    </div>
  );
}
