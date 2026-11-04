"use client";

import { useEffect, useRef, useState } from "react";
import { SNELLE_VRAGEN, VRAAG_MAX, type Beurt } from "@/lib/rijschool/assistent";

// De knop "Stel een vraag" op de website van een rijschool, met een klein
// gesprek met de AI-assistent (lib/rijschool/assistent.ts). Alleen zichtbaar als
// de rijschool hem aanzette. Niets wordt bewaard: sluit je de pagina, dan is het
// gesprek weg. Links in een antwoord zijn alleen klikbaar als ze naar deze site gaan.

function MetLinks({ tekst }: { tekst: string }) {
  const delen = tekst.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {delen.map((d, i) => {
        if (!/^https?:\/\//.test(d)) return <span key={i}>{d}</span>;
        const schoon = d.replace(/[.,!?)]+$/, "");
        let eigen = false;
        try {
          eigen = new URL(schoon).host === window.location.host;
        } catch {
          eigen = false;
        }
        return eigen ? (
          <span key={i}>
            <a href={schoon} className="font-semibold underline underline-offset-2">
              {schoon.replace(/^https?:\/\/[^/]+/, "") || schoon}
            </a>
            {d.slice(schoon.length)}
          </span>
        ) : (
          <span key={i}>{d}</span>
        );
      })}
    </>
  );
}

export function VraagAssistent({ slug, naam }: { slug: string; naam: string }) {
  const [open, setOpen] = useState(false);
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const knop = useRef<HTMLButtonElement>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const lijst = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) invoer.current?.focus();
  }, [open]);
  useEffect(() => {
    const el = lijst.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [beurten.length, bezig]);

  function sluit() {
    setOpen(false);
    knop.current?.focus();
  }

  async function stel(tekst: string) {
    const v = tekst.trim();
    if (v.length < 2 || bezig) return;
    setFout(null);
    setBezig(true);
    setVraag("");
    const eerder = beurten;
    setBeurten([...eerder, { van: "bezoeker", tekst: v }]);
    try {
      const res = await fetch(`/api/rijschool/site/${slug}/vraag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vraag: v, eerder }),
      });
      const d = (await res.json().catch(() => ({}))) as { antwoord?: string; error?: { message?: string } };
      if (!res.ok || !d.antwoord) throw new Error(d.error?.message ?? "Er ging iets mis. Probeer het opnieuw.");
      setBeurten((b) => [...b, { van: "assistent", tekst: d.antwoord ?? "" }]);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis. Probeer het opnieuw.");
      setBeurten(eerder);
      setVraag(v);
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      {open && (
        <section
          id="vraag-assistent"
          aria-label={`Vraag het ${naam}`}
          onKeyDown={(e) => e.key === "Escape" && sluit()}
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-3xl bg-white text-schw-night shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-schw-night/10 sm:inset-x-auto sm:right-6 sm:w-[24rem]"
        >
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4" style={{ background: "var(--rs-nacht)", color: "#FFF6EA" }}>
            <div>
              <p className="font-display text-lg font-bold">Stel een vraag</p>
              <p className="text-xs opacity-85">Antwoorden komen van een AI-assistent, alleen met de gegevens van {naam}. Deel geen persoonlijke gegevens.</p>
            </div>
            <button type="button" onClick={sluit} aria-label="Sluiten" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20">
              ×
            </button>
          </div>
          <div ref={lijst} role="log" aria-live="polite" aria-label="Gesprek met de assistent" className="min-h-[8rem] flex-1 overflow-y-auto bg-schw-cream px-4 py-3">
            {beurten.length === 0 ? (
              <div>
                <p className="text-sm">Waar kan ik je mee helpen? Bijvoorbeeld:</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {SNELLE_VRAGEN.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => void stel(s)} className="rounded-full bg-white px-3 py-1.5 text-left text-sm font-medium ring-1 ring-schw-night/15 hover:ring-schw-night/40">
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="space-y-2">
                {beurten.map((b, i) => (
                  <li key={i} className={`flex ${b.van === "bezoeker" ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm ${b.van === "bezoeker" ? "rounded-br-md" : "rounded-bl-md bg-white ring-1 ring-schw-night/10"}`}
                      style={b.van === "bezoeker" ? { background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" } : undefined}
                    >
                      <span className="sr-only">{b.van === "bezoeker" ? "Jij: " : "Assistent: "}</span>
                      {b.van === "assistent" ? <MetLinks tekst={b.tekst} /> : b.tekst}
                    </p>
                  </li>
                ))}
                {bezig && (
                  <li className="flex justify-start">
                    <p className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-schw-night/70 ring-1 ring-schw-night/10">Even denken…</p>
                  </li>
                )}
              </ol>
            )}
          </div>
          <form
            className="border-t border-schw-night/10 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void stel(vraag);
            }}
          >
            {fout && (
              <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {fout}
              </p>
            )}
            <div className="flex items-center gap-2">
              <label htmlFor="vraag-invoer" className="sr-only">
                Je vraag
              </label>
              <input
                id="vraag-invoer"
                ref={invoer}
                value={vraag}
                onChange={(e) => setVraag(e.target.value)}
                maxLength={VRAAG_MAX}
                placeholder="Typ je vraag"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-full border border-schw-night/20 bg-white px-4 py-2.5 text-sm outline-none focus:border-schw-night/60"
              />
              <button
                type="submit"
                disabled={bezig || vraag.trim().length < 2}
                className="rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: "var(--rs-kleur-knop)", color: "var(--rs-op-kleur)" }}
              >
                Vraag
              </button>
            </div>
          </form>
        </section>
      )}
      <button
        ref={knop}
        type="button"
        onClick={() => (open ? sluit() : setOpen(true))}
        aria-expanded={open}
        {...(open ? { "aria-controls": "vraag-assistent" } : {})}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-[0_14px_40px_-12px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 sm:right-6"
        style={{ background: "var(--rs-accent-knop)", color: "var(--rs-op-accent)" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        {open ? "Sluiten" : "Stel een vraag"}
      </button>
    </>
  );
}
