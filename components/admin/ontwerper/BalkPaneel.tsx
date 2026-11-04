"use client";

import { useEffect, useState } from "react";
import { BALK_KLEUREN, normalizeBalk, type Balk, type BalkKleur } from "@/lib/ontwerp/balk";

// ---------------------------------------------------------------------------
// Tabblad Menu, bovenaan: de aankondigingsbalk boven de site. Tekst, link,
// kleur, aan/uit, optioneel alleen tussen twee datums, wegklikbaar of niet.
// Met een voorbeeld hier in het paneel; Opslaan zet hem meteen live.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };

export function BalkPaneel({ onVernieuw }: { onVernieuw: () => void }) {
  const [balk, setBalk] = useState<Balk | null>(null);
  const [bewaard, setBewaard] = useState<Balk | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/ontwerp/balk", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balk?: Balk } | null) => {
        if (!d?.balk) return;
        setBalk(d.balk);
        setBewaard(d.balk);
      })
      .catch(() => undefined);
  }, []);

  if (!balk || !bewaard) {
    return (
      <p className="text-sm" style={mute}>
        Laden…
      </p>
    );
  }

  const zet = (b: Partial<Balk>) => {
    setBalk({ ...balk, ...b });
    setMelding(null);
  };
  const gewijzigd = JSON.stringify(normalizeBalk(balk)) !== JSON.stringify(bewaard);
  const kleur = BALK_KLEUREN[balk.kleur];

  async function bewaar() {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/ontwerp/balk", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ balk }) });
      const d = (await r.json().catch(() => null)) as { balk?: Balk; error?: { message?: string } } | null;
      if (!r.ok || !d?.balk) throw new Error(d?.error?.message ?? "Opslaan lukte niet.");
      setBalk(d.balk);
      setBewaard(d.balk);
      setMelding({
        tekst: d.balk.aan
          ? d.balk.vanaf || d.balk.tot
            ? `Bewaard. De balk staat ${d.balk.vanaf ? `vanaf ${d.balk.vanaf} ` : ""}${d.balk.tot ? `tot en met ${d.balk.tot}` : ""} boven de site.`
            : "Live. De balk staat boven elke pagina van de site."
          : balk?.aan && !d.balk.aan
            ? "Bewaard, maar uit: een balk zonder tekst kan niet aan."
            : "Bewaard. De balk staat uit.",
      });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Opslaan lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl p-4" style={paneel}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Aankondigingsbalk
      </h2>
      <p className="text-xs" style={mute}>
        Een smalle balk boven de hele site, voor nieuws of een aanbieding. {bewaard.aan ? "Staat aan." : "Staat uit."}
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={balk.aan} onChange={(e) => zet({ aan: e.target.checked })} />
        Balk tonen
      </label>
      <label className="block">
        <span className="mb-1 block text-xs" style={mute}>
          Tekst ({balk.tekst.length}/160)
        </span>
        <input value={balk.tekst} onChange={(e) => zet({ tekst: e.target.value })} maxLength={160} placeholder="Bijvoorbeeld: Nieuw: horecasoftware met kassa en keukenscherm." className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Linktekst (mag leeg)
          </span>
          <input value={balk.linkTekst} onChange={(e) => zet({ linkTekst: e.target.value })} maxLength={40} placeholder="Bekijk het aanbod" className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Link
          </span>
          <input value={balk.link} onChange={(e) => zet({ link: e.target.value })} maxLength={500} placeholder="/aanbod of https://…" className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs" style={veld} />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs" style={mute}>
          Kleur
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BALK_KLEUREN) as BalkKleur[]).map((k) => (
            <label key={k} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ ...veld, outline: balk.kleur === k ? "2px solid var(--a-accent)" : "none" }}>
              <input type="radio" name="balk-kleur" checked={balk.kleur === k} onChange={() => zet({ kleur: k })} />
              {BALK_KLEUREN[k].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Vanaf (mag leeg)
          </span>
          <input type="date" value={balk.vanaf} onChange={(e) => zet({ vanaf: e.target.value })} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={mute}>
            Tot en met (mag leeg)
          </span>
          <input type="date" value={balk.tot} onChange={(e) => zet({ tot: e.target.value })} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={veld} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={balk.sluitbaar} onChange={(e) => zet({ sluitbaar: e.target.checked })} />
        Bezoekers mogen hem wegklikken (een nieuwe tekst komt dan weer terug)
      </label>
      <div>
        <p className="mb-1 text-[11px]" style={mute}>
          Voorbeeld
        </p>
        {balk.tekst.trim() ? (
          <div className={`${kleur.klasse} relative rounded-lg px-8 py-2 text-center text-sm font-medium`}>
            <span>{balk.tekst}</span>
            {balk.link && balk.linkTekst ? <span className={`ml-1 font-semibold ${kleur.link}`}>{balk.linkTekst}</span> : null}
            {balk.sluitbaar ? (
              <span aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 opacity-80">
                ×
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs" style={mute}>
            Typ een tekst om de balk te zien.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={bewaar} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
          {bezig ? "Bezig…" : "Opslaan (meteen live)"}
        </button>
        {gewijzigd ? (
          <button type="button" onClick={() => setBalk(bewaard)} className="a-button text-xs">
            Wijzigingen weggooien
          </button>
        ) : null}
      </div>
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}
    </section>
  );
}
