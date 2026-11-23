"use client";

import type { ReactNode } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { PaginaKop } from "@/components/werkgever/PaginaKop";

// De gedeelde kop van elke onderpagina van Instellingen (eigenaar, 23 nov 2026: zoals bij YoungOnes): de titel in hoofdletters, daaronder
// de link "Terug naar instellingen" en rechts een optionele actieknop (bijv. "Nieuwe kostenplaats"). Een onderpagina houdt haar eigen
// adres en inhoud; alleen de kop is overal gelijk. Het is dezelfde kop als op de andere pagina's van de werkgeversapp
// (components/werkgever/PaginaKop.tsx), met de link terug erbij; dit bestand haalt alleen de tekst van die link uit het woordenboek.
// Een clientbestand zonder servercode, zodat een scherm met een eigen dialoog (zoals Kostenplaatsen) de knop in de kop zelf kan besturen
// en een gewone servercomponent hem ook kan tonen.

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
  return <PaginaKop title={title} subtitle={subtitle} action={action} terug={{ href: backHref, label: s.back }} />;
}
