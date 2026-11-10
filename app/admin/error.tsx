"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useNaarInlogAlsUitgelogd } from "@/components/ops/useNaarInlogAlsUitgelogd";

// Foutgrens voor het beheer: valt één beheerpagina om, dan blijft de
// beheeromgeving (menu, bovenbalk) staan en zie je hier wat er is, met een knop
// om het opnieuw te proberen. Zonder dit bestand nam app/error.tsx het over en
// was je de hele beheeromgeving kwijt. De fout gaat net als daar naar het
// foutenlogboek (Admin → Systeem → Foutmeldingen).
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // sessie net verlopen: naar het inlogscherm met terugkeer (lib/ops/uitgelogd.ts)
  const uitgelogd = useNaarInlogAlsUitgelogd();
  useEffect(() => {
    console.error(error);
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: error?.message ?? String(error),
          stack: error?.stack ?? "",
          digest: error?.digest ?? "",
          url: typeof window !== "undefined" ? window.location.origin + window.location.pathname : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      }).catch(() => undefined);
    } catch {
      /* rapporteren mag nooit zelf crashen */
    }
  }, [error]);

  return (
    <div role="alert" className="mx-auto my-10 max-w-xl rounded-2xl border border-crit/30 bg-crit/5 p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-crit">Dit onderdeel haperde</p>
      <h1 className="mt-2 text-xl font-bold text-ink">{uitgelogd ? "Je bent uitgelogd" : "De pagina kon niet worden geladen"}</h1>
      <p className="mt-2 text-sm text-neutralx-700">
        De fout is in het foutenlogboek gezet (Systeem → Foutmeldingen). Probeer het opnieuw; blijft het misgaan, kijk dan daar wat er staat.
      </p>
      {error?.digest && <p className="mt-2 font-mono text-xs text-neutralx-500">kenmerk {error.digest}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => reset()} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
          Opnieuw proberen
        </button>
        <Link href="/admin" className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold text-ink">
          Naar het beheer
        </Link>
        <Link href="/admin/systeem" className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold text-ink">
          Foutmeldingen bekijken
        </Link>
      </div>
    </div>
  );
}
