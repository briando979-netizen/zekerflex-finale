"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Domein } from "@/lib/i18n/domein";

/**
 * De teksten van een domein (lib/i18n/domein.ts) in een clientonderdeel. Een handgemaakte taal staat er meteen; een machinetaal
 * laadt zijn eigen bestand pas als hij gebruikt wordt, en zolang dat duurt (of als het mislukt) staat er Engels. Zelfde gedrag als
 * useFT voor de werkersapp. Geeft de server het woordenboek al mee (`vooraf`, gewone data), dan is er geen Engelse flits.
 */
export function useDomein<T>(domein: Domein<T>, locale: Locale, vooraf?: T): T {
  const vast = domein.vast(locale);
  const [geladen, zetGeladen] = useState<{ taal: string; dict: T } | null>(null);
  useEffect(() => {
    if (vast !== null || vooraf !== undefined) return;
    let weg = false;
    void domein.laad(locale).then((dict) => {
      if (!weg) zetGeladen({ taal: locale, dict });
    });
    return () => {
      weg = true;
    };
  }, [domein, locale, vast, vooraf]);
  if (vast !== null) return vast;
  const taal: string = locale;
  return geladen?.taal === taal ? geladen.dict : (vooraf ?? domein.engels);
}
