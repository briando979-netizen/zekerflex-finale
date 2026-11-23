import Link from "next/link";
import type { ReactNode } from "react";
import { KOP_TERUG, KOP_TITEL } from "@/components/werkgever/bouwstenen";

// De ene kop van elke pagina in de werkgeversapp (eigenaar, 23 nov 2026: zoals het dashboard van YoungOnes): de titel in
// hoofdletters, daaronder een optionele link terug, een optionele regel uitleg, en rechts één plek voor de actieknop.
// Zonder hooks en zonder servercode, dus een servercomponent én een clientcomponent kunnen hem tonen. De actieplek is een
// ReactNode, geen functie (een servercomponent geeft geen functie door aan een clientcomponent).
// De props heten zoals bij PageHeader (components/app/ui.tsx), zodat een pagina alleen de kop wisselt; `eyebrow` wordt
// aangenomen maar niet getoond (de zijbalk zegt al waar je bent).

export function PaginaKop({
  title,
  subtitle,
  action,
  terug,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  /** niet getoond; bestaat zodat een pagina die van PageHeader kwam niets hoeft te schrappen */
  eyebrow?: string | undefined;
  /** de actieknop rechtsboven; wikkelt op een smal scherm onder de titel */
  action?: ReactNode;
  /** de link onder de titel, bijvoorbeeld "Terug naar instellingen" */
  terug?: { href: string; label: string } | undefined;
  /** een regel onder de kop die meer is dan platte tekst */
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className={KOP_TITEL}>{title}</h1>
        {terug ? (
          <Link href={terug.href} className={KOP_TERUG}>
            <span aria-hidden>←</span>
            {terug.label}
          </Link>
        ) : null}
        {subtitle ? <p className={`${terug ? "" : "mt-2 "}max-w-2xl text-sm leading-relaxed text-neutralx-600`}>{subtitle}</p> : null}
        {children}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
