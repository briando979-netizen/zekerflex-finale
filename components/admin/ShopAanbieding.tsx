"use client";

import { useEffect, useState } from "react";
import { DEAL_MAX_DAGEN, kortingProcent } from "@/lib/shop/aanbieding";

// Beheer → Webshop → een product → Aanbieding (lib/shop/aanbieding.ts). De beheerder vult alleen de nieuwe prijs en de
// laatste dag in. De "van"-prijs is de laagste prijs van de afgelopen 30 dagen en komt uit de prijshistorie; die kan
// niemand intypen. Stoppen zet de gewone prijs terug.

interface Stand {
  productId: string;
  prijsCents: number;
  laagste30Cents: number | null;
  historieVolledig: boolean;
  kanVanaf: string | null;
  loopt: boolean;
  zichtbaar: boolean;
  vanCents: number | null;
  normaalCents: number | null;
  eindigt: string | null;
  procent: number;
}

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const naarCenten = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const dagNl = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
const datumNl = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export function ShopAanbieding({ productId, onGewijzigd }: { productId: string; onGewijzigd?: () => void }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [prijs, setPrijs] = useState("");
  const [totEnMet, setTotEnMet] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    let weg = false;
    fetch(`/api/admin/shop/aanbieding?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { aanbieding?: Stand } | null) => {
        if (!weg && d?.aanbieding) setStand(d.aanbieding);
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [productId]);

  const doe = async (methode: "POST" | "DELETE") => {
    setFout("");
    setOk("");
    setBezig(true);
    try {
      const res =
        methode === "POST"
          ? await fetch("/api/admin/shop/aanbieding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, prijsCents: naarCenten(prijs) ?? 0, totEnMet }) })
          : await fetch(`/api/admin/shop/aanbieding?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
      const d = (await res.json().catch(() => null)) as { aanbieding?: Stand; error?: { message?: string } } | null;
      if (!res.ok || !d?.aanbieding) {
        setFout(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
        return;
      }
      // de versie van de server overnemen (prijzen en datum kunnen anders zijn dan ingevuld)
      setStand(d.aanbieding);
      setOk(methode === "POST" ? "De aanbieding staat aan." : "De aanbieding is gestopt; de gewone prijs staat er weer.");
      setPrijs("");
      onGewijzigd?.();
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  };

  if (!stand) return null;
  const nieuw = naarCenten(prijs);
  const laagste = stand.laagste30Cents;
  const procent = nieuw && laagste ? kortingProcent(laagste, nieuw) : 0;

  return (
    <fieldset className="rounded-xl border border-hair p-4">
      <legend className="px-1 text-sm font-bold">Aanbieding</legend>
      {stand.loopt ? (
        <div className="space-y-2 text-sm">
          <p>
            <strong>{euro(stand.prijsCents)}</strong> in plaats van <s>{euro(stand.vanCents ?? 0)}</s> ({stand.procent}% korting){stand.eindigt ? `, tot ${datumNl(stand.eindigt)}` : ""}.
          </p>
          <p className="text-neutralx-600">
            {stand.zichtbaar ? "De winkel toont dit nu als aanbieding." : "De einddatum is voorbij; de gewone prijs komt vanzelf terug."} Daarna is de prijs weer {euro(stand.normaalCents ?? 0)}. De prijs
            van dit product pas je aan nadat je de aanbieding hebt gestopt.
          </p>
          <button type="button" className="a-button" disabled={bezig} onClick={() => void doe("DELETE")}>
            {bezig ? "Bezig…" : "Aanbieding stoppen"}
          </button>
        </div>
      ) : !stand.historieVolledig ? (
        <p className="text-sm text-neutralx-600">
          Op dit product kan nu nog geen aanbieding. Wie een korting toont, moet de laagste prijs van de afgelopen 30 dagen erbij zetten, en van dit product houden we de prijs nog niet lang genoeg bij.
          {stand.kanVanaf ? <strong> Het kan vanaf {dagNl(stand.kanVanaf)}.</strong> : " Bewaar het product eerst."}
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-neutralx-600">
            {laagste !== null ? (
              <>
                De laagste prijs van de afgelopen 30 dagen is <strong>{euro(laagste)}</strong>. Die komt doorgestreept bij de aanbieding te staan; dat is wettelijk verplicht en kun je niet zelf invullen.
              </>
            ) : (
              "Van dit product is nog geen prijs bekend. Bewaar het product eerst."
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-[10rem_12rem_auto] sm:items-end">
            <label className="a-label">
              Aanbiedingsprijs (€)
              <input className="a-input" value={prijs} onChange={(e) => setPrijs(e.target.value)} inputMode="decimal" placeholder={laagste ? (laagste / 100 * 0.8).toFixed(2).replace(".", ",") : "0,00"} />
            </label>
            <label className="a-label">
              Tot en met
              <input className="a-input" type="date" value={totEnMet} onChange={(e) => setTotEnMet(e.target.value)} />
            </label>
            <button type="button" className="a-button" disabled={bezig || !nieuw || !totEnMet || laagste === null} onClick={() => void doe("POST")}>
              {bezig ? "Bezig…" : "Aanbieding starten"}
            </button>
          </div>
          {nieuw !== null && laagste !== null && (
            <p className={procent > 0 ? "text-neutralx-700" : "font-semibold text-crit"}>
              {procent > 0 ? `Dat is ${procent}% korting. In de winkel: ${euro(nieuw)}, doorgestreept ${euro(laagste)}.` : "Deze prijs is niet lager dan de laagste prijs van de afgelopen 30 dagen."}
            </p>
          )}
          <p className="text-xs text-neutralx-500">Een aanbieding duurt hooguit {DEAL_MAX_DAGEN} dagen. Heeft het product maten of kleuren met een eigen prijs, dan krijgen die dezelfde korting.</p>
        </div>
      )}
      {fout && (
        <p role="alert" className="mt-2 text-sm font-semibold text-crit">
          {fout}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-2 text-sm font-semibold text-ok">
          {ok}
        </p>
      )}
    </fieldset>
  );
}
