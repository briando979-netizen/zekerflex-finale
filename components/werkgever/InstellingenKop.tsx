"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// De gedeelde kop van elke onderpagina van Instellingen (eigenaar, 23 nov 2026: zoals bij YoungOnes): de titel in hoofdletters, daaronder
// de link "Terug naar instellingen" en rechts een optionele actieknop (bijv. "Nieuwe kostenplaats"). Een onderpagina houdt haar eigen
// adres en inhoud; alleen de kop is overal gelijk. Een clientbestand zonder servercode, zodat een scherm met een eigen dialoog
// (zoals Kostenplaatsen) de knop in de kop zelf kan besturen en een gewone servercomponent hem ook kan tonen.
// De titel is h1 (de pagina heeft er maar één); de link is minstens 44 px hoog om te tikken.

export function InstellingenKop({
  title,
  subtitle,
  action,
  backHref = "/werkgever/instellingen",
}: {
  title: string;
  subtitle?: string | undefined;
  /** de actieknop rechtsboven; wikkelt op een smal scherm onder de titel */
  action?: ReactNode;
  backHref?: string;
}) {
  const s = useT().settings;
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="break-words font-display text-xl font-bold uppercase tracking-tight text-ink sm:text-2xl">{title}</h1>
        <Link href={backHref} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
          <span aria-hidden>←</span>
          {s.back}
        </Link>
        {subtitle ? <p className="max-w-2xl text-sm text-neutralx-600">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
