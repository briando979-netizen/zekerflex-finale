"use client";

import { useState } from "react";
import { ACTIVITEITEN, CATEGORIE_LABEL, type Categorie } from "@/lib/voorstel/schwarzwald";
import { ActiviteitKaart } from "@/components/voorstel/SchwarzwaldCards";

// Activiteitenoverzicht met filterchips. "Binnen" is een eigen filter, want
// bij slecht weer is dat de eerste vraag van elke groep.

type Filter = "alles" | Categorie | "binnen";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "alles", label: "Alles" },
  ...(Object.keys(CATEGORIE_LABEL) as Categorie[]).map((k) => ({ key: k as Filter, label: CATEGORIE_LABEL[k] })),
  { key: "binnen", label: "Binnen (regenproof)" },
];

export function ActiviteitenFilter() {
  const [filter, setFilter] = useState<Filter>("alles");
  const lijst = ACTIVITEITEN.filter((a) =>
    filter === "alles" ? true : filter === "binnen" ? a.binnen === true : a.categorie === filter,
  );

  return (
    <div>
      <div role="group" aria-label="Filter activiteiten" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                on ? "bg-schw-night text-schw-cream" : "bg-white text-schw-night ring-1 ring-schw-night/10 hover:ring-schw-night/30"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-schw-mute" aria-live="polite">
        {lijst.length} {lijst.length === 1 ? "activiteit" : "activiteiten"}
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {lijst.map((a, i) => (
          <ActiviteitKaart key={a.slug} a={a} priority={i < 3} />
        ))}
      </div>
    </div>
  );
}
