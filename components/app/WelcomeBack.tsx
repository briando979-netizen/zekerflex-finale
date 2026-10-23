"use client";

import { useEffect, useState } from "react";

/**
 * Persoonlijke groet bovenaan elk rol-dashboard. Subtiel van opzet — een groet,
 * geen banner.
 *   • tijd-van-de-dag ("Goedemorgen/middag/avond") op de klok van de bezoeker;
 *   • de állereerste keer in deze browser een warm "Welkom bij ZekerFlex";
 *   • op je verjaardag "Gefeliciteerd, <naam>! 🎂" (occasion="birthday");
 *   • een optionele contextuele subregel.
 *
 * Client-component: de server rendert de vertrouwde "Welkom terug"-tekst (zodat
 * hydratie schoon is) en de browser verfijnt dat na mount. `labels` localiseert
 * de groet (freelancer-app); zonder labels valt het terug op Nederlands, zodat
 * werkgever/admin/sales ongewijzigd blijven.
 */

export interface GreetLabels {
  morning: string;
  afternoon: string;
  evening: string;
  firstVisit: string;
  back: string;
  birthday: string;
}

const DUTCH: GreetLabels = {
  morning: "Goedemorgen",
  afternoon: "Goedemiddag",
  evening: "Goedenavond",
  firstVisit: "Welkom bij ZekerFlex",
  back: "Welkom terug",
  birthday: "Gefeliciteerd",
};

function greetingFor(hour: number, L: GreetLabels): { word: string; emoji: string } {
  if (hour >= 5 && hour < 12) return { word: L.morning, emoji: "☀️" };
  if (hour >= 12 && hour < 18) return { word: L.afternoon, emoji: "👋" };
  return { word: L.evening, emoji: "🌙" };
}

type Lead = { word: string; emoji: string; bang: boolean };

export function WelcomeBack({
  name,
  subtitle,
  labels,
  occasion,
}: {
  name?: string | null | undefined;
  subtitle?: string;
  labels?: GreetLabels;
  occasion?: "birthday";
}) {
  const L = labels ?? DUTCH;
  const first = (name ?? "").trim().split(/\s+/)[0];
  // SSR-veilige standaard: gelijk aan de vorige tekst (of de verjaardag, die
  // prop-gedreven is), dus geen hydratie-mismatch.
  const [lead, setLead] = useState<Lead>(
    occasion === "birthday" ? { word: L.birthday, emoji: "🎂", bang: true } : { word: L.back, emoji: "👋", bang: false },
  );

  useEffect(() => {
    if (occasion === "birthday") return; // verjaardag blijft staan
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem("zf:greeted");
      localStorage.setItem("zf:greeted", "1");
    } catch {
      /* privémodus / geblokkeerde opslag — behandel als terugkerende bezoeker */
    }
    setLead(
      firstVisit ? { word: L.firstVisit, emoji: "🎉", bang: false } : { ...greetingFor(new Date().getHours(), L), bang: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasion]);

  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-neutralx-500" suppressHydrationWarning>
        {lead.word}
        {first ? (
          <>
            , <span className="text-ink">{first}</span>
          </>
        ) : null}
        {lead.bang ? "!" : ""} {lead.emoji}
      </p>
      {subtitle ? <p className="mt-0.5 text-sm text-neutralx-400">{subtitle}</p> : null}
    </div>
  );
}
