"use client";

import { useEffect } from "react";
import { vertaalFoutBody, type FoutTeksten } from "@/lib/i18n/fout-vertaal";

// Foutmeldingen van de server in de taal van de werker (lib/i18n/fouten.ts). Elke component in de werker-app toont
// `data.error.message`; in plaats van die ruim tweehonderd plekken aan te passen, vertaalt dit één keer het antwoord: een
// mislukte /api-aanroep met een bekende `error.sleutel` krijgt de tekst in de app-taal als `error.message`. Een onbekende
// sleutel, een geslaagd antwoord of een andere aanroep blijft ongemoeid (dan staat er gewoon de Nederlandse message).
// Alleen in de werker-layout geplaatst: opdrachtgever en beheer blijven Nederlands. Statuscode en kop blijven gelijk.

const g = globalThis as typeof globalThis & { __zfFoutVertaler?: { teksten: FoutTeksten } };

export function installeer(teksten: FoutTeksten): void {
  if (typeof window === "undefined") return;
  if (g.__zfFoutVertaler) {
    g.__zfFoutVertaler.teksten = teksten;
    return;
  }
  g.__zfFoutVertaler = { teksten };
  const echt = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const res = await echt(...args);
    try {
      const state = g.__zfFoutVertaler;
      if (res.ok || !state || Object.keys(state.teksten).length === 0) return res;
      if (!(res.headers.get("content-type") ?? "").includes("json")) return res;
      const url = new URL(res.url || (args[0] instanceof Request ? args[0].url : String(args[0])), window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return res;
      const vertaald = vertaalFoutBody(await res.clone().json(), state.teksten);
      if (!vertaald) return res;
      const kopjes = new Headers(res.headers);
      kopjes.delete("content-length");
      return new Response(JSON.stringify(vertaald), { status: res.status, statusText: res.statusText, headers: kopjes });
    } catch {
      return res;
    }
  };
}

/** Geen uitvoer; alleen de teksten van deze taal klaarzetten. Rendert vóór de onderdelen eronder, dus vóór hun eerste aanroep. */
export function FoutVertaler({ texts }: { texts: FoutTeksten }) {
  installeer(texts);
  // verlaat de gebruiker de werker-app (naar de opdrachtgeversomgeving), dan vertalen we niets meer
  useEffect(() => {
    installeer(texts);
    return () => {
      if (g.__zfFoutVertaler) g.__zfFoutVertaler.teksten = {};
    };
  }, [texts]);
  return null;
}
