import Image from "next/image";
import Link from "next/link";
import { voordeurTegels } from "@/lib/marketing/voordeur";

// "Wat wil je doen?": de voordeur voor bedrijven bovenaan /bedrijven (masterplan Fase 1). Vijf tegels, één
// per product; "Start" maakt het bedrijf met het juiste dashboard aan (/register?type=bedrijf&dashboard=…).
// Servercomponent, geen JavaScript in de browser. Compact: de foto's klein, alles in één blik.
export function BedrijvenVoordeur() {
  const tegels = voordeurTegels();
  return (
    <section id="start" aria-labelledby="voordeur-titel" className="relative scroll-mt-24 bg-paper">
      <div className="shell-4k py-8 md:py-10">
        <div className="max-w-2xl">
          <p className="eyebrow">Start gratis</p>
          <h2 id="voordeur-titel" className="mt-2 text-balance font-display text-2xl font-bold leading-tight tracking-tight text-ink md:text-[1.75rem]">
            Wat wil je doen?
          </h2>
          <p className="mt-2 text-base leading-relaxed text-neutralx-600">
            Kies waar je mee begint. Later neem je er een product bij en wissel je zonder alles opnieuw in te vullen.
          </p>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {tegels.map((t) => (
            <li key={t.soort} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-[0_1px_2px_rgba(10,18,14,0.04)] last:col-span-2 md:last:col-span-1">
              <div className="relative aspect-[16/10] bg-paper-soft">
                <Image src={t.foto.pad} alt={t.foto.alt} fill sizes="(min-width: 1280px) 18vw, (min-width: 768px) 30vw, 46vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-display text-lg font-bold text-ink">{t.titel}</h3>
                <p className="mt-1 text-sm leading-snug text-neutralx-600">{t.regel}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  <Link href={t.startHref} className="btn-primary px-4 py-2 text-sm">
                    Start gratis
                  </Link>
                  <Link href={t.meerHref} className="text-sm font-semibold text-ink underline-offset-2 hover:underline">
                    Meer
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
