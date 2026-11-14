"use client";

import Link from "next/link";
import { useEffect } from "react";
import { isStaleDeployment } from "@/lib/ops/stale-deployment";
import { magStaleHerladen, tabOpslag } from "@/lib/ops/stale-herlaad";
import { useNaarInlogAlsUitgelogd } from "@/components/ops/useNaarInlogAlsUitgelogd";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployment(error);
  // sessie net verlopen op een pagina achter een inlog: naar het inlogscherm, niet "Er ging iets mis"
  const uitgelogd = useNaarInlogAlsUitgelogd(!stale);

  useEffect(() => {
    console.error(error);
    // Stuur de echte fout naar de server zodat die in de logs komt en
    // diagnosticeerbaar is (de boundary belooft "we hebben de fout gelogd").
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: error?.message ?? String(error),
          stack: error?.stack ?? "",
          digest: error?.digest ?? "",
          // Zonder querystring: daar kunnen tokens in staan (bv. wachtwoord herstellen).
          url: typeof window !== "undefined" ? window.location.origin + window.location.pathname : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      }).catch(() => undefined);
    } catch {
      /* rapporteren mag nooit zelf crashen */
    }
    // Zelfherstel na een deploy: herlaad één keer (max. 1× per 10s zodat een
    // echt blijvende fout niet in een herlaad-lus belandt).
    if (stale && magStaleHerladen(tabOpslag(), Date.now())) window.location.reload();
  }, [error, stale]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16 text-center">
      <div className="mx-auto max-w-md">
        <div className="mx-auto mb-5 text-6xl" aria-hidden>
          🛠️
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-warn">Er ging iets mis</p>
        <h1 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">Sorry, dit onderdeel haperde even</h1>
        <p className="mt-4 text-base leading-relaxed text-neutralx-500">
          {uitgelogd
            ? "Je bent uitgelogd. We brengen je naar het inlogscherm…"
            : stale
              ? "Er is net een update uitgebracht. We vernieuwen de pagina even voor je…"
              : "We hebben de fout gelogd. Probeer het opnieuw — meestal is het zo weer opgelost."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => (stale ? window.location.reload() : reset())}
            className="btn-primary"
          >
            {stale ? "Pagina vernieuwen" : "Opnieuw proberen"}
          </button>
          <Link href="/" className="btn-ghost">
            Naar de homepage
          </Link>
        </div>
        {error?.digest && <p className="mt-10 font-mono text-xs text-neutralx-400">Foutcode: {error.digest}</p>}
      </div>
    </main>
  );
}
