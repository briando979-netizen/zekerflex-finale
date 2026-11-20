"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import type { YoTab } from "@/lib/marketing/yo-home";

// De tabbladen "Eén plek voor al het werk | Zzp en freelance | Uitzendwerk" (naar de site van YoungOnes, 20 nov 2026):
// een pil met drie knoppen, daaronder een foto links en de tekst met twee knoppen rechts, en optioneel de kaart "Vragen?".
// Puur client-onderdeel: alleen welk tabblad open is; de teksten komen van de pagina (lib/marketing/yo-home.ts).

const KNOP = "inline-flex min-h-[48px] items-center justify-center rounded-lg bg-yo-teal px-5 text-base font-bold text-yo-night transition hover:brightness-105";
const KNOP_OMLIJND = "inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-yo-teal px-5 text-base font-bold text-yo-tealInk transition hover:bg-yo-teal/10";

export function YoTabs({
  tabs,
  vragen,
}: {
  tabs: readonly YoTab[];
  vragen?: { kop: string; tekst: string; foto: string; knop: { label: string; href: string }; knop2: { label: string; href: string } };
}) {
  const [actief, setActief] = useState(0);
  const id = useId();
  const tab = tabs[actief] ?? tabs[0];
  if (!tab) return null;
  return (
    <section className="bg-white text-yo-navy">
      <div className="shell-4k py-12 md:py-16">
        <div role="tablist" aria-label={tabs[0]?.label} className="mx-auto flex max-w-3xl flex-col gap-1 rounded-xl bg-yo-grey p-1.5 sm:flex-row">
          {tabs.map((t, i) => {
            const aan = i === actief;
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                id={`${id}-tab-${i}`}
                aria-selected={aan}
                aria-controls={`${id}-paneel`}
                tabIndex={aan ? 0 : -1}
                onClick={() => setActief(i)}
                onKeyDown={(e) => {
                  const stap = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                  if (!stap) return;
                  e.preventDefault();
                  const volgende = (i + stap + tabs.length) % tabs.length;
                  setActief(volgende);
                  document.getElementById(`${id}-tab-${volgende}`)?.focus();
                }}
                className={`min-h-[48px] flex-1 rounded-lg px-4 font-display text-sm font-extrabold uppercase tracking-wide transition ${
                  aan ? "bg-yo-teal text-yo-night" : "text-yo-navy/55 hover:text-yo-navy"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div id={`${id}-paneel`} role="tabpanel" aria-labelledby={`${id}-tab-${actief}`} className="mt-10 grid items-center gap-8 md:grid-cols-2 md:gap-14">
          <div className="relative aspect-[4/5] max-h-[34rem] overflow-hidden rounded-lg">
            <Image key={tab.foto} src={tab.foto} alt={tab.alt} fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" />
          </div>
          <div>
            <h2 className="font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-4xl lg:text-5xl">{tab.titel}</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-yo-navy/80">{tab.tekst}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={tab.knop.href} className={KNOP}>
                {tab.knop.label}
              </Link>
              {tab.knop2 && (
                <Link href={tab.knop2.href} className={KNOP_OMLIJND}>
                  {tab.knop2.label}
                </Link>
              )}
            </div>
            {vragen && (
              <div className="mt-8 flex gap-4 rounded-xl bg-yo-grey p-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                  <Image src={vragen.foto} alt="" fill sizes="80px" className="object-cover" />
                </div>
                <div>
                  <p className="font-display text-lg font-extrabold uppercase">{vragen.kop}</p>
                  <p className="mt-1 text-sm text-yo-navy/80">{vragen.tekst}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={vragen.knop.href} className="inline-flex min-h-[40px] items-center rounded-lg bg-yo-teal px-4 text-sm font-bold text-yo-night">
                      {vragen.knop.label}
                    </Link>
                    <Link href={vragen.knop2.href} className="inline-flex min-h-[40px] items-center rounded-lg border-2 border-yo-teal px-4 text-sm font-bold text-yo-tealInk">
                      {vragen.knop2.label}
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
