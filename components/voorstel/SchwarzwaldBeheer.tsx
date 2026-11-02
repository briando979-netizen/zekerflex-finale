"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Agenda voor het personeel: alle reserveringen per dag, met bevestigen en
// annuleren. Leest en schrijft via /api/voorstel/schwarzwald/beheer.

type Status = "nieuw" | "bevestigd" | "geannuleerd";
interface Boeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
  status: Status;
}

const API = "/api/voorstel/schwarzwald/beheer";
const PIL: Record<Status, string> = {
  nieuw: "bg-schw-sun text-schw-night",
  bevestigd: "bg-[#DCFCE7] text-[#15803D]",
  geannuleerd: "bg-schw-sand text-schw-mute line-through",
};
const dagNaam = (datum: string) =>
  new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

export function SchwarzwaldBeheer({ namen, vandaag }: { namen: Record<string, string>; vandaag: string }) {
  const [boekingen, setBoekingen] = useState<Boeking[] | null>(null);
  const [fout, setFout] = useState("");
  const [alles, setAlles] = useState(false);
  const [bezig, setBezig] = useState("");

  const laad = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: "no-store" });
      const d = (await r.json()) as { boekingen?: Boeking[]; error?: { message?: string } };
      if (!r.ok || !d.boekingen) throw new Error(d.error?.message ?? "Laden mislukt.");
      setBoekingen(d.boekingen);
      setFout("");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  async function zet(b: Boeking, status: Status) {
    setBezig(b.id);
    try {
      const r = await fetch(API, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ datum: b.datum, id: b.id, status }) });
      if (!r.ok) throw new Error("Opslaan mislukt.");
      setBoekingen((lijst) => lijst?.map((x) => (x.id === b.id && x.datum === b.datum ? { ...x, status } : x)) ?? null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig("");
    }
  }

  const zichtbaar = useMemo(() => (boekingen ?? []).filter((b) => alles || b.datum >= vandaag), [boekingen, alles, vandaag]);
  const perDag = useMemo(() => {
    const m = new Map<string, Boeking[]>();
    for (const b of zichtbaar) m.set(b.datum, [...(m.get(b.datum) ?? []), b]);
    return [...m.entries()];
  }, [zichtbaar]);
  const nieuw = zichtbaar.filter((b) => b.status === "nieuw").length;
  const gasten = zichtbaar.filter((b) => b.status !== "geannuleerd").reduce((s, b) => s + b.personen, 0);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Te bevestigen", nieuw],
            ["Reserveringen", zichtbaar.filter((b) => b.status !== "geannuleerd").length],
            ["Gasten", gasten],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{boekingen ? v : "–"}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(
          [
            [false, "Vanaf vandaag"],
            [true, "Alles"],
          ] as const
        ).map(([waarde, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={alles === waarde}
            onClick={() => setAlles(waarde)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${alles === waarde ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10"}`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => void laad()} className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/10">
          Vernieuwen
        </button>
      </div>

      {fout && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      {boekingen && perDag.length === 0 && <p className="mt-8 text-schw-mute">Nog geen reserveringen.</p>}

      <div className="mt-6 space-y-8">
        {perDag.map(([datum, lijst]) => (
          <section key={datum}>
            <h2 className="font-display text-xl font-bold first-letter:uppercase">
              {dagNaam(datum)}
              <span className="ml-3 text-sm font-semibold text-schw-mute">
                {lijst.filter((b) => b.status !== "geannuleerd").reduce((s, b) => s + b.personen, 0)} gasten
              </span>
            </h2>
            <ul className="mt-3 space-y-2">
              {lijst.map((b) => (
                <li key={b.id} className="grid gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                  <p className="font-display text-2xl font-bold">{b.tijd}</p>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {namen[b.activiteit] ?? b.activiteit} · {b.personen} personen
                      <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${PIL[b.status]}`}>{b.status}</span>
                    </p>
                    <p className="truncate text-sm text-schw-mute">
                      {b.naam} · <a href={`tel:${b.telefoon}`} className="underline">{b.telefoon}</a> · <a href={`mailto:${b.email}`} className="underline">{b.email}</a> · nr. {b.id}
                    </p>
                    {b.opmerking && <p className="mt-1 text-sm">&ldquo;{b.opmerking}&rdquo;</p>}
                  </div>
                  <div className="flex gap-2">
                    {b.status !== "bevestigd" && (
                      <button type="button" disabled={bezig === b.id} onClick={() => void zet(b, "bevestigd")} className="rounded-full bg-schw-night px-4 py-2 text-sm font-bold text-schw-cream disabled:opacity-50">
                        Bevestig
                      </button>
                    )}
                    {b.status !== "geannuleerd" && (
                      <button type="button" disabled={bezig === b.id} onClick={() => void zet(b, "geannuleerd")} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15 disabled:opacity-50">
                        Annuleer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
