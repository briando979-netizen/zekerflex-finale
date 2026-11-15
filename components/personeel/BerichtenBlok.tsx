"use client";

import { useState } from "react";
import { ChatPaneel } from "@/components/personeel/ChatPaneel";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De chat in de omgeving van een medewerker (app/personeel): het teamkanaal en het eigen gesprek met de beheerder.
export function BerichtenBlok({ t, taal }: { t: PersoneelTeksten["chat"]; taal: string }) {
  const [kanaal, setKanaal] = useState<"team" | "beheer">("team");
  return (
    <section aria-labelledby="pers-chat" className="space-y-3">
      <h2 id="pers-chat" className="font-display text-xl font-bold text-ink">
        {t.kop}
      </h2>
      <div role="tablist" aria-label={t.kop} className="flex gap-1 border-b border-hair">
        {(["team", "beheer"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kanaal === k}
            onClick={() => setKanaal(k)}
            className={`min-h-[44px] px-4 text-sm font-semibold ${kanaal === k ? "border-b-2 border-brand-500 text-ink" : "text-neutralx-500 hover:text-ink"}`}
          >
            {k === "team" ? t.team : t.metBeheer}
          </button>
        ))}
      </div>
      {kanaal === "team" && <p className="text-xs text-neutralx-500">{t.teamUitleg}</p>}
      <ChatPaneel t={t} taal={taal} url="/api/personeel/berichten" kanaal={kanaal} />
    </section>
  );
}
