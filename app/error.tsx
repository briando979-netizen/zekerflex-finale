"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16 text-center">
      <div className="mx-auto max-w-md">
        <div className="mx-auto mb-5 text-6xl" aria-hidden>
          🛠️
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-warn">Er ging iets mis</p>
        <h1 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">Sorry, dit onderdeel haperde even</h1>
        <p className="mt-4 text-base leading-relaxed text-neutralx-500">
          We hebben de fout gelogd. Probeer het opnieuw — meestal is het zo weer opgelost.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Opnieuw proberen
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
