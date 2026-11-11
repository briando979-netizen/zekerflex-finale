import Link from "next/link";
import { AANBOD, aanbodHref, PIJLERS, WERK_ZOEKEN } from "@/lib/marketing/aanbod";

// "Waar ben je naar op zoek?" — vier pijlers plus een eigen ingang voor wie
// werk zoekt. Leest uit lib/marketing/aanbod.ts, dus een nieuw product staat
// hier vanzelf bij. Servercomponent: geen JavaScript in de browser.
export function AanbodKiezer({ id = "aanbod", titel = "Waar ben je naar op zoek?" }: { id?: string; titel?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titel`} className="relative scroll-mt-24 bg-paper">
      <div className="shell-4k py-8 md:py-10">
        <div className="max-w-2xl">
          <p className="eyebrow">Alles onder één dak</p>
          <h2 id={`${id}-titel`} className="mt-2 text-balance font-display text-2xl font-bold leading-tight tracking-tight text-ink md:text-[1.75rem]">
            {titel}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-neutralx-600">
            ZekerFlex begon met flexwerk en is uitgegroeid tot één plek voor je hele bedrijf: personeel, je website en klanten,
            software voor jouw branche en je geldzaken. Met één account voor alles.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {PIJLERS.map((p) => {
            const items = AANBOD.filter((a) => a.pijler === p.sleutel);
            return (
              <div key={p.sleutel} className="flex min-w-0 flex-col rounded-2xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.04)]">
                <h3 className="font-display text-lg font-bold text-ink">
                  <Link href={`/aanbod#${p.sleutel}`} className="hover:underline">
                    {p.naam}
                  </Link>
                </h3>
                <p className="mt-1 text-sm leading-snug text-neutralx-600">{p.kort}</p>
                <ul className="mt-4 space-y-1.5 border-t border-hair pt-4 text-sm">
                  {items.map((a) => (
                    <li key={a.slug} className="flex min-w-0 items-baseline gap-2">
                      <span aria-hidden className="text-brand-500">→</span>
                      <Link href={aanbodHref(a)} className="min-w-0 font-medium text-ink hover:underline">
                        {a.naam}
                      </Link>
                      {a.status === "binnenkort" && (
                        <span className="ml-auto flex-shrink-0 rounded-full bg-plan-soft px-2 py-0.5 text-[11px] font-semibold text-plan-ink">Binnenkort</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="flex min-w-0 flex-col rounded-2xl bg-[#0C0E12] p-5 text-white sm:col-span-2 xl:col-span-1">
            <h3 className="font-display text-lg font-bold">
              <Link href="/voor-freelancers" className="hover:underline">
                Ik zoek werk
              </Link>
            </h3>
            <p className="mt-1 text-sm leading-snug text-white/70">Als flexwerker, uitzendkracht of zzp&apos;er. Meedoen is gratis.</p>
            <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm">
              {WERK_ZOEKEN.map((w) => (
                <li key={w.href} className="flex items-baseline gap-2">
                  <span aria-hidden className="text-brand-mint">→</span>
                  <Link href={w.href} className="font-medium text-white hover:underline">
                    {w.naam}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8">
          <Link href="/aanbod" className="text-sm font-semibold text-brand-600 hover:underline">
            Bekijk het hele aanbod →
          </Link>
        </p>
      </div>
    </section>
  );
}
