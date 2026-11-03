"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONCEPT_KEY, parseConcept, type KlusConcept } from "@/lib/klusconcept/concept";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// On the werkgever home: a klus drafted on /klus-plaatsen before sign-up is
// waiting in this browser. Only reads it; NewShiftForm takes it over (and
// clears it) when the werkgever opens Nieuwe dienst.
export function KlusConceptNudge() {
  const [concept, setConcept] = useState<KlusConcept | null>(null);

  useEffect(() => {
    try {
      setConcept(parseConcept(localStorage.getItem(CONCEPT_KEY), Date.now(), amsterdamDayKey(new Date())));
    } catch {
      /* storage blocked: nothing to show */
    }
  }, []);

  if (!concept) return null;
  const [y, m, d] = concept.date.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  });

  return (
    <div role="status" className="mb-8 flex flex-col gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-neutralx-700">
        <p className="font-semibold text-ink">Je klus van de website staat klaar</p>
        <p className="mt-0.5">
          {concept.title} in {concept.city}, {day} van {concept.start} tot {concept.end}
          {concept.positions > 1 ? `, ${concept.positions} mensen` : ""}.
        </p>
      </div>
      <Link href="/werkgever/diensten/nieuw" className="btn-primary flex-shrink-0 self-start sm:self-auto">
        Zet hem uit
      </Link>
    </div>
  );
}
