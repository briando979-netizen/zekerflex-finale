"use client";

import { useState } from "react";
import { ChatPaneel } from "@/components/personeel/ChatPaneel";
import type { PersoneelData } from "@/lib/horeca-personeel/model";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De chat met het personeel in het horeca-beheer: het teamkanaal en een gesprek per medewerker met een actief account. De
// beheerder kan ook een bericht weghalen.
export function BerichtenBeheer({ t, taal, data }: { t: PersoneelTeksten["chat"]; taal: string; data: PersoneelData }) {
  const [kanaal, setKanaal] = useState("team");
  const actief = data.medewerkers.filter((m) => m.status === "actief");
  const bestaat = kanaal === "team" || actief.some((m) => `dm-${m.id}` === kanaal);
  return (
    <section aria-labelledby="pers-chat-b" className="rounded-2xl border border-hair bg-white p-5">
      <h3 id="pers-chat-b" className="font-display text-lg font-bold text-ink">
        {t.kop}
      </h3>
      <div className="mt-3">
        <label htmlFor="pers-chat-kies" className="block text-sm font-medium text-ink">
          {t.gesprek}
        </label>
        <select id="pers-chat-kies" className="mt-1 h-11 w-full rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink sm:w-auto" value={bestaat ? kanaal : "team"} onChange={(e) => setKanaal(e.target.value)}>
          <option value="team">{t.team}</option>
          {actief.map((m) => (
            <option key={m.id} value={`dm-${m.id}`}>
              {m.naam}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <ChatPaneel t={t} taal={taal} url="/api/horeca/personeel/berichten" kanaal={bestaat ? kanaal : "team"} ikIs="beheer" kanVerwijderen />
      </div>
    </section>
  );
}
