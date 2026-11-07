"use client";

import { useEffect, useState } from "react";
import { fooiOpties } from "@/lib/horeca/kassa";
import { BonDelen } from "@/components/horeca/live/BonDelen";

// Afrekenen aan tafel (iDEAL, pas, Apple Pay, Google Pay): de gast ziet wat er open staat en betaalt
// alles, of alleen wat hij zelf had (ieder zijn eigen deel). Wat een ander aan
// tafel op dat moment betaalt, staat er niet meer tussen. Terug van Stripe toont
// dit blok of het geld binnen is; dat vraagt de server aan Stripe zelf.

interface Regel {
  bestellingId: string;
  index: number;
  naam: string;
  prijsCent: number;
  aantal: number;
}

interface Rekening {
  tafel: string;
  kan: boolean;
  regels: Regel[];
  totaalCent: number;
  inBetalingCent: number;
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
const sleutel = (r: Pick<Regel, "bestellingId" | "index">) => `${r.bestellingId}:${r.index}`;
const foutTekst = async (r: Response, standaard: string) => ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? standaard;

export function AfrekenBlok({ slug, code, terug }: { slug: string; code: string; terug: Terug }) {
  const [rekening, setRekening] = useState<Rekening | null>(null);
  const [wijze, setWijze] = useState<"alles" | "eigen">("alles");
  const [gekozen, setGekozen] = useState<Record<string, number>>({});
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

  // afgebroken bij Stripe: laat de betaling los, zodat de gerechten weer vrij zijn voor de rest van de tafel
  useEffect(() => {
    if (terug?.betaling !== "geannuleerd" || !terug.b) return;
    void fetch(`/api/horeca/site/${slug}/afrekenen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, stop: terug.b }) }).catch(() => undefined);
  }, [slug, code, terug]);

  const eigenCent = rekening ? rekening.regels.reduce((s, r) => s + r.prijsCent * (gekozen[sleutel(r)] ?? 0), 0) : 0;
  const teBetalen = wijze === "alles" ? (rekening?.totaalCent ?? 0) : eigenCent;
  const opties = teBetalen > 0 ? fooiOpties(teBetalen) : [];

  const zetAantal = (r: Regel, n: number) => {
    setGekozen((g) => ({ ...g, [sleutel(r)]: Math.max(0, Math.min(r.aantal, n)) }));
    setFooi(0);
  };

  async function open() {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(adres, { cache: "no-store" });
      if (!r.ok) throw new Error(await foutTekst(r, "De rekening kon niet worden geladen. Vraag de bediening."));
      setRekening((await r.json()) as Rekening);
      setGekozen({});
      setFooi(0);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "De rekening kon niet worden geladen.");
    } finally {
      setBezig(false);
    }
  }

  async function betaal() {
    if (!rekening) return;
    setBezig(true);
    setFout("");
    try {
      const selectie =
        wijze === "eigen"
          ? rekening.regels.flatMap((r) => {
              const n = gekozen[sleutel(r)] ?? 0;
              return n > 0 ? [{ bestellingId: r.bestellingId, index: r.index, aantal: n }] : [];
            })
          : undefined;
      const r = await fetch(`/api/horeca/site/${slug}/afrekenen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, fooiCent: fooi, ...(selectie ? { selectie } : {}) }) });
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
          {bezig ? "Rekening laden…" : "Online afrekenen"}
        </button>
      ) : !rekening.regels.length ? (
        <p role="status" className="text-sm font-semibold">
          {rekening.inBetalingCent > 0 ? `Er wordt aan ${rekening.tafel} al ${euro(rekening.inBetalingCent)} betaald. Verder staat er niets open.` : `Er staat niets open op ${rekening.tafel}. Bestel eerst iets, of vraag de bediening.`}
        </p>
      ) : (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-bold">Rekening {rekening.tafel}</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Wat betaal je?">
            {(
              [
                ["alles", `Alles · ${euro(rekening.totaalCent)}`],
                ["eigen", "Alleen wat ik had"],
              ] as const
            ).map(([w, label]) => (
              <button
                key={w}
                type="button"
                aria-pressed={wijze === w}
                onClick={() => {
                  setWijze(w);
                  setFooi(0);
                }}
                className={`rounded-full px-3 py-2.5 text-sm font-bold ring-1 ${wijze === w ? "bg-[var(--rs-nacht)] text-[var(--rs-creme)] ring-transparent" : "ring-[#0A120E]/20"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {rekening.inBetalingCent > 0 && <p className="text-xs text-[#4B5563]">Iemand aan tafel betaalt nu al {euro(rekening.inBetalingCent)}; dat staat hier niet meer bij.</p>}
          <ul className="divide-y divide-[#0A120E]/10 text-sm">
            {rekening.regels.map((r) => {
              const n = gekozen[sleutel(r)] ?? 0;
              return (
                <li key={sleutel(r)} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    {wijze === "alles" ? `${r.aantal}× ` : ""}
                    {r.naam}
                    {wijze === "eigen" && <span className="block text-xs text-[#4B5563]">{euro(r.prijsCent)} per stuk · nog {r.aantal} open</span>}
                  </span>
                  {wijze === "alles" ? (
                    <span className="flex-shrink-0">{euro(r.prijsCent * r.aantal)}</span>
                  ) : (
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <button type="button" onClick={() => zetAantal(r, n - 1)} disabled={n === 0} aria-label={`Eén ${r.naam} minder`} className="grid h-9 w-9 place-items-center rounded-full text-lg font-bold ring-1 ring-[#0A120E]/20 disabled:opacity-30">
                        −
                      </button>
                      <span className="w-5 text-center font-bold" aria-live="polite">
                        {n}
                      </span>
                      <button
                        type="button"
                        onClick={() => zetAantal(r, n + 1)}
                        disabled={n >= r.aantal}
                        aria-label={`Eén ${r.naam} erbij`}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--rs-kleur-knop)] text-lg font-bold text-[var(--rs-op-kleur)] disabled:opacity-30"
                      >
                        +
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between font-bold">
            <span>{wijze === "alles" ? "Totaal" : "Jouw deel"}</span>
            <span>{euro(teBetalen)}</span>
          </p>
          {teBetalen > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold">Fooi (mag je zelf weten)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[{ label: "Geen fooi", fooiCent: 0 }, ...opties].map((o) => (
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
          )}
          {rekening.kan ? (
            <button type="button" disabled={bezig || teBetalen < 100} onClick={() => void betaal()} className="w-full rounded-full bg-[var(--rs-accent-knop)] px-5 py-3 font-bold text-[var(--rs-op-accent)] disabled:opacity-60">
              {bezig ? "Betaalpagina openen…" : teBetalen < 100 ? (wijze === "eigen" ? "Kies wat je had" : "Online betalen kan vanaf € 1") : `Betaal ${euro(teBetalen + fooi)}`}
            </button>
          ) : (
            <p role="status" className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#92400E]">
              Online afrekenen staat hier nog niet aan. Vraag de bediening om de rekening.
            </p>
          )}
          <p className="text-xs text-[#4B5563]">Met iDEAL, Apple Pay, Google Pay of je pas. Je betaalt veilig via Stripe; het geld gaat rechtstreeks naar de zaak.</p>
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
