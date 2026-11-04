"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SLEUTEL = "zf-opbouwfase-gesloten";

// De melding zelf (teksten komen van OpbouwfaseBalk). Wie hem sluit, ziet hem
// op dit apparaat niet meer; zonder opslag blijft hij gewoon staan.
export function OpbouwfaseMelding({ titel, tekst, meer, sluit }: { titel: string; tekst: string; meer: string; sluit: string }) {
  const [gesloten, setGesloten] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(SLEUTEL) === "1") setGesloten(true);
    } catch {
      /* geen opslag: melding blijft staan */
    }
  }, []);
  if (gesloten) return null;
  return (
    <section aria-label={titel} className="mx-auto mt-3 max-w-5xl px-4">
      <div className="flex items-start gap-3 rounded-xl border border-plan/30 bg-plan-soft px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-plan-ink">{titel}</p>
          <p className="mt-0.5 text-neutralx-700">
            {tekst}{" "}
            <Link href="/opbouwfase" className="font-semibold text-plan-ink underline">
              {meer}
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGesloten(true);
            try {
              localStorage.setItem(SLEUTEL, "1");
            } catch {
              /* niet bewaard: volgende keer staat hij er weer */
            }
          }}
          aria-label={sluit}
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-plan-ink hover:bg-plan/10"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
    </section>
  );
}
