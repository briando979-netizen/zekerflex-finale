"use client";

import { useMemo, useState } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, Pil, VELD, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { gemiddelde, sterren } from "@/lib/voorstel/review-weergave";

// Beoordelingen van gasten: nieuw binnengekomen eerst. Goedkeuren zet ze op de
// site (homepage en de activiteit), verbergen haalt ze eraf; een antwoord van
// het team staat er openbaar onder.

type Status = "nieuw" | "goedgekeurd" | "verborgen";
interface Review {
  id: string;
  email: string;
  naam: string;
  activiteit: string;
  bezoek: string;
  score: number;
  tekst: string;
  status: Status;
  antwoord: string;
  aangemaakt: string;
}

const URL_RV = `${BEHEER_API}/reviews`;
const STATUS: Record<Status, [string, string]> = {
  nieuw: ["Nieuw", "bg-schw-sun text-schw-night"],
  goedgekeurd: ["Op de site", "bg-[#DCFCE7] text-[#15803D]"],
  verborgen: ["Verborgen", "bg-schw-sand text-schw-mute"],
};

export function Reviews({ namen, openKlant }: { namen: Record<string, string>; openKlant: (email: string) => void }) {
  const { data, setData, fout, setFout } = useBeheerData<{ reviews: Review[] }>(URL_RV);
  const [filter, setFilter] = useState<"" | Status>("");
  const [antwoorden, setAntwoorden] = useState<Record<string, string>>({});

  const lijst = useMemo(() => {
    const l = (data?.reviews ?? []).filter((r) => !filter || r.status === filter);
    return [...l].sort((a, b) => Number(b.status === "nieuw") - Number(a.status === "nieuw") || b.aangemaakt.localeCompare(a.aangemaakt));
  }, [data, filter]);
  const opSite = (data?.reviews ?? []).filter((r) => r.status === "goedgekeurd");

  async function wijzig(r: Review, w: { status?: Status; antwoord?: string }) {
    try {
      const { review } = await vraag<{ review: Review }>(URL_RV, { method: "PATCH", body: { id: r.id, ...w } });
      setData((d) => (d ? { reviews: d.reviews.map((x) => (x.id === r.id ? review : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }
  async function verwijder(r: Review) {
    if (!window.confirm(`Beoordeling van ${r.naam} definitief verwijderen?`)) return;
    try {
      await vraag(URL_RV, { method: "DELETE", body: { id: r.id } });
      setData((d) => (d ? { reviews: d.reviews.filter((x) => x.id !== r.id) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Gemiddelde op de site", gemiddelde(opSite)?.toLocaleString("nl-NL") ?? "–"],
            ["Op de site", opSite.length],
            ["Wacht op goedkeuring", (data?.reviews ?? []).filter((r) => r.status === "nieuw").length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className={KAART}>
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{data ? v : "–"}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["", "Alles"],
            ["nieuw", "Nieuw"],
            ["goedgekeurd", "Op de site"],
            ["verborgen", "Verborgen"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Melding fout={fout} />
      {data && lijst.length === 0 && <p className="text-schw-mute">Nog geen beoordelingen. Gasten kunnen na hun bezoek een beoordeling geven onder Mijn account.</p>}
      <ul className="space-y-3">
        {lijst.map((r) => (
          <li key={r.id} className={KAART}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p>
                  <span className="text-lg text-schw-rust" aria-label={`${r.score} van 5 sterren`}>
                    {sterren(r.score)}
                  </span>{" "}
                  <Pil label={STATUS[r.status][0]} kleur={STATUS[r.status][1]} />
                </p>
                <p className="mt-1 text-sm text-schw-mute">
                  {r.naam} · {namen[r.activiteit] ?? r.activiteit} · bezoek {dagNaam(r.bezoek, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                  <button type="button" onClick={() => openKlant(r.email)} className="underline">
                    klantdossier
                  </button>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status !== "goedgekeurd" && (
                  <button type="button" onClick={() => void wijzig(r, { status: "goedgekeurd" })} className={KNOP}>
                    Op de site zetten
                  </button>
                )}
                {r.status !== "verborgen" && (
                  <button type="button" onClick={() => void wijzig(r, { status: "verborgen" })} className={KNOP_LICHT}>
                    Verbergen
                  </button>
                )}
                <button type="button" onClick={() => void verwijder(r)} className={`${KNOP_LICHT} text-[#B91C1C]`}>
                  Verwijder
                </button>
              </div>
            </div>
            <p className="mt-3 text-lg leading-relaxed">&ldquo;{r.tekst}&rdquo;</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void wijzig(r, { antwoord: antwoorden[r.id] ?? r.antwoord });
              }}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <label className="sr-only" htmlFor={`antwoord-${r.id}`}>
                Antwoord van het team
              </label>
              <input
                id={`antwoord-${r.id}`}
                value={antwoorden[r.id] ?? r.antwoord}
                onChange={(e) => setAntwoorden({ ...antwoorden, [r.id]: e.target.value })}
                placeholder="Openbaar antwoord van Het Schwarzwald (mag leeg)"
                className={`${VELD} flex-1`}
              />
              <button type="submit" className={KNOP_LICHT}>
                Antwoord opslaan
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
