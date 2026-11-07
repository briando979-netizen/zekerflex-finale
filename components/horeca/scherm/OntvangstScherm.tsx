"use client";

import { useState, type FormEvent } from "react";
import { minuten } from "@/lib/horeca/reserveren";
import { RES_STATUS, tijdTot } from "@/components/horeca/live/teksten";
import { ZaalTegels } from "@/components/horeca/live/ZaalTegels";
import type { ReserveringStatus } from "@/components/horeca/live/types";
import { Knop, Leeg, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// De ontvangst (gastvrouw, tablet): links de reserveringen van vandaag op tijd
// met aankomst in één tik en een tafel kiezen, rechts de zaal live en inloop
// (gasten zonder reservering) direct aan een tafel zetten.
// ---------------------------------------------------------------------------

type Filter = "verwacht" | "binnen" | "alles";
const FILTERS: { id: Filter; label: string; past: (s: ReserveringStatus) => boolean }[] = [
  { id: "verwacht", label: "Verwacht", past: (s) => s === "BEVESTIGD" },
  { id: "binnen", label: "Binnen", past: (s) => s === "AANGEKOMEN" },
  { id: "alles", label: "Alles", past: () => true },
];

export function OntvangstScherm({ data, doe }: SchermProps) {
  const [filter, setFilter] = useState<Filter>("verwacht");
  const [personen, setPersonen] = useState(2);
  const [naam, setNaam] = useState("");
  const [tafelId, setTafelId] = useState("");
  const reserveringen = data.reserveringen ?? [];
  const tafels = data.tafels ?? [];
  const zaal = data.zaal ?? [];
  const nuMin = data.nu?.minuten ?? 0;
  const vrij = zaal.filter((t) => t.staat === "vrij" || t.staat === "gereserveerd");
  const lijst = reserveringen.filter((r) => FILTERS.find((f) => f.id === filter)?.past(r.status)).sort((a, b) => minuten(a.tijd) - minuten(b.tijd));
  const telling = (f: Filter) => reserveringen.filter((r) => FILTERS.find((x) => x.id === f)?.past(r.status)).reduce((s, r) => s + r.personen, 0);

  async function inloop(e: FormEvent) {
    e.preventDefault();
    if (await doe({ actie: "inloop", personen, naam, tafelId: tafelId || null }, `Inloop van ${personen} ${personen === 1 ? "persoon" : "personen"} ingeboekt.`)) {
      setNaam("");
      setTafelId("");
      setPersonen(2);
    }
  }

  return (
    <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[1.2fr_1fr]">
      <section aria-labelledby="vandaag-kop" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="vandaag-kop" className="font-display text-2xl font-bold text-white">
            Vandaag
          </h2>
          <div role="group" aria-label="Toon" className="flex gap-1 rounded-xl bg-white/5 p-1">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-lg px-3 py-2 text-sm font-bold ${filter === f.id ? "bg-white text-[#0B0F0D]" : "text-[#B8C4BD]"}`}>
                {f.label} <span className="tabular-nums opacity-70">{telling(f.id)}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {lijst.length === 0 && <Leeg>{filter === "verwacht" ? "Niemand meer verwacht." : "Niets om te tonen."}</Leeg>}
          {lijst.map((r) => {
            const te = r.status === "BEVESTIGD" && minuten(r.tijd) < nuMin - 10;
            return (
              <li key={r.id} className={`rounded-2xl p-4 ring-1 ${te ? "bg-[#3A2203] ring-[#F59E0B]" : r.status === "BEVESTIGD" ? "bg-[#13254A] ring-[#3B82F6]/50" : "bg-white/[0.04] ring-white/10"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xl font-bold text-white">
                    <span className="tabular-nums">{r.tijd}</span> · {r.naam}
                  </p>
                  <p className="text-lg font-semibold text-white">
                    {r.personen} <span className="text-sm text-[#B8C4BD]">pers.</span>
                  </p>
                </div>
                <p className={`text-sm ${te ? "font-semibold text-[#FCD34D]" : "text-[#B8C4BD]"}`}>
                  {RES_STATUS[r.status]}
                  {r.status === "BEVESTIGD" && ` · ${tijdTot(r.tijd, nuMin)}`}
                  {r.telefoon && ` · ${r.telefoon}`}
                  {r.bron === "online" && " · online geboekt"}
                  {r.bron === "agent" && " · geboekt via AI-assistent"}
                </p>
                {r.opmerking && <p className="mt-1 rounded-md bg-black/20 px-2 py-1 text-sm text-[#FDE68A]">{r.opmerking}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={`tafel-${r.id}`} className="sr-only">
                    Tafel voor {r.naam}
                  </label>
                  <select
                    id={`tafel-${r.id}`}
                    value={r.tafelId ?? ""}
                    onChange={(e) => void doe({ actie: "reservering-tafel", id: r.id, tafelId: e.target.value || null }, e.target.value ? `${r.naam} aan ${tafels.find((t) => t.id === e.target.value)?.naam ?? "tafel"}.` : "Tafel losgemaakt.")}
                    className="min-h-11 rounded-xl border-0 bg-white/10 px-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
                  >
                    <option value="">Geen tafel</option>
                    {tafels.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.naam} ({t.plaatsen} p.)
                      </option>
                    ))}
                  </select>
                  {r.status === "BEVESTIGD" && (
                    <>
                      <Knop soort="doen" onClick={() => void doe({ actie: "reservering-status", id: r.id, status: "AANGEKOMEN" }, `${r.naam} is binnen.`, () => void doe({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }))}>
                        Binnen<span className="sr-only"> ({r.naam})</span>
                      </Knop>
                      <Knop soort="stil" onClick={() => void doe({ actie: "reservering-status", id: r.id, status: "NIET_GEKOMEN" }, `${r.naam}: niet gekomen.`, () => void doe({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }))}>
                        Niet gekomen<span className="sr-only"> ({r.naam})</span>
                      </Knop>
                    </>
                  )}
                  {r.status !== "BEVESTIGD" && (
                    <Knop soort="stil" onClick={() => void doe({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }, `${r.naam} staat weer op verwacht.`)}>
                      Terug naar verwacht<span className="sr-only"> ({r.naam})</span>
                    </Knop>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-4">
        <form onSubmit={(e) => void inloop(e)} className="rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10" aria-labelledby="inloop-kop">
          <h2 id="inloop-kop" className="font-display text-xl font-bold text-white">
            Inloop
          </h2>
          <p className="text-sm text-[#9BA8A1]">Gasten zonder reservering direct inboeken.</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-semibold text-[#B8C4BD]" id="inloop-personen">
              Personen
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="inloop-personen">
              <button type="button" onClick={() => setPersonen((p) => Math.max(1, p - 1))} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl font-bold text-white" aria-label="Eén persoon minder">
                −
              </button>
              <span className="w-8 text-center font-display text-2xl font-bold tabular-nums text-white" aria-live="polite">
                {personen}
              </span>
              <button type="button" onClick={() => setPersonen((p) => Math.min(100, p + 1))} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl font-bold text-white" aria-label="Eén persoon meer">
                +
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-[#B8C4BD]">Naam (mag leeg)</span>
              <input value={naam} onChange={(e) => setNaam(e.target.value.slice(0, 80))} className="mt-1 w-full rounded-xl border-0 bg-white/10 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#B8C4BD]">Tafel</span>
              <select value={tafelId} onChange={(e) => setTafelId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border-0 bg-white/10 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]">
                <option value="">Later kiezen</option>
                {vrij.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.naam} ({t.plaatsen} p.){t.staat === "gereserveerd" ? " · gereserveerd" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Knop groot soort="doen" type="submit" className="mt-4 w-full">
            Inboeken
          </Knop>
        </form>

        <section aria-labelledby="zaal-ontvangst-kop">
          <h2 id="zaal-ontvangst-kop" className="mb-2 font-display text-xl font-bold text-white">
            De zaal <span className="text-base font-semibold text-[#9BA8A1]">· {vrij.filter((t) => t.staat === "vrij").length} vrij</span>
          </h2>
          <ZaalTegels zaal={zaal} donker label="Zaal" />
        </section>
      </div>
    </div>
  );
}
