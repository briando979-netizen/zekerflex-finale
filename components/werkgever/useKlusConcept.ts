"use client";

import { useEffect, useState } from "react";
import { CONCEPT_KEY, parseConcept, type KlusConcept } from "@/lib/klusconcept/concept";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

/**
 * Het klusconcept van /klus-plaatsen voor een scherm van de werkgever: eerst uit deze browser, anders het exemplaar
 * dat bij het aanmelden op de server is bewaard (lib/klusconcept/server-opslag.ts; bevestigingsmail op een ander
 * apparaat geopend). Een verlopen concept of een datum in het verleden telt niet.
 *
 * `wis`: dit formulier neemt het concept over, dus de kopie in deze browser mag weg (de server wist de zijne zodra de
 * klus is geplaatst, createShiftAction). Zonder `wis` alleen lezen, voor een melding of om de plaats voor te stellen.
 * Eén formulier per scherm met `wis`: anders pakt het eerste het concept en blijft het tweede leeg (22 nov 2026: het
 * dichtgeklapte uitgebreide formulier nam het concept weg onder "Snel een klus plaatsen").
 */
export function useKlusConcept({ aan = true, wis = false }: { aan?: boolean; wis?: boolean } = {}): KlusConcept | null {
  const [concept, setConcept] = useState<KlusConcept | null>(null);

  useEffect(() => {
    if (!aan) return;
    const vandaag = amsterdamDayKey(new Date());
    let lokaal: KlusConcept | null = null;
    try {
      const raw = localStorage.getItem(CONCEPT_KEY);
      lokaal = parseConcept(raw, Date.now(), vandaag);
      if (raw && wis) localStorage.removeItem(CONCEPT_KEY);
    } catch {
      /* opslag geblokkeerd: dan alleen de server */
    }
    if (lokaal) {
      setConcept(lokaal);
      return;
    }
    let actief = true;
    const ctrl = new AbortController();
    fetch("/api/werkgever/klus-concept", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { concept?: unknown } | null) => {
        if (actief && d?.concept) setConcept(parseConcept(JSON.stringify(d.concept), Date.now(), vandaag));
      })
      .catch(() => undefined);
    return () => {
      actief = false;
      ctrl.abort();
    };
  }, [aan, wis]);

  return concept;
}
