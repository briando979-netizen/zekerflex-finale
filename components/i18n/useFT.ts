"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";
import { heeftVastWoordenboek, laadFreelancerDict } from "@/lib/i18n/freelancer-lader";

/**
 * Freelancer-app dictionary (NL/EN/PL/RO/UK, plus de machinetalen van de talen-motor) for the current locale. Kept out
 * of I18nProvider so shop and employer pages don't download every worker language; it holds functions, so it can't come
 * from the server as a prop. Een machinetaal laadt zijn eigen bestand pas als hij gebruikt wordt; zolang dat duurt
 * (of als het mislukt) staat er Engels.
 */
export function useFT(): FreelancerDict {
  const { locale } = useI18n();
  const [geladen, zetGeladen] = useState<{ taal: string; dict: FreelancerDict } | null>(null);
  const vast = heeftVastWoordenboek(locale);
  useEffect(() => {
    let weg = false;
    if (!vast) {
      void laadFreelancerDict(locale).then((dict) => {
        if (!weg) zetGeladen({ taal: locale, dict });
      });
    }
    return () => {
      weg = true;
    };
  }, [locale, vast]);
  if (heeftVastWoordenboek(locale)) return FREELANCER_DICTS[locale];
  return geladen?.taal === locale ? geladen.dict : FREELANCER_DICTS.en;
}