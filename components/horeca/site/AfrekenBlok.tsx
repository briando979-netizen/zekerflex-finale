"use client";

import { useEffect, useState } from "react";
import { BonDelen } from "@/components/horeca/live/BonDelen";

// Afrekenen aan tafel met iDEAL: de gast ziet wat er open staat, kiest eventueel
// een fooi en betaalt via Stripe. Terug van Stripe toont dit blok of het geld
// binnen is; dat vraagt de server aan Stripe zelf (lib/horeca/betalen.ts).

interface Rekening {
  tafel: string;
  kan: boolean;
  regels: { naam: string; prijsCent: number; aantal: number }[];
  totaalCent: number;
  fooiOpties: { label: string; fooiCent: number }[];
}

interface Stand {
  status: "OPEN" | "BETAALD" | "MISLUKT";
  bedragCent: number;
  fooiCent: number;
  bonNummer: number | null;
  /** ondertekende link naar de bon (alleen als betaald) */
  token?: string;
}

export type Terug = { betaling: "gelukt" | "geannuleerd"; b: string } | null;

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
const foutTekst = async (r: Response, standaard: string) => ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? standaard;

export function AfrekenBlok({ slug, code, terug }: { slug: string; code: string; terug: Terug }) {
  const [rekening, setRekening] = useState<Rekening | null>(null);
  const [fooi, setFooi] = useState(0);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [stand, setStand] = useState<Stand | null>(null);
  const [wachten, setWachten] = useState(terug?.betaling === "gelukt" && Boolean(terug.b));
  const adres = `/api/horeca/site/${slug}/afrekenen?code=${encodeURIComponent(code)}`;

  // terug van Stripe: kijk een paar minuten of het geld binnen is
  useEffect(() => {
    if (terug?.betaling !== "gelukt" || !terug.b) return;
    let pogingen = 0;
    let klaar = false;
    const kijk = async () => {
      pogingen += 1;
      const r = await fetch(`${adres}&b=${encodeURIComponent(terug.b)}`, { cache: "no-store" }).catch(() => null);
      const d = r?.ok ? ((await r.json()) as Stand) : null;
      if (d) setStand(d);
      if ((d && d.status !== "OPEN") || pogingen >= 40) {
        klaar = true;
        setWachten(false);
      }
    };
    void kijk();
    const t = window.setInterval(() => {
      if (!klaar) void kijk();
    }, 3000);
    return () => window.clearInterval(t);
  }, [adres, terug]);

  async function open() {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(adres, { cache: "no-store" });
      if (!r.ok) throw new Error(await foutTekst(r, "De rekening kon niet worden geladen. Vraag de bediening."));
      setRekening((await r.json()) as Rekening);
      setFooi(0);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "De rekening kon niet worden geladen.");
    } finally {
      setBezig(false);
    }
  }

  async function betaal() {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(`/api/horeca/site/${slug}/afrekenen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, fooiCent: fooi }) });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (!r.ok || !d.url) throw new Error(d.error?.message ?? "De betaalpagina kon niet worden geopend. Probeer het opnieuw of vraag de bediening.");
      window.location.assign(d.url);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Afrekenen lukte niet.");
      setBezig(false);
    }
  }

  if (terug?.betaling === "gelukt") {
    const betaald = stand?.status === "BETAALD";
    return (
      <div role="status" className="rounded-[1.75rem] bg-[var(--rs-nacht)] p-6 text-[var(--rs-creme)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Afrekenen</p>
        <p className="mt-2 font-display text-2xl font-bold">{betaald ? "Betaald, bedankt!" : stand?.status === "MISLUKT" ? "De betaling is niet gelukt" : "We wachten op je bank…"}</p>
        {betaald && stand && (
          <p className="mt-2">
            {euro(stand.bedragCent + stand.fooiCent)} ontvangen{stand.fooiCent > 0 ? `, waarvan ${euro(stand.fooiCent)} fooi` : ""}
            {stand.bonNummer ? ` · bon ${stand.bonNummer}` : ""}. Fijne avond nog!
          </p>
        )}
        {!betaald && stand?.status !== "MISLUKT" && <p className="mt-2">{wachten ? "Dit duurt meestal een paar seconden." : "Je bank heeft het nog niet bevestigd. De bediening ziet het zodra het binnen is."}</p>}
        {stand?.status === "MISLUKT" && <p className="mt-2">Er is niets afgeschreven. Probeer het opnieuw of vraag de bediening om de rekening.</p>}
        {betaald && stand?.token && (
          <div className="mt-5 space-y-3 border-t border-white/15 pt-4">
            <a href={`/bon/${stand.token}`} className="inline-block rounded-full bg-[var(--rs-accent-knop)] px-5 py-2.5 font-bold text-[var(--rs-op-accent)]">
              Bekijk je bon
            </a>
            <BonDelen token={stand.token} donker />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
      {terug?.betaling === "geannuleerd" && !rekening && (
        <p role="status" className="mb-3 rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#92400E]">
          Je hebt het betalen afgebroken. Er is niets afgeschreven.
        </p>
      )}
      {!rekening ? (
        <button type="button" disabled={bezig} onClick={() => void open()} className="w-full rounded-full bg-[var(--rs-accent-knop)] px-5 py-3 font-bold text-[var(--rs-op-accent)] disabled:opacity-60">
          {bezig ? "Rekening laden…" : "Afrekenen met iDEAL"}
        </button>
      ) : !rekening.regels.length ? (
        <p role="status" className="text-sm font-semibold">
          Er staat niets open op {rekening.tafel}. Bestel eerst iets, of vraag de bediening.
        </p>
      ) : (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-bold">Rekening {rekening.tafel}</h2>
          <ul className="divide-y divide-[#0A120E]/10 text-sm">
            {rekening.regels.map((r, i) => (
              <li key={`${r.naam}-${i}`} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  {r.aantal}× {r.naam}
                </span>
                <span className="flex-shrink-0">{euro(r.prijsCent * r.aantal)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-bold">
            <span>Totaal</span>
            <span>{euro(rekening.totaalCent)}</span>
          </p>
          <fieldset>
            <legend className="text-sm font-semibold">Fooi (mag je zelf weten)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[{ label: "Geen fooi", fooiCent: 0 }, ...rekening.fooiOpties].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={fooi === o.fooiCent}
                  onClick={() => setFooi(o.fooiCent)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 ${fooi === o.fooiCent ? "bg-[var(--rs-nacht)] text-[var(--rs-creme)] ring-transparent" : "ring-[#0A120E]/20"}`}
                >
                  {o.label}
                  {o.fooiCent > 0 && ` (${euro(o.fooiCent)})`}
                </button>
              ))}
            </div>
          </fieldset>
          {rekening.kan ? (
            <button type="button" disabled={bezig} onClick={() => void betaal()} className="w-full rounded-full bg-[var(--rs-accent-knop)] px-5 py-3 font-bold text-[var(--rs-op-accent)] disabled:opacity-60">
              {bezig ? "Betaalpagina openen…" : `Betaal ${euro(rekening.totaalCent + fooi)} met iDEAL`}
            </button>
          ) : (
            <p role="status" className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#92400E]">
              Online afrekenen staat hier nog niet aan. Vraag de bediening om de rekening.
            </p>
          )}
          <p className="text-xs text-[#4B5563]">Je betaalt veilig via Stripe. Het geld gaat rechtstreeks naar de zaak.</p>
        </div>
      )}
      {fout && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDE2E2] px-3 py-2 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
    </div>
  );
}
