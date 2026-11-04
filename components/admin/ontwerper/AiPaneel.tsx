"use client";

import { useState } from "react";
import { LETTERTYPES, type Thema } from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// Tabblad AI-hulp: beschrijf de sfeer, de AI stelt een stijl voor. Je ziet het
// voorstel eerst; "Probeer in het voorbeeld" zet het in je concept (ongedaan
// maken kan altijd). Zonder AI: kies een stijl bij Stijl.
// ---------------------------------------------------------------------------

const VOORBEELDEN = [
  "Rustig en betrouwbaar, voor bedrijven in de zorg",
  "Jong en energiek, voor studenten die bijverdienen",
  "Luxe en zakelijk, zoals een bank",
  "Warm en lokaal, zoals een familiebedrijf",
  "Strak en technisch, met veel wit",
];

export function AiPaneel({ thema, onProbeer }: { thema: Thema; onProbeer: (t: Thema) => void }) {
  const [wens, setWens] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [voorstel, setVoorstel] = useState<{ thema: Thema; uitleg: string } | null>(null);

  async function vraag(tekst = wens) {
    if (tekst.trim().length < 3) return;
    setBezig(true);
    setFout(null);
    setVoorstel(null);
    try {
      const r = await fetch("/api/admin/ontwerp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "ai-stijl", omschrijving: tekst.trim(), huidig: thema }) });
      const d = (await r.json().catch(() => null)) as { thema?: Thema; uitleg?: string; error?: { message?: string } } | null;
      if (!r.ok || !d?.thema) throw new Error(d?.error?.message ?? "De AI-hulp gaf geen voorstel. Probeer het opnieuw of kies een stijl bij Stijl.");
      setVoorstel({ thema: d.thema, uitleg: d.uitleg ?? "" });
    } catch (e) {
      setFout(e instanceof Error ? e.message : "De AI-hulp gaf geen voorstel.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            Stijl met AI
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
            Beschrijf hoe de site moet voelen. De AI kiest kleuren, lettertypes en vormen en controleert de leesbaarheid. Alles kan ook zonder AI, bij Stijl.
          </p>
        </div>
        <label htmlFor="ai-wens" className="sr-only">
          Hoe moet de site voelen?
        </label>
        <textarea
          id="ai-wens"
          value={wens}
          onChange={(e) => setWens(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Bijvoorbeeld: rustig en betrouwbaar, met een warme kleur"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
        />
        <div className="flex flex-wrap gap-1.5">
          {VOORBEELDEN.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setWens(v);
                void vraag(v);
              }}
              disabled={bezig}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: "var(--a-elev)", color: "var(--a-text)" }}
            >
              {v}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => vraag()} disabled={bezig || wens.trim().length < 3} className="a-button a-button-primary w-full disabled:opacity-50">
          {bezig ? "De AI denkt na…" : "Stel een stijl voor"}
        </button>
        {fout ? (
          <p role="alert" className="text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
            {fout}
          </p>
        ) : null}
      </section>

      {voorstel ? (
        <section className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            Voorstel
          </h2>
          <span className="flex h-12 overflow-hidden rounded-lg" aria-hidden="true">
            <span className="flex-1" style={{ background: voorstel.thema.inkt }} />
            <span className="flex-1" style={{ background: voorstel.thema.primair }} />
            <span className="flex-1" style={{ background: voorstel.thema.accent }} />
            <span className="grid flex-1 place-items-center font-bold" style={{ background: voorstel.thema.papier, color: voorstel.thema.primair, fontFamily: LETTERTYPES[voorstel.thema.koppen].stack }}>
              Aa
            </span>
          </span>
          <p className="text-xs" style={{ color: "var(--a-text)" }}>
            {LETTERTYPES[voorstel.thema.koppen].label} voor koppen, {LETTERTYPES[voorstel.thema.tekst].label} voor tekst.
          </p>
          {voorstel.uitleg ? (
            <p className="text-sm" style={{ color: "var(--a-text)" }}>
              {voorstel.uitleg}
            </p>
          ) : null}
          <button type="button" onClick={() => onProbeer(voorstel.thema)} className="a-button a-button-primary w-full">
            Probeer in het voorbeeld
          </button>
          <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>
            Bevalt het niet? Met Ongedaan maken ga je terug.
          </p>
        </section>
      ) : null}
    </div>
  );
}
