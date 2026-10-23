"use client";

import { useEffect, useState } from "react";

/**
 * Persoonlijke groet bovenaan elk rol-dashboard. Subtiel van opzet — een groet,
 * geen banner. Verrijkt t.o.v. de eerste versie:
 *   • tijd-van-de-dag ("Goedemorgen/middag/avond") op de klok van de bezoeker;
 *   • de állereerste keer in deze browser een warm "Welkom bij ZekerFlex";
 *   • een optionele contextuele subregel (bv. "3 nieuwe klussen voor je klaar").
 *
 * Client-component: de server rendert de vertrouwde "Welkom terug"-tekst
 * (zodat hydratie schoon is) en de browser verfijnt dat na mount.
 */

function greetingFor(hour: number): { word: string; emoji: string } {
  if (hour >= 5 && hour < 12) return { word: "Goedemorgen", emoji: "☀️" };
  if (hour >= 12 && hour < 18) return { word: "Goedemiddag", emoji: "👋" };
  if (hour >= 18 && hour < 23) return { word: "Goedenavond", emoji: "🌙" };
  return { word: "Goedenavond", emoji: "🌙" };
}

export function WelcomeBack({ name, subtitle }: { name?: string | null | undefined; subtitle?: string }) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  // SSR-veilige standaard: gelijk aan de vorige tekst, dus geen hydratie-mismatch.
  const [lead, setLead] = useState<{ word: string; emoji: string }>({ word: "Welkom terug", emoji: "👋" });

  useEffect(() => {
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem("zf:greeted");
      localStorage.setItem("zf:greeted", "1");
    } catch {
      /* privémodus / geblokkeerde opslag — behandel als terugkerende bezoeker */
    }
    setLead(firstVisit ? { word: "Welkom bij ZekerFlex", emoji: "🎉" } : greetingFor(new Date().getHours()));
  }, []);

  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-neutralx-500" suppressHydrationWarning>
        {lead.word}
        {first ? (
          <>
            , <span className="text-ink">{first}</span>
          </>
        ) : null}{" "}
        {lead.emoji}
      </p>
      {subtitle ? (
        <p className="mt-0.5 text-sm text-neutralx-400">{subtitle}</p>
      ) : null}
    </div>
  );
}
