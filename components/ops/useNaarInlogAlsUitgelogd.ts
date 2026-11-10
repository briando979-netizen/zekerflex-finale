"use client";

import { useEffect, useState } from "react";
import { inlogAdres, isIngelogdDeel, sessieIsWeg } from "@/lib/ops/uitgelogd";

/**
 * Voor een foutscherm (app/error.tsx, app/admin/error.tsx): viel een pagina achter een inlog om
 * omdat de sessie net verliep, ga dan naar het inlogscherm met terugkeer in plaats van "Er ging
 * iets mis" (lib/ops/uitgelogd.ts). De echte fouttekst is in productie verborgen, dus we vragen
 * de sessie op: null = uitgelogd. Geeft true terug zodra er wordt doorgestuurd.
 */
export function useNaarInlogAlsUitgelogd(actief = true): boolean {
  const [uitgelogd, setUitgelogd] = useState(false);
  useEffect(() => {
    if (!actief || !isIngelogdDeel(window.location.pathname)) return;
    let weg = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((sessie: unknown) => {
        if (weg || !sessieIsWeg(sessie)) return;
        setUitgelogd(true);
        window.location.replace(inlogAdres(window.location.pathname, window.location.search));
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [actief]);
  return uitgelogd;
}
