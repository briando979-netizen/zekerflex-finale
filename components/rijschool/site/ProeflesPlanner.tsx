"use client";

import { useEffect, useState } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld } from "@/components/rijschool/ui";
import { datumKort, datumLang, metHoofdletter, tijd } from "@/lib/rijschool/format";

// Proefles plannen op de website van de rijschool: dag → vrije tijd bij een
// instructeur → gegevens. Alleen tijden die echt vrij zijn volgens de
// werktijden en agenda; de server controleert dat bij het boeken opnieuw.

interface Start {
  dagen: string[];
  lesMinuten: number;
  instructeurs: { id: string; naam: string }[];
}

interface Tijden {
  datum: string;
  tijden: { instructeurId: string; naam: string; tijden: string[] }[];
}

export function ProeflesPlanner({ slug, schoolNaam }: { slug: string; schoolNaam: string }) {
  const api = `/api/rijschool/site/${slug}/proefles`;
  const [start, setStart] = useState<Start | null>(null);
  const [datum, setDatum] = useState<string | null>(null);
  const [tijden, setTijden] = useState<Tijden | null>(null);
  const [keuze, setKeuze] = useState<{ instructeurId: string; naam: string; start: string } | null>(null);
  const [v, setV] = useState({ naam: "", email: "", telefoon: "", adres: "", automaat: false, akkoord: false, website: "" });
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [geboekt, setGeboekt] = useState<{ start: string; eind: string } | null>(null);

  useEffect(() => {
    stuur<Start>(api)
      .then(setStart)
      .catch((e) => setFout(foutVan(e)));
  }, [api]);

  useEffect(() => {
    if (!datum) return;
    setTijden(null);
    setKeuze(null);
    stuur<Tijden>(`${api}?datum=${datum}`)
      .then(setTijden)
      .catch((e) => setFout(foutVan(e)));
  }, [api, datum]);

  async function boek(e: React.FormEvent) {
    e.preventDefault();
    if (!keuze) return;
    setBezig(true);
    setFout(null);
    try {
      const r = await stuur<{ start: string; eind: string }>(api, "POST", { ...v, instructeurId: keuze.instructeurId, start: keuze.start });
      setGeboekt(r);
    } catch (err) {
      setFout(foutVan(err));
      // de tijd kan net bezet zijn: tijden opnieuw ophalen
      if (datum) stuur<Tijden>(`${api}?datum=${datum}`).then(setTijden).catch(() => undefined);
    } finally {
      setBezig(false);
    }
  }

  if (geboekt) {
    return (
      <div className="rounded-3xl border border-hair bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl text-white" style={{ background: "var(--rs-kleur)" }} aria-hidden>
          ✓
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold">Je proefles staat gepland</h2>
        <p className="mt-2 text-neutralx-600">
          {datumLang(geboekt.start)}, {tijd(geboekt.start)} – {tijd(geboekt.eind)}
        </p>
        <p className="mt-4 text-sm text-neutralx-600">
          Je krijgt een bevestiging per mail. {schoolNaam} haalt je op op het adres dat je hebt opgegeven. Kan het toch niet? Neem dan even contact op.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold">1. Kies een dag</h2>
        {!start ? (
          <p className="mt-2 text-sm text-neutralx-500">{fout ?? "Laden…"}</p>
        ) : (
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2">
            {start.dagen.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDatum(d)}
                aria-pressed={datum === d}
                className={`min-w-[5.5rem] rounded-xl border px-3 py-2 text-sm font-semibold ${datum === d ? "border-transparent text-white" : "border-hair bg-white"}`}
                style={datum === d ? { background: "var(--rs-kleur)" } : undefined}
              >
                {metHoofdletter(datumKort(`${d}T12:00:00Z`))}
              </button>
            ))}
          </div>
        )}
      </section>

      {datum && (
        <section>
          <h2 className="font-semibold">2. Kies een tijd</h2>
          {!tijden ? (
            <p className="mt-2 text-sm text-neutralx-500">Vrije tijden zoeken…</p>
          ) : tijden.tijden.every((t) => t.tijden.length === 0) ? (
            <p className="mt-2 text-sm text-neutralx-600">Op deze dag is niets meer vrij. Kies een andere dag.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {tijden.tijden
                .filter((t) => t.tijden.length > 0)
                .map((t) => (
                  <div key={t.instructeurId}>
                    {tijden.tijden.length > 1 && <p className="mb-1 text-sm text-neutralx-600">Bij {t.naam}</p>}
                    <div className="flex flex-wrap gap-2">
                      {t.tijden.map((s) => {
                        const gekozen = keuze?.start === s && keuze.instructeurId === t.instructeurId;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setKeuze({ instructeurId: t.instructeurId, naam: t.naam, start: s })}
                            aria-pressed={gekozen}
                            className={`num rounded-lg border px-3 py-2 text-sm font-semibold ${gekozen ? "border-transparent text-white" : "border-hair bg-white"}`}
                            style={gekozen ? { background: "var(--rs-kleur)" } : undefined}
                          >
                            {tijd(s)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {keuze && (
        <form onSubmit={boek} className="space-y-4 rounded-2xl border border-hair bg-white p-5">
          <h2 className="font-semibold">
            3. Je gegevens <span className="font-normal text-neutralx-600">voor {datumLang(keuze.start)} om {tijd(keuze.start)}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld label="Naam">
              <input className="field-input" value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} required minLength={2} maxLength={100} autoComplete="name" />
            </Veld>
            <Veld label="E-mail">
              <input className="field-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required maxLength={200} autoComplete="email" />
            </Veld>
            <Veld label="Telefoon">
              <input className="field-input" type="tel" value={v.telefoon} onChange={(e) => setV({ ...v, telefoon: e.target.value })} required maxLength={30} autoComplete="tel" />
            </Veld>
            <Veld label="Ophaaladres">
              <input className="field-input" value={v.adres} onChange={(e) => setV({ ...v, adres: e.target.value })} required minLength={5} maxLength={160} autoComplete="street-address" />
            </Veld>
          </div>
          {/* honeypot: mensen zien dit veld niet */}
          <div className="hidden" aria-hidden>
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
            </label>
          </div>
          <Schakelaar label="Ik wil lessen in een automaat" aan={v.automaat} onChange={(automaat) => setV({ ...v, automaat })} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={v.akkoord} onChange={(e) => setV({ ...v, akkoord: e.target.checked })} required />
            <span>
              {schoolNaam} mag mijn gegevens gebruiken om de proefles te plannen en contact met me op te nemen. Je gegevens worden niet gedeeld met anderen.
            </span>
          </label>
          <Melding fout={fout} />
          <button type="submit" disabled={bezig} className="w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto" style={{ background: "var(--rs-kleur)" }}>
            {bezig ? "Bezig…" : "Proefles vastleggen"}
          </button>
        </form>
      )}
      {!keuze && <Melding fout={start ? fout : null} />}
    </div>
  );
}
