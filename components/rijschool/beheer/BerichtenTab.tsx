"use client";

import { useCallback, useEffect, useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import { voorvertoning, type BerichtRij } from "@/lib/rijschool/berichten-lijst";
import { datumKort, tijd } from "@/lib/rijschool/format";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Gesprek } from "@/components/rijschool/Gesprek";
import { Melding, Veld } from "@/components/rijschool/ui";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";

// Berichten met leerlingen (lib/rijschool/berichten.ts): links de gesprekken,
// ongelezen eerst zichtbaar; rechts het open gesprek. Op de telefoon het een of
// het ander. De leerling krijgt bij een nieuw bericht een mail (hoogstens één
// per kwartier) en antwoordt in de app.

export function BerichtenTab({ data, doe, focus, onFocus }: { data: BeheerWeergave; doe: Doe; focus: string | null; onFocus: (id: string | null) => void }) {
  const [nieuw, setNieuw] = useState("");
  const metGesprek = new Set(data.gesprekken.map((g) => g.leerlingId));
  const zonderGesprek = data.leerlingen.filter((l) => l.status !== "GESTOPT" && !metGesprek.has(l.id)).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const open = focus ? data.leerlingen.find((l) => l.id === focus) : undefined;
  const vandaag = amsterdamDayKey(new Date());

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <section className={`card p-4 ${open ? "hidden lg:block" : ""}`} aria-labelledby="gesprekken-kop">
        <h2 id="gesprekken-kop" className="font-display text-lg font-bold text-ink">
          Gesprekken
        </h2>
        {data.gesprekken.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Nog geen berichten. Leerlingen kunnen je een bericht sturen vanuit hun app; jij kunt hieronder een gesprek beginnen.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair">
            {data.gesprekken.map((g) => (
              <li key={g.leerlingId}>
                <button
                  type="button"
                  onClick={() => onFocus(g.leerlingId)}
                  aria-current={focus === g.leerlingId ? "true" : undefined}
                  className={`flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-paper-soft ${focus === g.leerlingId ? "bg-paper-soft" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${g.ongelezen > 0 ? "font-bold text-ink" : "font-semibold text-ink"}`}>{g.leerlingNaam}</span>
                    <span className="block truncate text-xs text-neutralx-600">
                      {g.laatste.vanLeerling ? "" : "Jij: "}
                      {voorvertoning(g.laatste.tekst, 70)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num text-[0.7rem] text-neutralx-500">{amsterdamDayKey(g.laatste.at) === vandaag ? tijd(g.laatste.at) : datumKort(g.laatste.at)}</span>
                    {g.ongelezen > 0 && (
                      <span className="pill-warn !px-2 !py-0 text-[0.7rem]">
                        {g.ongelezen} nieuw
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {zonderGesprek.length > 0 && (
          <form
            className="mt-4 flex items-end gap-2 border-t border-hair pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (nieuw) onFocus(nieuw);
            }}
          >
            <div className="min-w-0 flex-1">
              <Veld label="Nieuw gesprek met">
                <select className="field-input" value={nieuw} onChange={(e) => setNieuw(e.target.value)}>
                  <option value="">Kies een leerling</option>
                  {zonderGesprek.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.naam}
                    </option>
                  ))}
                </select>
              </Veld>
            </div>
            <button type="submit" className="btn-ghost" disabled={!nieuw}>
              Openen
            </button>
          </form>
        )}
      </section>

      {open ? (
        <GesprekPaneel
          key={open.id}
          leerling={{ id: open.id, naam: open.naam, email: open.email, heeftWachtwoord: open.heeftWachtwoord }}
          kleur={data.rijschool.kleur}
          doe={doe}
          onTerug={() => onFocus(null)}
        />
      ) : (
        <p className="card hidden p-5 text-sm text-neutralx-600 lg:block">Kies links een gesprek.</p>
      )}
    </div>
  );
}

function GesprekPaneel({
  leerling,
  kleur,
  doe,
  onTerug,
}: {
  leerling: { id: string; naam: string; email: string; heeftWachtwoord: boolean };
  kleur: string;
  doe: Doe;
  onTerug: () => void;
}) {
  const [berichten, setBerichten] = useState<BerichtRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      const r = await stuur<{ berichten: BerichtRij[] }>(`/api/rijschool/beheer?berichten=${encodeURIComponent(leerling.id)}`);
      setBerichten(r.berichten);
      // wat de leerling stuurde is nu gelezen (dat ververst ook de lijst met gesprekken)
      if (r.berichten.some((b) => b.vanLeerling && !b.gelezen)) await doe({ actie: "berichtGelezen", leerlingId: leerling.id }).catch(() => undefined);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, [leerling.id, doe]);

  // openen en elke 30 seconden verversen zolang het tabblad zichtbaar is
  useEffect(() => {
    void laad();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void laad();
    }, 30_000);
    return () => clearInterval(t);
  }, [laad]);

  async function verstuur(tekst: string) {
    try {
      await doe({ actie: "bericht", leerlingId: leerling.id, tekst });
    } catch (e) {
      throw new Error(foutVan(e));
    }
    await laad();
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="gesprek-kop">
      <button type="button" className="mb-2 text-sm font-semibold text-brand-600 hover:underline lg:hidden" onClick={onTerug}>
        ← Alle gesprekken
      </button>
      <h2 id="gesprek-kop" className="font-display text-lg font-bold text-ink">
        {leerling.naam}
      </h2>
      <p className="mb-3 text-xs text-neutralx-500">
        {leerling.heeftWachtwoord
          ? "Krijgt een mail bij een nieuw bericht en antwoordt in de app."
          : `Heeft de app nog niet in gebruik: je bericht komt per mail binnen (${leerling.email}). Nodig de leerling uit bij Leerlingen.`}
      </p>
      <Melding fout={fout} />
      {berichten === null ? (
        !fout && <p className="text-sm text-neutralx-500">Laden…</p>
      ) : (
        <Gesprek
          berichten={berichten}
          eigen="school"
          kleur={kleur}
          naamAnder={leerling.naam}
          leeg={`Nog geen berichten met ${leerling.naam}. Schrijf hieronder het eerste bericht.`}
          onStuur={verstuur}
        />
      )}
    </section>
  );
}
