"use client";

import { useState } from "react";
import { AANVRAAG_STATUS, BEHEER_API, VELD_BASIS, Melding, dagNaam, euro, useBeheerData, vraag, type AanvraagStatus } from "@/components/voorstel/beheer/api";

// Aanvragen (leads) als pijplijn: één kolom per stap. Status en offertebedrag
// zijn per kaart aan te passen; "Klant" opent het klantdossier in het CRM.

interface Aanvraag {
  id: string;
  email: string;
  naam: string;
  telefoon: string;
  gelegenheid: string;
  programma: string;
  datum: string;
  personen: number;
  bericht: string;
  status: AanvraagStatus;
  bedrag: number | null;
  aangemaakt: string;
}

const URL_AV = `${BEHEER_API}/aanvragen`;
const STAPPEN = Object.keys(AANVRAAG_STATUS) as AanvraagStatus[];

export function Aanvragen({ openKlant }: { openKlant: (email: string) => void }) {
  const { data, setData, fout, setFout } = useBeheerData<{ aanvragen: Aanvraag[] }>(URL_AV);
  const [bedragen, setBedragen] = useState<Record<string, string>>({});

  async function wijzig(a: Aanvraag, w: { status?: AanvraagStatus; bedrag?: number | null }) {
    try {
      const { aanvraag } = await vraag<{ aanvraag: Aanvraag }>(URL_AV, { method: "PATCH", body: { id: a.id, ...w } });
      setData((d) => (d ? { aanvragen: d.aanvragen.map((x) => (x.id === a.id ? aanvraag : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }
  async function verwijder(a: Aanvraag) {
    if (!window.confirm(`Aanvraag van ${a.naam} verwijderen?`)) return;
    try {
      await vraag(URL_AV, { method: "DELETE", body: { id: a.id } });
      setData((d) => (d ? { aanvragen: d.aanvragen.filter((x) => x.id !== a.id) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  const lijst = data?.aanvragen ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-schw-mute">Aanvragen uit het formulier op de site (themafeesten, bruiloften, grote groepen). Zet ze door de stappen en houd het offertebedrag bij.</p>
      <Melding fout={fout} />
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STAPPEN.map((s) => {
          const kolom = lijst.filter((a) => a.status === s);
          const waarde = kolom.reduce((t, a) => t + (a.bedrag ?? 0), 0);
          return (
            <section key={s} className="w-72 shrink-0 rounded-2xl bg-schw-sand/70 p-3" aria-label={AANVRAAG_STATUS[s][0]}>
              <div className="flex items-center justify-between px-1">
                <h3 className="font-display font-bold">{AANVRAAG_STATUS[s][0]}</h3>
                <span className="text-xs font-semibold text-schw-mute">
                  {kolom.length}
                  {waarde ? ` · ${euro(waarde)}` : ""}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {kolom.length === 0 && <li className="px-1 text-xs text-schw-mute">Leeg</li>}
                {kolom.map((a) => (
                  <li key={a.id} className="rounded-xl bg-white p-3 text-sm shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                    <p className="font-bold">{a.naam}</p>
                    <p className="text-schw-mute">
                      {a.programma || a.gelegenheid || "Op maat"} · {a.personen} pers.
                    </p>
                    <p className="text-xs text-schw-mute">
                      {a.datum ? `Voor ${dagNaam(a.datum, { day: "numeric", month: "short", year: "numeric" })}` : "Datum open"} · binnen{" "}
                      {dagNaam(a.aangemaakt.slice(0, 10), { day: "numeric", month: "short" })}
                    </p>
                    {a.bericht && <p className="mt-1 line-clamp-3 text-xs">&ldquo;{a.bericht}&rdquo;</p>}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <select value={a.status} onChange={(e) => void wijzig(a, { status: e.target.value as AanvraagStatus })} aria-label={`Status van ${a.naam}`} className={`${VELD_BASIS} py-1.5 text-xs`}>
                        {STAPPEN.map((x) => (
                          <option key={x} value={x}>
                            {AANVRAAG_STATUS[x][0]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`Offertebedrag voor ${a.naam}`}
                        placeholder="€ bedrag"
                        value={bedragen[a.id] ?? (a.bedrag ?? "")}
                        onChange={(e) => setBedragen({ ...bedragen, [a.id]: e.target.value })}
                        onBlur={() => {
                          const v = bedragen[a.id];
                          if (v === undefined) return;
                          void wijzig(a, { bedrag: v === "" ? null : Number(v) });
                        }}
                        className={`${VELD_BASIS} py-1.5 text-xs`}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs font-semibold">
                      <button type="button" onClick={() => openKlant(a.email)} className="underline">
                        Klant
                      </button>
                      <a href={`tel:${a.telefoon}`} className="underline">
                        Bel
                      </a>
                      <a href={`mailto:${a.email}`} className="underline">
                        Mail
                      </a>
                      <button type="button" onClick={() => void verwijder(a)} className="ml-auto text-[#B91C1C]">
                        Verwijder
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
