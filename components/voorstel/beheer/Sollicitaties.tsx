"use client";

import { useMemo, useState } from "react";
import { BEHEER_API, KAART, KNOP_LICHT, Melding, Pil, VELD, VELD_BASIS, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { BEWAAR_DAGEN, SOLLICITATIE_STATUS, wisDatum, type SollicitatieStatus } from "@/lib/voorstel/sollicitatie-regels";

// Sollicitaties uit de formulieren op de vacaturepagina's. Status bijhouden,
// een interne notitie en direct bellen of mailen. Na de laatste wijziging
// blijft een sollicitatie 4 weken staan en wordt dan vanzelf gewist (AVG).

interface Sollicitatie {
  id: string;
  vacature: string;
  functie: string;
  naam: string;
  email: string;
  telefoon: string;
  uren: string;
  start: string;
  motivatie: string;
  status: SollicitatieStatus;
  notitie: string;
  aangemaakt: string;
  bijgewerkt: string;
}

const URL_SO = `${BEHEER_API}/sollicitaties`;
const STATUS: Record<SollicitatieStatus, [string, string]> = {
  nieuw: ["Nieuw", "bg-schw-sun text-schw-night"],
  gesprek: ["Gesprek", "bg-[#DBEAFE] text-[#1D4ED8]"],
  aangenomen: ["Aangenomen", "bg-[#DCFCE7] text-[#15803D]"],
  afgewezen: ["Afgewezen", "bg-schw-sand text-schw-mute"],
};
const KORT = { day: "numeric", month: "short" } as const;

export function Sollicitaties() {
  const { data, setData, fout, setFout } = useBeheerData<{ sollicitaties: Sollicitatie[] }>(URL_SO);
  const [status, setStatus] = useState<"" | SollicitatieStatus>("");
  const [functie, setFunctie] = useState("");
  const [notities, setNotities] = useState<Record<string, string>>({});

  const alle = useMemo(() => data?.sollicitaties ?? [], [data]);
  const functies = useMemo(() => [...new Set(alle.map((s) => s.functie))].sort(), [alle]);
  const lijst = alle.filter((s) => (!status || s.status === status) && (!functie || s.functie === functie));
  const tel = (s: SollicitatieStatus) => alle.filter((x) => x.status === s).length;

  async function wijzig(s: Sollicitatie, w: { status?: SollicitatieStatus; notitie?: string }) {
    try {
      const { sollicitatie } = await vraag<{ sollicitatie: Sollicitatie }>(URL_SO, { method: "PATCH", body: { id: s.id, ...w } });
      setData((d) => (d ? { sollicitaties: d.sollicitaties.map((x) => (x.id === s.id ? sollicitatie : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }
  async function verwijder(s: Sollicitatie) {
    if (!window.confirm(`Sollicitatie van ${s.naam} definitief verwijderen?`)) return;
    try {
      await vraag(URL_SO, { method: "DELETE", body: { id: s.id } });
      setData((d) => (d ? { sollicitaties: d.sollicitaties.filter((x) => x.id !== s.id) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Nieuw", tel("nieuw")],
            ["Op gesprek", tel("gesprek")],
            ["Aangenomen", tel("aangenomen")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className={KAART}>
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{data ? v : "–"}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {([["", "Alles"], ...SOLLICITATIE_STATUS.map((s) => [s, STATUS[s][0]] as const)] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={status === k}
            onClick={() => setStatus(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${status === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10"}`}
          >
            {label}
          </button>
        ))}
        {functies.length > 1 && (
          <select value={functie} onChange={(e) => setFunctie(e.target.value)} aria-label="Filter op functie" className={`${VELD_BASIS} ml-auto py-2 text-sm`}>
            <option value="">Alle functies</option>
            {functies.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>
      <Melding fout={fout} />
      {data && lijst.length === 0 && (
        <p className="text-schw-mute">
          {alle.length ? "Geen sollicitaties met dit filter." : "Nog geen sollicitaties. Kandidaten solliciteren direct op elke vacaturepagina, of open op de pagina Vacatures."}
        </p>
      )}
      <ul className="space-y-3">
        {lijst.map((s) => (
          <li key={s.id} className={KAART}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">
                  {s.naam} <Pil label={STATUS[s.status][0]} kleur={STATUS[s.status][1]} />
                </p>
                <p className="mt-1 text-sm text-schw-mute">
                  {s.functie} · binnen {dagNaam(amsterdamDayKey(s.aangemaakt), KORT)}
                  {s.uren && ` · ${s.uren}`}
                  {s.start && ` · kan starten ${dagNaam(s.start, { ...KORT, year: "numeric" })}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${s.telefoon}`} className={KNOP_LICHT}>
                  Bel {s.telefoon}
                </a>
                <a href={`mailto:${s.email}?subject=${encodeURIComponent(`Je sollicitatie: ${s.functie}`)}`} className={KNOP_LICHT}>
                  Mail
                </a>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line leading-relaxed">{s.motivatie}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-[12rem_1fr]">
              <select
                value={s.status}
                onChange={(e) => void wijzig(s, { status: e.target.value as SollicitatieStatus })}
                aria-label={`Status van ${s.naam}`}
                className={VELD}
              >
                {SOLLICITATIE_STATUS.map((x) => (
                  <option key={x} value={x}>
                    {STATUS[x][0]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Interne notitie bij ${s.naam}`}
                placeholder="Interne notitie, bv. gesprek do 14:00 met Henk"
                value={notities[s.id] ?? s.notitie}
                onChange={(e) => setNotities({ ...notities, [s.id]: e.target.value })}
                onBlur={() => {
                  const v = notities[s.id];
                  if (v !== undefined && v !== s.notitie) void wijzig(s, { notitie: v });
                }}
                className={VELD}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-schw-mute">
              <span>Wordt gewist op {dagNaam(amsterdamDayKey(wisDatum(s.bijgewerkt)), { ...KORT, year: "numeric" })} ({BEWAAR_DAGEN / 7} weken na de laatste wijziging)</span>
              <button type="button" onClick={() => void verwijder(s)} className="font-semibold text-[#B91C1C]">
                Verwijder
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="rounded-2xl bg-schw-sand/70 p-4 text-sm">
        Tijdelijk extra handen nodig voor een drukke avond of groot feest? Via ZekerFlex plaats je een dienst en reageren horecakrachten uit de buurt.{" "}
        <a href="https://zekerflex.com/horeca-personeel-inhuren" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          Zo werkt het
        </a>
      </p>
    </div>
  );
}
