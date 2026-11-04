"use client";

import { useState } from "react";
import { faseVan, stationFase, type Station } from "@/lib/horeca/fasen";
import { TE_LANG_MIN, LET_OP_MIN, allesTegelijk, bonnenVoor, recentKlaar } from "@/lib/horeca/zaal";
import type { SchermBestelling } from "@/components/horeca/live/types";
import { wachtNiveau, minTekst } from "@/components/horeca/live/stijl";
import { ding } from "@/components/horeca/scherm/apparaat";
import { Knop, Leeg, minSinds, useNieuw, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// Het keuken- of barscherm: bonnen van oud naar nieuw, elk met alleen de
// eigen regels, groot leesbaar op afstand. Kleur zegt wat er moet gebeuren:
// amber = nieuw (wacht op jou), groen = bezig; de klok wordt amber en dan rood
// als het lang duurt. Start en Klaar met grote knoppen; per ongeluk afgemeld
// haal je terug onder "Net klaar". Naast de bonnen: alles-tegelijk (hoeveel
// van elk gerecht) en een knop om gerechten uitverkocht te zetten.
// ---------------------------------------------------------------------------

const KLOK_KLEUR = { rustig: "text-[#D7DED9]", letop: "text-[#FCD34D]", telang: "text-[#FCA5A5]" } as const;

function Bon({ b, station, nu, doe }: { b: SchermBestelling; station: Station; nu: number; doe: SchermProps["doe"] }) {
  const fase = stationFase(b.regels, station);
  const min = minSinds(b.createdAt, nu);
  const niveau = wachtNiveau(min, LET_OP_MIN, TE_LANG_MIN);
  const eigen = b.regels.filter((r) => r.station === station);
  const anders = b.regels.filter((r) => r.station !== station).reduce((s, r) => s + r.aantal, 0);
  const nieuw = fase === "nieuw";
  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl bg-[#141A17] ring-2 ${niveau === "telang" ? "ring-[#EF4444]" : nieuw ? "ring-[#F59E0B]" : "ring-[#22C55E]/70"}`}>
      <div className={`flex items-baseline justify-between gap-2 px-4 py-2 ${nieuw ? "bg-[#3A2203]" : "bg-[#06311A]"}`}>
        <span className="font-display text-2xl font-bold text-white">#{b.nummer}</span>
        <span className="min-w-0 truncate text-base font-semibold text-white">{b.tafelNaam ?? "Afhalen / balie"}</span>
        <span className={`font-display text-xl font-bold tabular-nums ${KLOK_KLEUR[niveau]}`}>{minTekst(min)}</span>
      </div>
      <div className="flex items-center justify-between px-4 pt-2 text-xs font-semibold uppercase tracking-wide">
        <span className={nieuw ? "text-[#FCD34D]" : "text-[#86EFAC]"}>{nieuw ? "Nieuw" : "Bezig"}</span>
        <span className="text-[#9BA8A1]">{b.bron === "qr" ? "Gast via QR" : "Bediening"}</span>
      </div>
      <ul className="flex-1 space-y-1.5 px-4 py-3">
        {eigen.map((r, i) => (
          <li key={i} className={`text-lg leading-snug ${faseVan(r) === "klaar" || faseVan(r) === "geserveerd" ? "text-[#6B7A72] line-through" : "text-white"}`}>
            <strong className="mr-1 tabular-nums">{r.aantal}×</strong>
            {r.naam}
            {r.opmerking && <span className="mt-0.5 block rounded-md bg-[#3A2203] px-2 py-0.5 text-base font-semibold text-[#FDE68A]">{r.opmerking}</span>}
          </li>
        ))}
      </ul>
      {(b.opmerking || b.naam) && (
        <p className="mx-4 mb-2 rounded-lg bg-[#3A2203] px-3 py-2 text-base font-semibold text-[#FDE68A]">
          {b.naam && <span>Voor {b.naam}. </span>}
          {b.opmerking}
        </p>
      )}
      {anders > 0 && <p className="px-4 pb-2 text-sm text-[#9BA8A1]">+ {anders} voor {station === "keuken" ? "de bar" : "de keuken"}</p>}
      <div className="grid grid-cols-1 gap-2 p-3 pt-0">
        {nieuw ? (
          <div className="grid grid-cols-2 gap-2">
            <Knop groot soort="rustig" onClick={() => void doe({ actie: "fase", id: b.id, stap: "start" })}>
              Start<span className="sr-only"> bon {b.nummer}</span>
            </Knop>
            <Knop groot soort="doen" onClick={() => void doe({ actie: "fase", id: b.id, stap: "klaar" }, `Bon ${b.nummer} klaar.`, () => void doe({ actie: "fase", id: b.id, stap: "terugNaarNieuw" }))}>
              Klaar<span className="sr-only"> bon {b.nummer}</span>
            </Knop>
          </div>
        ) : (
          <Knop groot soort="doen" onClick={() => void doe({ actie: "fase", id: b.id, stap: "klaar" }, `Bon ${b.nummer} klaar.`, () => void doe({ actie: "fase", id: b.id, stap: "terugNaarBezig" }))}>
            Klaar<span className="sr-only"> bon {b.nummer}</span>
          </Knop>
        )}
      </div>
    </li>
  );
}

export function KeukenScherm({ data, doe, nu, geluid, station }: SchermProps & { station: Station }) {
  const [zijpaneel, setZijpaneel] = useState<"tegelijk" | "uitverkocht">("tegelijk");
  const lijst = data.bestellingen ?? [];
  const bonnen = bonnenVoor(lijst, station).map((x) => x.b);
  const tegelijk = allesTegelijk(lijst, station);
  const klaar = recentKlaar(lijst, station);
  const items = data.items ?? [];
  const nieuw = bonnen.filter((b) => stationFase(b.regels, station) === "nieuw").length;
  const langst = bonnen.length ? Math.max(...bonnen.map((b) => minSinds(b.createdAt, nu))) : null;

  useNieuw(
    bonnen.map((b) => b.id),
    () => {
      if (geluid) ding();
    },
  );

  return (
    <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[1fr_300px]">
      <section aria-label="Bonnen" className="min-w-0">
        <p className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-base text-[#B8C4BD]" role="status">
          <span>
            <strong className="text-[#FCD34D]">{nieuw}</strong> nieuw
          </span>
          <span>
            <strong className="text-[#86EFAC]">{bonnen.length - nieuw}</strong> bezig
          </span>
          {langst !== null && (
            <span>
              langst <strong className={KLOK_KLEUR[wachtNiveau(langst, LET_OP_MIN, TE_LANG_MIN)]}>{minTekst(langst)}</strong>
            </span>
          )}
        </p>
        {bonnen.length === 0 ? (
          <Leeg>Geen bonnen. Nieuwe bestellingen verschijnen hier vanzelf{geluid ? ", met een geluidje" : ""}.</Leeg>
        ) : (
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {bonnen.map((b) => (
              <Bon key={b.id} b={b} station={station} nu={nu} doe={doe} />
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-4">
        <div role="tablist" aria-label="Zijpaneel" className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
          {(["tegelijk", "uitverkocht"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={zijpaneel === p} onClick={() => setZijpaneel(p)} className={`rounded-lg px-3 py-2 text-sm font-bold ${zijpaneel === p ? "bg-white text-[#0B0F0D]" : "text-[#B8C4BD]"}`}>
              {p === "tegelijk" ? "Alles tegelijk" : "Uitverkocht"}
            </button>
          ))}
        </div>
        {zijpaneel === "tegelijk" ? (
          <section aria-label="Alles tegelijk" className="rounded-2xl bg-[#141A17] p-4">
            {tegelijk.length === 0 ? (
              <p className="text-sm text-[#9BA8A1]">Niets te maken.</p>
            ) : (
              <ul className="space-y-1.5">
                {tegelijk.map((t) => (
                  <li key={t.naam} className="flex items-baseline justify-between gap-3 text-lg">
                    <span className="min-w-0 truncate text-white">{t.naam}</span>
                    <strong className="font-display text-2xl tabular-nums text-white">{t.aantal}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section aria-label="Uitverkocht zetten" className="rounded-2xl bg-[#141A17] p-4">
            <p className="text-sm text-[#9BA8A1]">Tik om een gerecht uitverkocht te zetten; gasten zien het meteen op de menukaart.</p>
            <ul className="mt-3 space-y-1.5">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-pressed={!i.beschikbaar}
                    onClick={() => void doe({ actie: "uitverkocht", id: i.id, beschikbaar: !i.beschikbaar }, i.beschikbaar ? `${i.naam} is uitverkocht.` : `${i.naam} is weer te bestellen.`)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-base ${i.beschikbaar ? "bg-white/5 text-white" : "bg-[#450A0A] text-[#FECACA]"}`}
                  >
                    <span className="min-w-0 truncate">{i.naam}</span>
                    <span className="flex-shrink-0 text-xs font-bold uppercase">{i.beschikbaar ? "Op voorraad" : "Uitverkocht"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {klaar.length > 0 && (
          <section aria-label="Net klaar" className="rounded-2xl bg-[#141A17] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#9BA8A1]">Net klaar</h2>
            <ul className="mt-2 space-y-1.5">
              {klaar.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-white">
                    #{b.nummer} · {b.tafelNaam ?? "Afhalen"}
                  </span>
                  <Knop soort="stil" onClick={() => void doe({ actie: "fase", id: b.id, stap: "terugNaarBezig" }, `Bon ${b.nummer} staat weer open.`)}>
                    Terug<span className="sr-only"> bon {b.nummer}</span>
                  </Knop>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
