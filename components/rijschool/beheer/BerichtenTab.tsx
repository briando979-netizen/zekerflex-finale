"use client";

import { useCallback } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { BerichtRij } from "@/lib/rijschool/berichten-lijst";
import { stuur } from "@/components/rijschool/api";
import { bezorgUitleg, GesprekkenLijst, GesprekPaneel } from "@/components/rijschool/Gesprekken";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";

// Berichten met leerlingen (lib/rijschool/berichten.ts): links de gesprekken,
// ongelezen eerst zichtbaar; rechts het open gesprek. Op de telefoon het een of
// het ander. De leerling krijgt bij een nieuw bericht een mail (hoogstens één
// per kwartier) en antwoordt in de app.

export function BerichtenTab({ data, doe, focus, onFocus }: { data: BeheerWeergave; doe: Doe; focus: string | null; onFocus: (id: string | null) => void }) {
  const open = focus ? data.leerlingen.find((l) => l.id === focus) : undefined;
  const openId = open?.id ?? null;

  const laad = useCallback(
    async () => (await stuur<{ berichten: BerichtRij[] }>(`/api/rijschool/beheer?berichten=${encodeURIComponent(openId ?? "")}`)).berichten,
    [openId],
  );
  const verstuur = useCallback(
    async (tekst: string) => {
      if (openId) await doe({ actie: "bericht", leerlingId: openId, tekst });
    },
    [openId, doe],
  );
  const gelezen = useCallback(async () => {
    if (openId) await doe({ actie: "berichtGelezen", leerlingId: openId });
  }, [openId, doe]);

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <GesprekkenLijst
        className={open ? "hidden lg:block" : ""}
        gesprekken={data.gesprekken}
        kandidaten={data.leerlingen.filter((l) => l.status !== "GESTOPT")}
        focus={focus}
        onFocus={onFocus}
        leeg="Nog geen berichten. Leerlingen kunnen je een bericht sturen vanuit hun app; jij kunt hieronder een gesprek beginnen."
      />
      {open ? (
        <GesprekPaneel
          key={open.id}
          leerlingNaam={open.naam}
          uitleg={`${bezorgUitleg(open)}${open.heeftWachtwoord ? "" : " Nodig de leerling uit bij Leerlingen."}`}
          kleur={data.rijschool.kleur}
          laad={laad}
          verstuur={verstuur}
          gelezen={gelezen}
          onTerug={() => onFocus(null)}
        />
      ) : (
        <p className="card hidden p-5 text-sm text-neutralx-600 lg:block">Kies links een gesprek.</p>
      )}
    </div>
  );
}
