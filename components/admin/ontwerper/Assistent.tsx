"use client";

import { useState } from "react";
import { zelfdeThema, type Thema } from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// De ontwerpassistent: typ wat je wilt veranderen, in gewone taal. Hij stelt
// een stijl en teksten voor; jij kiest wat je overneemt (de stijl gaat in je
// concept en kan ongedaan worden gemaakt, een tekst opent in Teksten om op te
// slaan). Niets gaat vanzelf live.
// ---------------------------------------------------------------------------

interface Antwoord {
  uitleg: string;
  thema: Thema | null;
  teksten: Record<string, string>;
  labels: Record<string, string>;
}

interface Beurt {
  id: number;
  vraag: string;
  antwoord?: Antwoord;
  fout?: string;
  stijlGedaan?: boolean;
  tekstGedaan?: string[];
}

const IDEEEN = ["Maak de site warmer en de knoppen ronder", "De homepagekop moet bedrijven aanspreken die personeel zoeken", "Rustiger: minder schaduw en een strakkere letter", "Maak de knoppen op de homepage uitnodigender"];

export function Assistent({ thema, teksten, onStijl, onTekst }: { thema: Thema; teksten: Record<string, string>; onStijl: (t: Thema) => void; onTekst: (key: string, waarde: string) => void }) {
  const [vraag, setVraag] = useState("");
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [bezig, setBezig] = useState(false);

  async function stel(tekst = vraag) {
    const v = tekst.trim();
    if (v.length < 3 || bezig) return;
    const id = Date.now();
    setBeurten((b) => [...b, { id, vraag: v }]);
    setVraag("");
    setBezig(true);
    try {
      const r = await fetch("/api/admin/ontwerp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "assistent", vraag: v, thema, teksten }) });
      const d = (await r.json().catch(() => null)) as (Antwoord & { error?: { message?: string } }) | null;
      if (!r.ok || !d) throw new Error(d?.error?.message ?? "De assistent gaf geen antwoord. Probeer het opnieuw.");
      setBeurten((b) => b.map((x) => (x.id === id ? { ...x, antwoord: { uitleg: d.uitleg, thema: d.thema, teksten: d.teksten ?? {}, labels: d.labels ?? {} } } : x)));
    } catch (e) {
      setBeurten((b) => b.map((x) => (x.id === id ? { ...x, fout: e instanceof Error ? e.message : "De assistent gaf geen antwoord." } : x)));
    } finally {
      setBezig(false);
    }
  }

  const zet = (id: number, patch: Partial<Beurt>) => setBeurten((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <section className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Assistent
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
          Zeg wat je wilt veranderen aan de stijl of de teksten. Je ziet eerst het voorstel; niets gaat vanzelf live.
        </p>
      </div>

      {beurten.length ? (
        <ol className="space-y-3" aria-live="polite">
          {beurten.map((b) => {
            const a = b.antwoord;
            const stijlAnders = a?.thema ? !zelfdeThema(a.thema, thema) : false;
            return (
              <li key={b.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm px-3 py-2 text-sm" style={{ background: "var(--a-accent)", color: "var(--a-on-accent)" }}>
                  {b.vraag}
                </p>
                {b.fout ? (
                  <p role="alert" className="text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
                    {b.fout}
                  </p>
                ) : !a ? (
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    De assistent denkt na…
                  </p>
                ) : (
                  <div className="space-y-2 rounded-2xl rounded-bl-sm p-3 text-sm" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
                    {a.uitleg ? <p>{a.uitleg}</p> : null}
                    {!a.thema && !Object.keys(a.teksten).length ? (
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        Hier zat geen wijziging in om over te nemen. Vraag het iets concreter, bijvoorbeeld: &ldquo;maak de hoofdkleur warmer bruin&rdquo; of &ldquo;zet de hoeken op extra rond&rdquo;.
                      </p>
                    ) : null}
                    {a.thema && stijlAnders ? (
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-16 overflow-hidden rounded" aria-hidden="true">
                          <span className="flex-1" style={{ background: a.thema.inkt }} />
                          <span className="flex-1" style={{ background: a.thema.primair }} />
                          <span className="flex-1" style={{ background: a.thema.accent }} />
                        </span>
                        <button
                          type="button"
                          disabled={b.stijlGedaan}
                          onClick={() => {
                            if (a.thema) onStijl(a.thema);
                            zet(b.id, { stijlGedaan: true });
                          }}
                          className="a-button a-button-primary text-xs disabled:opacity-50"
                        >
                          {b.stijlGedaan ? "In je concept gezet" : "Stijl in het voorbeeld zetten"}
                        </button>
                      </div>
                    ) : null}
                    {Object.entries(a.teksten).map(([key, waarde]) => {
                      const gedaan = b.tekstGedaan?.includes(key);
                      return (
                        <div key={key} className="rounded-lg p-2" style={{ background: "var(--a-panel)" }}>
                          <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>
                            {a.labels[key] ?? key}
                          </p>
                          <p className="mt-0.5">{waarde}</p>
                          <button
                            type="button"
                            disabled={gedaan}
                            onClick={() => {
                              onTekst(key, waarde);
                              zet(b.id, { tekstGedaan: [...(b.tekstGedaan ?? []), key] });
                            }}
                            className="a-button mt-1.5 text-xs disabled:opacity-50"
                          >
                            {gedaan ? "Staat in Teksten, klaar om op te slaan" : "Gebruik deze tekst"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {IDEEEN.map((i) => (
            <button key={i} type="button" onClick={() => void stel(i)} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              {i}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void stel();
        }}
        className="flex gap-2"
      >
        <label htmlFor="assistent-vraag" className="sr-only">
          Wat wil je veranderen?
        </label>
        <input
          id="assistent-vraag"
          value={vraag}
          onChange={(e) => setVraag(e.target.value)}
          maxLength={800}
          placeholder="Bijvoorbeeld: maak de kop op de homepage korter"
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
        />
        <button type="submit" disabled={bezig || vraag.trim().length < 3} className="a-button a-button-primary text-sm disabled:opacity-50">
          {bezig ? "…" : "Vraag"}
        </button>
      </form>
    </section>
  );
}
