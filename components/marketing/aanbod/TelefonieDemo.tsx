"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { VOORBEELD_ZAAK, type DemoGesprek, type Spreker } from "@/lib/telephony/demo";

// ---------------------------------------------------------------------------
// Luister mee op /aanbod/telefonie (16 nov 2026): eerst een vast voorbeeld, daarna een gesprek voor de eigen zaak.
// De bezoeker vult zijn website of bedrijfsnaam in; de server (app/api/demo/telefoon) leest de site, bouwt een gesprek
// met een testklant met de feiten van die site (lib/telephony/demo.ts) en leest het voor met twee eigen stemmen. Het
// geluid komt als base64 en wordt hier een blob-adres (de CSP staat media-src blob: toe, data: niet). De regels spelen
// na elkaar af, met de tekst erbij.
// ---------------------------------------------------------------------------

interface Regel {
  wie: Spreker;
  tekst: string;
  url: string | null;
}

interface Gesprek {
  zaak: string;
  regels: Regel[];
}

const PAUZE_MS = 350;

function blobAdres(g: { mime: string; data: string }): string | null {
  try {
    const bin = atob(g.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: g.mime }));
  } catch {
    return null;
  }
}

export function TelefonieDemo() {
  const [invoer, setInvoer] = useState("");
  const [extra, setExtra] = useState("");
  const [gesprek, setGesprek] = useState<Gesprek | null>(null);
  const [bezig, setBezig] = useState<null | "voorbeeld" | "eigen">(null);
  const [fout, setFout] = useState<string | null>(null);
  const [huidig, setHuidig] = useState(-1);
  const [speelt, setSpeelt] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const wacht = useRef<number | null>(null);

  // oude blob-adressen opruimen als er een nieuw gesprek komt of de pagina sluit
  useEffect(() => {
    return () => {
      for (const r of gesprek?.regels ?? []) if (r.url) URL.revokeObjectURL(r.url);
    };
  }, [gesprek]);
  useEffect(() => {
    return () => {
      if (wacht.current) window.clearTimeout(wacht.current);
    };
  }, []);

  function stop() {
    if (wacht.current) window.clearTimeout(wacht.current);
    audio.current?.pause();
    setSpeelt(false);
  }

  function speel(g: Gesprek, vanaf: number) {
    const i = g.regels.findIndex((r, n) => n >= vanaf && r.url);
    const el = audio.current;
    if (i < 0 || !el) {
      setSpeelt(false);
      setHuidig(-1);
      return;
    }
    setHuidig(i);
    setSpeelt(true);
    el.src = g.regels[i]?.url ?? "";
    el.onended = () => {
      wacht.current = window.setTimeout(() => speel(g, i + 1), PAUZE_MS);
    };
    // sommige browsers spelen alleen na een tik af: dan blijft de knop Afspelen staan
    void el.play().catch(() => setSpeelt(false));
  }

  async function haal(body: Record<string, unknown>, soort: "voorbeeld" | "eigen") {
    stop();
    setFout(null);
    setBezig(soort);
    try {
      const res = await fetch("/api/demo/telefoon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as (DemoGesprek & { error?: { message?: string } }) | null;
      if (!res.ok || !data?.regels) {
        setFout(data?.error?.message ?? "Het gesprek kon nu niet gemaakt worden. Probeer het zo nog eens.");
        return;
      }
      const g: Gesprek = { zaak: data.zaak, regels: data.regels.map((r) => ({ wie: r.wie, tekst: r.tekst, url: r.geluid ? blobAdres(r.geluid) : null })) };
      setGesprek(g);
      setHuidig(-1);
      if (g.regels.some((r) => r.url)) speel(g, 0);
    } catch {
      setFout("Geen verbinding. Probeer het zo nog eens.");
    } finally {
      setBezig(null);
    }
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    if (invoer.trim().length < 2) {
      setFout("Vul je website of de naam van je zaak in.");
      return;
    }
    void haal({ invoer: invoer.trim(), extra }, "eigen");
  }

  const zonderGeluid = gesprek !== null && !gesprek.regels.some((r) => r.url);

  return (
    <section aria-labelledby="telefoon-demo-kop" className="bg-white">
      <div className="shell grid gap-10 py-16 md:py-20 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="eyebrow text-brand-700">Luister mee</p>
          <h2 id="telefoon-demo-kop" className="mt-2 font-display text-3xl font-bold text-ink md:text-4xl">
            Hoor hoe de assistent <span className="text-brand-600">opneemt</span>
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-neutralx-700">
            Vul je website of de naam van je zaak in. De assistent leest je website en voert een kort gesprek met een testklant, zodat je hoort hoe het voor jouw zaak klinkt.
          </p>
          <form onSubmit={verstuur} className="mt-6 max-w-xl" noValidate>
            <label htmlFor="telefoon-demo-invoer" className="block text-sm font-semibold text-ink">
              Je website of bedrijfsnaam
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="telefoon-demo-invoer"
                value={invoer}
                onChange={(e) => setInvoer(e.target.value)}
                maxLength={200}
                autoComplete="organization"
                placeholder="bijv. jouwzaak.nl of Bakkerij Jansen"
                className="min-w-0 flex-1 rounded-xl border border-hair bg-white px-4 py-3 text-[16px] text-ink placeholder:text-neutralx-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                aria-describedby="telefoon-demo-uitleg"
              />
              <button type="submit" className="btn-primary justify-center whitespace-nowrap" disabled={bezig !== null}>
                {bezig === "eigen" ? "Bezig…" : "Maak mijn gesprek"}
              </button>
            </div>
            {/* botveld: onzichtbaar voor mensen */}
            <div className="hidden" aria-hidden="true">
              <label>
                Laat dit leeg
                <input tabIndex={-1} autoComplete="off" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </label>
            </div>
            <p id="telefoon-demo-uitleg" className="mt-2 text-sm text-neutralx-500">
              Het maken duurt een paar seconden. We bewaren niets van wat je invult.
            </p>
          </form>
          <button type="button" onClick={() => void haal({ voorbeeld: true }, "voorbeeld")} disabled={bezig !== null} className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-brand-700 hover:underline disabled:opacity-60">
            <span aria-hidden>▶</span> {bezig === "voorbeeld" ? "Even laden…" : "Of luister eerst naar een voorbeeld"}
          </button>
          {fout && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {fout}
            </p>
          )}
        </div>

        <div className="relative rounded-2xl border border-hair bg-white p-5 shadow-lift md:p-6">
          <audio ref={audio} preload="none" className="hidden" />
          {bezig === "eigen" ? (
            <div role="status" className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center text-neutralx-600">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" aria-hidden />
              <p className="font-semibold text-ink">De assistent leest je website en oefent het gesprek…</p>
              <p className="text-sm">Dit duurt een paar seconden.</p>
            </div>
          ) : !gesprek ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 text-center text-neutralx-500">
              <span aria-hidden className="text-4xl">📞</span>
              <p className="max-w-xs text-sm">Hier hoor en lees je het gesprek tussen de assistent en een testklant.</p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutralx-500">Testgesprek</p>
                  <p className="truncate font-display text-xl font-bold text-ink">{gesprek.zaak}</p>
                </div>
                {!zonderGeluid && (
                  <button type="button" onClick={() => (speelt ? stop() : speel(gesprek, huidig >= 0 ? huidig : 0))} className="btn-primary px-4 py-2 text-sm">
                    {speelt ? "Pauze" : huidig >= 0 ? "Verder" : "Afspelen"}
                  </button>
                )}
              </div>
              {zonderGeluid && <p className="mt-3 rounded-lg bg-paper-soft px-3 py-2 text-sm text-neutralx-600">De stem is nu even niet bereikbaar; hieronder lees je het gesprek.</p>}
              <ol className="mt-4 space-y-2.5">
                {gesprek.regels.map((r, i) => (
                  <li key={i} className={`flex ${r.wie === "assistent" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug transition ${
                        r.wie === "assistent" ? "rounded-tl-md bg-brand-50 text-ink" : "rounded-tr-md bg-neutralx-100 text-ink"
                      } ${i === huidig ? "ring-2 ring-brand-500" : ""}`}
                      aria-current={i === huidig ? "true" : undefined}
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-neutralx-500">{r.wie === "assistent" ? "Assistent" : "Testklant"}</span>
                      {r.tekst}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-neutralx-500">
                Een voorbeeld met een verzonnen testklant, voorgelezen door onze eigen computerstem.
                {gesprek.zaak !== VOORBEELD_ZAAK ? " De assistent noemt alleen wat op je website staat; de rest zet hij door als terugbelverzoek." : ""} Op je eigen ZekerFlex-nummer werkt hij net zo.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
