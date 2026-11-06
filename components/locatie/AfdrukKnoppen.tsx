"use client";

import { useEffect } from "react";

/** Knoppen boven de afdrukpagina van een label; met ?auto=1 opent het afdrukvenster vanzelf. */
export function AfdrukKnoppen({ auto, terug }: { auto: boolean; terug: string }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        🖨 Afdrukken
      </button>
      <a href={terug} className="rounded-lg border border-hairstrong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper-soft">
        Terug
      </a>
      <p className="text-xs text-neutralx-500">Kies in het afdrukvenster de labelprinter en het labelformaat; marges op 0.</p>
    </div>
  );
}
