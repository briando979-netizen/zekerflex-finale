"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_NAAM, type Afspraak, type KlantKaart } from "@/lib/afspraken/model";

// De klantenkaart: alle klanten die een afspraak hebben gemaakt, met geschiedenis en een eigen notitie. Een klant kan hier
// helemaal gewist worden (naam, nummer, adres en notitie overal weg).

const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const kaart = "rounded-xl border border-hair bg-white p-4";
const knop = "rounded-lg border border-hairstrong px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand-500";

export function KlantenOverzicht() {
  const [klanten, setKlanten] = useState<KlantKaart[] | null>(null);
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/werkgever/klanten", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { klanten?: KlantKaart[]; error?: { message?: string } } | null;
      if (!res.ok || !d?.klanten) {
        setFout(d?.error?.message ?? "De klanten konden niet worden geladen.");
        return;
      }
      setKlanten(d.klanten);
    } catch {
      setFout("De klanten konden niet worden geladen. Controleer je verbinding.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (klanten ?? []).filter((k) => !q || `${k.naam} ${k.telefoon} ${k.email}`.toLowerCase().includes(q));
  }, [klanten, zoek]);
  const open = klanten?.find((k) => k.sleutel === gekozen) ?? null;

  if (fout && !klanten) {
    return (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    );
  }
  if (!klanten) return <p className="text-sm text-neutralx-500">Laden…</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <label className="block">
          <span className="field-label">Zoek een klant</span>
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam, telefoon of e-mail" className="field-input" />
        </label>
        {klanten.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-600">Nog geen klanten. Zodra iemand een afspraak boekt, komt hij hier te staan.</p>
        ) : lijst.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-600">Niemand gevonden met &ldquo;{zoek}&rdquo;.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {lijst.map((k) => (
              <li key={k.sleutel}>
                <button type="button" onClick={() => setGekozen(k.sleutel)} aria-pressed={gekozen === k.sleutel} className={`block w-full rounded-xl border px-4 py-3 text-left ${gekozen === k.sleutel ? "border-brand-600 bg-brand-50" : "border-hair bg-white hover:border-hairstrong"}`}>
                  <span className="block text-sm font-semibold text-ink">{k.naam || "(naam onbekend)"}</span>
                  <span className="block text-xs text-neutralx-500">
                    {k.aantal} afspra{k.aantal === 1 ? "ak" : "ken"}
                    {k.volgende ? ` · volgende ${datum(k.volgende)}` : k.laatste ? ` · laatst ${datum(k.laatste)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {open ? (
          <KlantDetail
            key={open.sleutel}
            klant={open}
            klaar={() => {
              setGekozen(null);
              void laad();
            }}
            bewaard={() => void laad()}
          />
        ) : (
          <p className="rounded-xl bg-paper-soft px-4 py-6 text-sm text-neutralx-600">Kies links een klant om de geschiedenis en je notitie te zien.</p>
        )}
      </div>
    </div>
  );
}

function KlantDetail({ klant, klaar, bewaard }: { klant: KlantKaart; klaar: () => void; bewaard: () => void }) {
  const [afspraken, setAfspraken] = useState<Afspraak[] | null>(null);
  const [notitie, setNotitie] = useState(klant.notitie);
  const [gelukt, setGelukt] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [wissen, setWissen] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    void fetch(`/api/werkgever/klanten?klant=${encodeURIComponent(klant.sleutel)}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { afspraken?: Afspraak[] } | null) => setAfspraken(d?.afspraken ?? []))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [klant.sleutel]);

  async function bewaarNotitie() {
    setFout(null);
    setGelukt(false);
    const res = await fetch("/api/werkgever/klanten", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sleutel: klant.sleutel, notitie }) });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(d?.error?.message ?? "De notitie kon niet worden bewaard.");
      return;
    }
    setGelukt(true);
    bewaard();
  }

  async function wisKlant() {
    setFout(null);
    const res = await fetch(`/api/werkgever/klanten?klant=${encodeURIComponent(klant.sleutel)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(d?.error?.message ?? "De klant kon niet worden gewist.");
      return;
    }
    klaar();
  }

  return (
    <div className={`${kaart} space-y-4`}>
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{klant.naam || "(naam onbekend)"}</h2>
        <p className="text-sm text-neutralx-600">{[klant.telefoon, klant.email].filter(Boolean).join(" · ") || "Geen contactgegevens"}</p>
        <p className="mt-1 text-xs text-neutralx-500">
          {klant.aantal} afspra{klant.aantal === 1 ? "ak" : "ken"} · {klant.geweest}× geweest · {klant.nietGekomen}× niet gekomen
        </p>
      </div>
      {fout && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
          {fout}
        </p>
      )}
      <label className="block">
        <span className="field-label">Notitie (alleen voor jou)</span>
        <textarea
          value={notitie}
          onChange={(e) => {
            setNotitie(e.target.value);
            setGelukt(false);
          }}
          rows={3}
          maxLength={1000}
          className="field-input"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => void bewaarNotitie()}>
          Notitie bewaren
        </button>
        {gelukt && (
          <span role="status" className="text-sm text-ok">
            Bewaard
          </span>
        )}
      </div>
      <section aria-labelledby="geschiedenis">
        <h3 id="geschiedenis" className="text-sm font-bold text-ink">
          Geschiedenis
        </h3>
        {afspraken === null ? (
          <p className="mt-1 text-sm text-neutralx-500">Laden…</p>
        ) : afspraken.length === 0 ? (
          <p className="mt-1 text-sm text-neutralx-500">Geen afspraken.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair rounded-lg border border-hair">
            {afspraken.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-ink">
                  {datumTijd(a.start)} · {a.dienstNaam}
                </span>
                <span className="text-xs text-neutralx-500">{STATUS_NAAM[a.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-hair p-3" aria-labelledby="wissen">
        <h3 id="wissen" className="text-sm font-bold text-ink">
          Klant wissen
        </h3>
        <p className="mt-1 text-xs text-neutralx-600">Wist de naam, het nummer, het e-mailadres, de opmerkingen en je notitie overal. De afspraken blijven als lege regel in je agenda staan. Dit kan niet ongedaan worden gemaakt.</p>
        {wissen ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">Weet je het zeker?</span>
            <button type="button" className="rounded-lg bg-crit px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void wisKlant()}>
              Ja, wis deze klant
            </button>
            <button type="button" className={knop} onClick={() => setWissen(false)}>
              Annuleren
            </button>
          </div>
        ) : (
          <button type="button" className={`${knop} mt-2`} onClick={() => setWissen(true)}>
            Klant wissen…
          </button>
        )}
      </section>
    </div>
  );
}
