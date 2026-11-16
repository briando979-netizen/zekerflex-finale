// ---------------------------------------------------------------------------
// Clientlogica van de zuinige poll (14 nov 2026), puur en zonder node: components/chat/InboxPage.tsx gebruikt dit.
// De client onthoudt per open gesprek de `versie` uit het laatste volledige antwoord en stuurt die als ?since= mee.
// Antwoordt de server "ongewijzigd" met dezelfde versie, dan blijft de lijst staan en wordt alleen de aanwezigheid
// bijgewerkt. Bij twijfel (geen versie, een onverwacht antwoord, een "ongewijzigd" zonder dat wij since stuurden) valt de
// client terug op de volledige lijst. Elke lokale wijziging (sturen, bewerken, reageren, intrekken, stemmen) maakt de
// onthouden versie ongeldig, zodat de volgende poll weer de hele lijst haalt en de server het laatste woord houdt.
// Sinds 16 nov ook voor de gesprekslijst (GET /api/inbox, elke 8 s): daar heet de lijst `threads` en wordt hij alleen door
// de poll zelf gezet, dus zonder lokale wijzigingen die de versie ongeldig maken.
// ---------------------------------------------------------------------------

export type PollUitslag =
  | { soort: "ongewijzigd"; versie: string }
  | { soort: "volledig"; versie: string | null }
  /** niet te vertrouwen: haal de volledige lijst zonder since */
  | { soort: "opnieuw-volledig" };

/** Het stukje querystring voor since, achter een querystring die al met "?" begint; leeg zonder onthouden versie. */
export function sinceQuery(versie: string | null | undefined): string {
  return versie ? `&since=${encodeURIComponent(versie)}` : "";
}

/** Een querystring (leeg, of beginnend met "?") met since erachter; zonder versie blijft hij zoals hij was. */
export function metSince(query: string, versie: string | null | undefined): string {
  return versie ? `${query}${query ? "&" : "?"}since=${encodeURIComponent(versie)}` : query;
}

/** Wat de client met een antwoord van GET /api/inbox/<id> (lijstveld `messages`) of GET /api/inbox (`threads`) moet doen. */
export function beoordeelPollAntwoord(d: unknown, gestuurdeSince: string | null, lijstVeld: "messages" | "threads" = "messages"): PollUitslag {
  if (!d || typeof d !== "object") return { soort: "opnieuw-volledig" };
  const r = d as { ongewijzigd?: unknown; versie?: unknown; messages?: unknown; threads?: unknown };
  const versie = typeof r.versie === "string" && r.versie ? r.versie : null;
  if (r.ongewijzigd === true) {
    // alleen geloven als het precies onze eigen versie bevestigt
    return gestuurdeSince && versie === gestuurdeSince ? { soort: "ongewijzigd", versie } : { soort: "opnieuw-volledig" };
  }
  if (Array.isArray(r[lijstVeld])) return { soort: "volledig", versie };
  return { soort: "opnieuw-volledig" };
}
