"use client";

import { useEffect, useMemo, useState } from "react";

// De boekpagina voor een klant: dienst, tijd, gegevens, klaar. Alle tijden zijn Nederlandse tijd (Europe/Amsterdam),
// ook als de klant in een andere zone zit. De server controleert alles opnieuw; dit scherm is alleen de ingang.

interface DienstInfo {
  id: string;
  naam: string;
  duurMin: number;
  prijsCent: number | null;
}
interface MedewerkerInfo {
  id: string;
  naam: string;
}
interface Bevestiging {
  bedrijfsnaam: string;
  dienstNaam: string;
  medewerkerNaam: string;
  start: string;
  duurMin: number;
}

const euro = (c: number) => `€ ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const klok = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const datumLang = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
/** Een dagsleutel "2026-11-12" als datum zonder tijdzone-gedoe: de dag zelf, altijd dezelfde dag. */
const dagDatum = (dag: string) => new Date(`${dag}T12:00:00Z`);
const dagKort = (dag: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(dagDatum(dag));
const plusDagen = (dag: string, n: number) => new Date(dagDatum(dag).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Stap = "dienst" | "tijd" | "gegevens" | "klaar";

export function BoekFlow({ slug, bedrijfsnaam, diensten, medewerkers, vanDag, totDag, openDagen }: { slug: string; bedrijfsnaam: string; diensten: DienstInfo[]; medewerkers: MedewerkerInfo[]; vanDag: string; totDag: string; openDagen: number[] }) {
  const [stap, setStap] = useState<Stap>("dienst");
  const [dienst, setDienst] = useState<DienstInfo | null>(diensten.length === 1 ? (diensten[0] ?? null) : null);
  const [medewerker, setMedewerker] = useState("");
  const [begin, setBegin] = useState(vanDag);
  const [dag, setDag] = useState<string | null>(null);
  const [tijden, setTijden] = useState<string[] | null>(null);
  const [tijd, setTijd] = useState<string | null>(null);
  const [naam, setNaam] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [email, setEmail] = useState("");
  const [opmerking, setOpmerking] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [website, setWebsite] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<Bevestiging | null>(null);
  /** hoger = de tijden van de gekozen dag opnieuw ophalen (na "net bezet") */
  const [ververs, setVervers] = useState(0);

  const dagen = useMemo(() => Array.from({ length: 7 }, (_, n) => plusDagen(begin, n)).filter((d) => d >= vanDag && d <= totDag), [begin, vanDag, totDag]);

  // de vrije tijden van de gekozen dag
  useEffect(() => {
    if (!dienst || !dag) return;
    const ctl = new AbortController();
    setTijden(null);
    setTijd(null);
    const q = new URLSearchParams({ dienst: dienst.id, dag });
    if (medewerker) q.set("medewerker", medewerker);
    void fetch(`/api/boeken/${slug}?${q}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fout"))))
      .then((d: { tijden?: string[] }) => setTijden(Array.isArray(d.tijden) ? d.tijden : []))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setFout("De tijden konden niet worden opgehaald. Probeer het opnieuw.");
      });
    return () => ctl.abort();
  }, [slug, dienst, dag, medewerker, ververs]);

  async function boek(e: React.FormEvent) {
    e.preventDefault();
    if (bezig || !dienst || !tijd) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/boeken/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dienstId: dienst.id, medewerkerId: medewerker, start: tijd, klant: { naam, telefoon, email }, opmerking, toestemming, website }),
      });
      const d = (await res.json().catch(() => null)) as { afspraak?: Bevestiging & { bevestigd?: boolean }; error?: { message?: string } } | null;
      if (!res.ok || !d?.afspraak) {
        setFout(d?.error?.message ?? "Boeken lukte niet. Probeer het opnieuw.");
        // net bezet: terug naar de tijden, zodat de klant meteen een andere kiest
        if (res.status === 409) {
          setStap("tijd");
          setVervers((n) => n + 1);
          setTijd(null);
        }
        return;
      }
      setKlaar(d.afspraak.bedrijfsnaam ? d.afspraak : { bedrijfsnaam, dienstNaam: dienst.naam, medewerkerNaam: "", start: tijd, duurMin: dienst.duurMin });
      setStap("klaar");
    } catch {
      setFout("Boeken lukte niet. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const kop = "font-display text-lg font-bold text-ink";
  const kaart = "rounded-2xl border border-hair bg-white p-5 shadow-sm";

  if (stap === "klaar" && klaar) {
    return (
      <div className={kaart} role="status">
        <h2 className={kop}>Je afspraak staat vast</h2>
        <p className="mt-2 text-sm text-neutralx-600">
          {klaar.dienstNaam} bij {klaar.bedrijfsnaam}
          {klaar.medewerkerNaam ? ` met ${klaar.medewerkerNaam}` : ""}.
        </p>
        <p className="mt-3 rounded-xl bg-paper-soft px-4 py-3 text-base font-semibold text-ink">
          {datumLang(klaar.start)}
          <br />
          {klok(klaar.start)} uur · {klaar.duurMin} minuten
        </p>
        <p className="mt-3 text-xs text-neutralx-500">Je krijgt hier geen bevestiging per e-mail. Noteer de tijd, en bel {klaar.bedrijfsnaam} als je wilt verzetten of annuleren.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      <section className={kaart} aria-labelledby="stap-dienst">
        <h2 id="stap-dienst" className={kop}>
          1. Wat wil je boeken?
        </h2>
        <ul className="mt-3 grid gap-2">
          {diensten.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => {
                  setDienst(d);
                  setDag(null);
                  setTijden(null);
                  setTijd(null);
                  setFout(null);
                  setStap("tijd");
                }}
                aria-pressed={dienst?.id === d.id}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm ${dienst?.id === d.id ? "border-brand-600 bg-brand-50" : "border-hairstrong hover:border-brand-500"}`}
              >
                <span className="font-semibold text-ink">{d.naam}</span>
                <span className="text-neutralx-600">
                  {d.duurMin} min{d.prijsCent !== null ? ` · ${euro(d.prijsCent)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {dienst && stap !== "dienst" && (
        <section className={kaart} aria-labelledby="stap-tijd">
          <h2 id="stap-tijd" className={kop}>
            2. Kies een dag en een tijd
          </h2>
          {medewerkers.length > 1 && (
            <label className="mt-3 block">
              <span className="field-label">Bij wie?</span>
              <select
                value={medewerker}
                onChange={(e) => {
                  setMedewerker(e.target.value);
                  setTijd(null);
                }}
                className="field-input"
              >
                <option value="">Geen voorkeur</option>
                {medewerkers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.naam}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn-ghost px-3 py-2 text-sm disabled:opacity-40" disabled={begin <= vanDag} onClick={() => setBegin((b) => (plusDagen(b, -7) < vanDag ? vanDag : plusDagen(b, -7)))} aria-label="Eerdere dagen">
              ‹
            </button>
            <ul className="grid flex-1 grid-cols-7 gap-1" aria-label="Dagen">
              {dagen.map((d) => {
                // een dag waarop het bedrijf nooit open is (bijvoorbeeld zondag), is niet te kiezen
                const gesloten = !openDagen.includes(dagDatum(d).getUTCDay());
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => setDag(d)}
                      disabled={gesloten}
                      aria-pressed={dag === d}
                      {...(gesloten ? { "aria-label": `${dagKort(d)}, gesloten` } : {})}
                      className={`w-full rounded-lg border px-1 py-2 text-center text-xs ${gesloten ? "border-hair text-neutralx-500 opacity-50" : dag === d ? "border-brand-600 bg-brand-50 font-semibold text-ink" : "border-hairstrong text-neutralx-600 hover:border-brand-500"}`}
                    >
                      {dagKort(d)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn-ghost px-3 py-2 text-sm disabled:opacity-40" disabled={plusDagen(begin, 7) > totDag} onClick={() => setBegin((b) => plusDagen(b, 7))} aria-label="Latere dagen">
              ›
            </button>
          </div>
          <div className="mt-4" aria-live="polite">
            {!dag && <p className="text-sm text-neutralx-500">Kies een dag om de vrije tijden te zien.</p>}
            {dag && tijden === null && <p className="text-sm text-neutralx-500">Tijden ophalen…</p>}
            {dag && tijden?.length === 0 && <p className="text-sm text-neutralx-600">Op {dagKort(dag)} is niets meer vrij. Kies een andere dag.</p>}
            {dag && tijden && tijden.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {tijden.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => {
                        setTijd(t);
                        setFout(null);
                        setStap("gegevens");
                      }}
                      aria-pressed={tijd === t}
                      className={`w-full rounded-lg border px-2 py-2 text-sm ${tijd === t ? "border-brand-600 bg-brand-50 font-semibold text-ink" : "border-hairstrong text-ink hover:border-brand-500"}`}
                    >
                      {klok(t)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {dienst && tijd && stap === "gegevens" && (
        <form onSubmit={(e) => void boek(e)} className={kaart} aria-labelledby="stap-gegevens">
          <h2 id="stap-gegevens" className={kop}>
            3. Je gegevens
          </h2>
          <p className="mt-1 text-sm text-neutralx-600">
            {dienst.naam} op {datumLang(tijd)} om {klok(tijd)} uur.
          </p>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="field-label">Je naam</span>
              <input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={80} autoComplete="name" className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">Telefoonnummer</span>
              <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" autoComplete="tel" className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">E-mailadres</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-500">Vul een telefoonnummer of een e-mailadres in, zodat {bedrijfsnaam} je kan bereiken.</span>
            </label>
            <label className="block">
              <span className="field-label">Opmerking (niet verplicht)</span>
              <textarea value={opmerking} onChange={(e) => setOpmerking(e.target.value)} rows={2} maxLength={300} className="field-input" />
            </label>
            {/* een mens ziet dit veld niet; een bot vult het in en wordt dan genegeerd */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} required className="mt-1" />
              <span>Ik vind het goed dat {bedrijfsnaam} mijn gegevens gebruikt om deze afspraak te regelen en mij daarover te bereiken.</span>
            </label>
          </div>
          <button type="submit" disabled={bezig} className="btn-primary mt-4 w-full disabled:opacity-60">
            {bezig ? "Bezig…" : "Afspraak bevestigen"}
          </button>
        </form>
      )}
    </div>
  );
}
