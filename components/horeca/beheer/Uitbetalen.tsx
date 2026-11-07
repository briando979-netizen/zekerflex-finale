"use client";

import { useEffect, useState } from "react";
import { useInAndroidApp } from "@/components/app/useInAndroidApp";
import { euroTekst, leesBedrag } from "@/lib/horeca/uitbetalen-kern";

// Afrekenen → "Jullie geld": het saldo op het eigen Stripe-account van de zaak,
// automatisch uitbetalen aan/uit en zelf opnemen (lib/horeca/uitbetalen.ts).
// Het geld staat bij Stripe, niet bij ZekerFlex, en gaat altijd naar de
// bankrekening die bij Stripe staat. In de Android-app verborgen, net als de
// andere geldfuncties (lib/app-mode.ts).

interface Uitbetaling {
  id: string;
  bedragCent: number;
  statusTekst: string;
  aankomst: string | null;
  handmatig: boolean;
}
interface Stand {
  automatisch: boolean;
  beschikbaarCent: number;
  onderwegCent: number;
  uitbetalingen: Uitbetaling[];
}

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function post(body: unknown): Promise<{ stand?: Stand | null; bedragCent?: number; aankomst?: string | null }> {
  const r = await fetch("/api/horeca/beheer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as { stand?: Stand | null; bedragCent?: number; aankomst?: string | null; error?: { message?: string } };
  if (!r.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het zo opnieuw.");
  return d;
}

export function Uitbetalen() {
  const inApp = useInAndroidApp();
  const [stand, setStand] = useState<Stand | null | undefined>(undefined);
  const [eigenaar, setEigenaar] = useState(false);
  const [bedrag, setBedrag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  useEffect(() => {
    let weg = false;
    void fetch("/api/horeca/beheer?alleen=uitbetalen", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ stand: Stand | null; eigenaar: boolean }>) : null))
      .then((d) => {
        if (weg) return;
        setStand(d?.stand ?? null);
        setEigenaar(Boolean(d?.eigenaar));
      })
      .catch(() => {
        if (!weg) setStand(null);
      });
    return () => {
      weg = true;
    };
  }, []);

  if (inApp !== false || stand === undefined) return null;
  if (stand === null) return <p className="mt-3 text-xs text-neutralx-500">Het saldo bij Stripe is nu niet te zien. Kijk later nog eens, of open het Stripe-overzicht.</p>;

  async function zetAutomatisch(aan: boolean) {
    setBezig(true);
    setMelding(null);
    try {
      const d = await post({ actie: "uitbetalen-automatisch", aan });
      if (d.stand) setStand(d.stand);
      setMelding({ ok: true, tekst: aan ? "Automatisch uitbetalen staat aan: Stripe zet het geld elke werkdag op jullie rekening." : "Automatisch uitbetalen staat uit: het geld blijft klaarstaan tot jullie het opnemen." });
    } catch (e) {
      setMelding({ ok: false, tekst: e instanceof Error ? e.message : "Dat lukte niet." });
    } finally {
      setBezig(false);
    }
  }

  async function opnemen() {
    const cent = leesBedrag(bedrag);
    if (cent === "fout") {
      setMelding({ ok: false, tekst: "Vul een bedrag in zoals 125,50, of laat het leeg om alles op te nemen." });
      return;
    }
    setBezig(true);
    setMelding(null);
    try {
      const d = await post({ actie: "uitbetalen-opnemen", ...(cent !== null ? { bedragCent: cent } : {}) });
      if (d.stand) setStand(d.stand);
      setBedrag("");
      setMelding({ ok: true, tekst: `${euroTekst(d.bedragCent ?? 0)} is onderweg naar jullie bankrekening${d.aankomst ? `, verwacht op ${datum(d.aankomst)}` : ""}.` });
    } catch (e) {
      setMelding({ ok: false, tekst: e instanceof Error ? e.message : "Opnemen lukte niet." });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-hair p-3 text-sm">
      <p className="font-semibold text-ink">Jullie geld</p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <p>
          Klaar om op te nemen: <strong className="text-money-ink">{euroTekst(stand.beschikbaarCent)}</strong>
        </p>
        <p className="text-neutralx-600">Nog onderweg van gasten: {euroTekst(stand.onderwegCent)}</p>
      </div>

      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={stand.automatisch} disabled={bezig || !eigenaar} onChange={(e) => void zetAutomatisch(e.target.checked)} />
        <span>
          <span className="font-semibold">Automatisch uitbetalen</span>
          <span className="block text-xs text-neutralx-600">Aan: Stripe zet het geld elke werkdag op jullie bankrekening. Uit: het geld blijft klaarstaan en jullie nemen het op wanneer je wilt.</span>
        </span>
      </label>

      {!stand.automatisch && eigenaar && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="field-label">Bedrag (leeg = alles)</span>
            <input className="field-input w-32" inputMode="decimal" placeholder="0,00" value={bedrag} onChange={(e) => setBedrag(e.target.value)} disabled={bezig} />
          </label>
          <button type="button" className="btn-primary disabled:opacity-60" disabled={bezig || stand.beschikbaarCent < 100} onClick={() => void opnemen()}>
            {bezig ? "Bezig…" : "Opnemen naar mijn bank"}
          </button>
        </div>
      )}
      {!eigenaar && <p className="mt-2 text-xs text-neutralx-500">Alleen de eigenaar van de zaak kan het uitbetalen regelen.</p>}

      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-2 font-semibold ${melding.ok ? "text-ok" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}

      {stand.uitbetalingen.length > 0 && (
        <ul className="mt-3 divide-y divide-hair text-xs">
          {stand.uitbetalingen.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                {euroTekst(u.bedragCent)} <span className="text-neutralx-500">· {u.handmatig ? "zelf opgenomen" : "automatisch"}</span>
              </span>
              <span className="text-neutralx-600">
                {u.statusTekst}
                {u.aankomst ? ` · ${datum(u.aankomst)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-neutralx-500">Het geld staat op jullie eigen Stripe-account (Stripe bewaart het, met vergunning), niet bij ZekerFlex. Het gaat altijd naar de bankrekening die bij Stripe staat.</p>
    </div>
  );
}
