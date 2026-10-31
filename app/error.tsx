"use client";

import Link from "next/link";
import { useEffect } from "react";

// Herkent fouten die ontstaan doordat een oude browser-tab na een nieuwe deploy
// een server-actie of code-chunk opvraagt die niet meer bestaat. Eén harde
// herlaadt haalt de nieuwe build op en lost dat op.
function isStaleDeployment(error: { message?: string; name?: string }): boolean {
  return /Failed to find Server Action|ChunkLoadError|Loading chunk|Loading CSS chunk|from an older or newer deployment/i.test(
    `${error?.name ?? ""} ${error?.message ?? ""}`,
  );
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployment(error);

  useEffect(() => {
    console.error(error);
    // Zelfherstel na een deploy: herlaad één keer (max. 1× per 10s zodat een
    // echt blijvende fout niet in een herlaad-lus belandt).
    if (stale && typeof window !== "undefined") {
      try {
        const key = "zf-stale-reload";
        const last = Number(window.sessionStorage.getItem(key) ?? "0");
        if (Date.now() - last > 10_000) {
          window.sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* sessionStorage kan geblokkeerd zijn — dan gewoon de knop tonen */
      }
    }
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
          {stale
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
