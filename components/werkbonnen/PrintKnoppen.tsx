"use client";

/** Knoppen boven de afdrukpagina van een werkbon; ze verdwijnen bij het afdrukken. */
export function PrintKnoppen({ terug }: { terug: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="btn-primary px-4 py-2 text-sm">
        Afdrukken
      </button>
      <a href={terug} className="rounded-lg border border-hairstrong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper-soft">
        Terug naar de werkbonnen
      </a>
    </div>
  );
}
