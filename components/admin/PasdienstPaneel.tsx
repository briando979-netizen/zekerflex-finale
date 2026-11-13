"use client";

import { useCallback, useEffect, useState } from "react";

// Beheer → Webshop → Kortingen & voorraad: de echte paskamer (FASHN). Sleutel invullen (verzegeld bewaard, nooit terug te
// zien), dagplafond in euro's, en of hij nu echt aan staat. Aan/uit zelf is de vlag "paskamer-echt-passen" bij Vlaggen.

interface Stand {
  sleutel: { aanwezig: boolean; ingesteldOp: string | null };
  plafondEuro: number;
  beeldenPerDag: number;
  beschikbaar: { aan: boolean; reden?: "uit" | "geen-sleutel" | "eigen" | "plafond" };
}

const REDEN: Record<string, string> = {
  uit: "Staat uit: zet de vlag \"Paskamer: echt passen\" aan bij Beheer → Systeem → Functies aan en uit.",
  "geen-sleutel": "Er staat nog geen sleutel van FASHN.",
  eigen: "Bij Alles gratis staat deze dienst op \"Van ons zelf\": dan alleen de paspop.",
  plafond: "Het dagplafond staat op € 0.",
};

const datum = (iso: string | null) => (iso ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "");

export function PasdienstPaneel() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [plafond, setPlafond] = useState("");
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  const neem = (s: Stand) => {
    setStand(s);
    setPlafond(String(s.plafondEuro));
  };
  const laad = useCallback(async () => {
    const r = await fetch("/api/admin/shop/pasdienst", { cache: "no-store" }).catch(() => null);
    if (r?.ok) neem(await r.json());
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const stuur = async (methode: "PUT" | "DELETE", body?: object) => {
    setBezig(true);
    setMelding(null);
    const r = await fetch("/api/admin/shop/pasdienst", { method: methode, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBezig(false);
    if (!r?.ok) return setMelding({ ok: false, tekst: d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw." });
    neem(d as Stand);
    setSleutel("");
    setMelding({ ok: true, tekst: methode === "DELETE" ? "Sleutel verwijderd." : "Opgeslagen." });
  };

  const bewaar = () => {
    const euro = Number(plafond.replace(",", "."));
    void stuur("PUT", { ...(sleutel.trim() ? { sleutel: sleutel.trim() } : {}), ...(Number.isFinite(euro) ? { plafondEuro: euro } : {}) });
  };

  return (
    <section className="a-panel space-y-4 p-6">
      <div>
        <p className="a-kicker">Paskamer</p>
        <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Echt passen op de eigen foto (FASHN)
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--a-dim)" }}>
          Een bezoeker kan, na uitdrukkelijke toestemming, een kledingstuk echt op zijn eigen foto laten zetten. Dat kost ons ± 8 cent per beeld. De foto gaat alleen voor dat ene beeld naar FASHN, die hem daarna wist en niet gebruikt om te trainen; wij bewaren niets. Lukt het niet, dan krijgt de bezoeker de gratis paspop.
        </p>
      </div>
      {stand && (
        <p className="text-sm font-semibold" role="status" style={{ color: stand.beschikbaar.aan ? "var(--a-ok, #16a34a)" : "var(--a-warn, #d97706)" }}>
          {stand.beschikbaar.aan ? `Staat aan: hooguit ${stand.beeldenPerDag} beelden per dag.` : (REDEN[stand.beschikbaar.reden ?? "uit"] ?? REDEN.uit)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="a-label">
          Sleutel van FASHN {stand?.sleutel.aanwezig ? `(er staat er een sinds ${datum(stand.sleutel.ingesteldOp)})` : ""}
          <input className="a-input" type="password" autoComplete="off" value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder={stand?.sleutel.aanwezig ? "Laat leeg om hem te houden" : "fa-…"} />
        </label>
        <label className="a-label">
          Dagplafond in euro&apos;s (0 = uit)
          <input className="a-input" inputMode="decimal" value={plafond} onChange={(e) => setPlafond(e.target.value)} />
        </label>
      </div>
      {melding && (
        <p className="text-sm" role={melding.ok ? "status" : "alert"} style={{ color: melding.ok ? "var(--a-ok, #16a34a)" : "var(--a-crit, #dc2626)" }}>
          {melding.tekst}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="a-button a-button-primary" onClick={bewaar} disabled={bezig}>
          Opslaan
        </button>
        {stand?.sleutel.aanwezig && (
          <button type="button" className="a-button" onClick={() => void stuur("DELETE")} disabled={bezig}>
            Sleutel verwijderen
          </button>
        )}
      </div>
    </section>
  );
}
