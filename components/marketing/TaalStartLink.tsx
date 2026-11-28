"use client";

import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { bewaarTaalKeuze } from "@/components/i18n/I18nProvider";

// Een knop op een pagina in een andere taal (/pl/praca-w-holandii, …, lib/marketing/werken-in-nederland.ts): zet vóór het
// doorgaan dezelfde taalkeuze als de taalknop bij het aanmelden (cookie zf_locale, components/auth/AuthLanguage.tsx), zodat
// aanmelden, de welkomstschermen en de eerste mail meteen in die taal zijn (lib/i18n/aanmeld-taal.ts). Een gewone <a> (volle
// paginalading, dan leest de server het cookie meteen); zonder script gaat de link gewoon door, in het Nederlands met de taalknop.
export function TaalStartLink({ taal, href, className, children }: { taal: Locale; href: string; className: string; children: ReactNode }) {
  return (
    <a href={href} className={className} onClick={() => bewaarTaalKeuze(taal)}>
      {children}
    </a>
  );
}
