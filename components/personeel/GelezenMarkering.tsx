"use client";

import { useEffect } from "react";

// Geeft eenmalig door welke mededelingen de medewerker nu op zijn scherm heeft (app/personeel), zodat de beheerder ziet wie ze
// gelezen heeft. Zichtbaar is niets; een mislukte aanroep is niet erg en wordt bij het volgende bezoek herhaald.
export function GelezenMarkering({ ids }: { ids: string[] }) {
  const sleutel = ids.join(",");
  useEffect(() => {
    if (!sleutel) return;
    void fetch("/api/personeel/gelezen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: sleutel.split(",") }) }).catch(() => undefined);
  }, [sleutel]);
  return null;
}
