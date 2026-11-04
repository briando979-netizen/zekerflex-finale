"use client";

import { useEffect, useState } from "react";
import { SEO_OMSCHRIJVING_RICHT, SEO_TITEL_RICHT, volledigeTitel, type SeoEigen, type SeoPad, type SeoStandaard } from "@/lib/ontwerp/seo";

// ---------------------------------------------------------------------------
// Tabblad SEO: titel en omschrijving voor Google van de vaste pagina's, met
// een voorbeeld van het zoekresultaat en tellers. Leeg = de standaard. Opslaan
// zet het meteen live. (Eigen pagina's hebben dit al in het tabblad Pagina's.)
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };

interface Rij {
  pad: SeoPad;
  standaard: SeoStandaard;
  eigen: SeoEigen | null;
}

function Teller({ n, richt }: { n: number; richt: number }) {
  const te = n > richt;
  return (
    <span className="text-[11px] font-semibold" style={{ color: te ? "var(--a-warn-ink)" : "var(--a-mute)" }}>
      {n} / {richt}
      {te ? " · Google kort dit waarschijnlijk af" : ""}
    </span>
  );
}

function PaginaSeo({ rij, onBewaard }: { rij: Rij; onBewaard: (paginas: Rij[], tekst: string) => void }) {
  const [titel, setTitel] = useState(rij.eigen?.titel ?? "");
  const [omschrijving, setOmschrijving] = useState(rij.eigen?.omschrijving ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const effTitel = titel.trim() || rij.standaard.titel;
  const effOmschrijving = omschrijving.trim() || rij.standaard.omschrijving;
  const volledig = volledigeTitel(rij.pad, effTitel);
  const gewijzigd = titel.trim() !== (rij.eigen?.titel ?? "") || omschrijving.trim() !== (rij.eigen?.omschrijving ?? "");
  const id = rij.pad === "/" ? "home" : rij.pad.slice(1);

  async function stuur(init: RequestInit, url = "/api/admin/ontwerp/seo") {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const d = (await r.json().catch(() => null)) as { paginas?: Rij[]; error?: { message?: string } } | null;
      if (!r.ok || !d?.paginas) throw new Error(d?.error?.message ?? "Opslaan lukte niet.");
      const nieuw = d.paginas.find((p) => p.pad === rij.pad);
      setTitel(nieuw?.eigen?.titel ?? "");
      setOmschrijving(nieuw?.eigen?.omschrijving ?? "");
      onBewaard(d.paginas, init.method === "DELETE" ? `${rij.standaard.naam}: de standaard staat weer live.` : `${rij.standaard.naam}: live. Google ziet het bij het volgende bezoek.`);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <li className="space-y-2 rounded-xl p-3" style={paneel}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          {rij.standaard.naam}
        </h3>
        <span className="text-[11px]" style={mute}>
          {rij.eigen ? "Eigen versie live" : "Standaard"}
        </span>
      </div>
      {/* het zoekresultaat zoals Google het ongeveer toont */}
      <div className="rounded-lg bg-white p-3" aria-label={`Voorbeeld in Google: ${rij.standaard.naam}`}>
        <p className="text-[12px] text-[#202124]">zekerflex.com{rij.pad === "/" ? "" : ` › ${rij.pad.slice(1)}`}</p>
        <p className="mt-0.5 line-clamp-1 text-[17px] leading-snug text-[#1a0dab]">{volledig}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{effOmschrijving}</p>
      </div>
      <label className="block" htmlFor={`seo-titel-${id}`}>
        <span className="mb-1 flex items-center justify-between gap-2 text-xs" style={mute}>
          <span>Titel{rij.standaard.absoluut ? "" : " (“ · ZekerFlex” komt er vanzelf achter)"}</span>
          <Teller n={volledig.length} richt={SEO_TITEL_RICHT} />
        </span>
      </label>
      <input id={`seo-titel-${id}`} value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={120} placeholder={rij.standaard.titel} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
      <label className="block" htmlFor={`seo-omschrijving-${id}`}>
        <span className="mb-1 flex items-center justify-between gap-2 text-xs" style={mute}>
          <span>Omschrijving</span>
          <Teller n={effOmschrijving.length} richt={SEO_OMSCHRIJVING_RICHT} />
        </span>
      </label>
      <textarea id={`seo-omschrijving-${id}`} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={320} rows={3} placeholder={rij.standaard.omschrijving} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => stuur({ method: "PUT", body: JSON.stringify({ pad: rij.pad, titel, omschrijving }) })} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
          {bezig ? "Bezig…" : "Opslaan (meteen live)"}
        </button>
        {rij.eigen ? (
          <button type="button" onClick={() => stuur({ method: "DELETE" }, `/api/admin/ontwerp/seo?pad=${encodeURIComponent(rij.pad)}`)} disabled={bezig} className="a-button text-xs">
            Terug naar de standaard
          </button>
        ) : null}
      </div>
      {fout ? (
        <p role="alert" className="text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      ) : null}
    </li>
  );
}

export function SeoPaneel() {
  const [paginas, setPaginas] = useState<Rij[] | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ontwerp/seo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { paginas?: Rij[] } | null) => setPaginas(d?.paginas ?? []))
      .catch(() => setPaginas([]));
  }, []);

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-xl p-4" style={paneel}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Gevonden worden in Google
        </h2>
        <p className="text-xs" style={mute}>
          De titel en de omschrijving die Google bij een pagina toont. Leeg laten = de standaard. Je eigen pagina&apos;s stel je in bij Pagina&apos;s.
        </p>
        {melding ? (
          <p role="status" className="text-xs font-semibold" style={{ color: "var(--a-ok-ink)" }}>
            {melding}
          </p>
        ) : null}
      </section>
      {paginas === null ? (
        <p className="text-xs" style={mute}>
          Laden…
        </p>
      ) : (
        <ul className="space-y-2">
          {paginas.map((p) => (
            <PaginaSeo
              key={p.pad}
              rij={p}
              onBewaard={(nieuw, tekst) => {
                setPaginas(nieuw);
                setMelding(tekst);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
