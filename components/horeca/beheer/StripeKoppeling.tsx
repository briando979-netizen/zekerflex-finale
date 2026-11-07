"use client";

import { useEffect, useState } from "react";
import { Uitbetalen } from "@/components/horeca/beheer/Uitbetalen";

// Afrekenen aan tafel: het eigen Stripe-account van de zaak. Koppelen opent de
// aanmelding bij Stripe (bedrijfsgegevens, bankrekening); daarna betaalt Stripe
// het geld van gasten vanzelf uit op de rekening van de zaak.

type Stand = { gekoppeld: boolean; klaar: boolean; ingevuld: boolean };

export function StripeKoppeling() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  useEffect(() => {
    let weg = false;
    void fetch("/api/horeca/beheer?alleen=stripe", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Stand>) : null))
      .then((s) => {
        if (!weg && s) setStand(s);
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, []);

  async function ga(actie: "stripe-koppelen" | "stripe-overzicht") {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/horeca/beheer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actie }) });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (!r.ok || !d.url) throw new Error(d.error?.message ?? "Stripe openen lukte niet. Probeer het zo opnieuw.");
      window.location.assign(d.url);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Stripe openen lukte niet.");
      setBezig(false);
    }
  }

  return (
    <>
    <div className="mt-3 rounded-xl border border-hair p-3 text-sm">
      {stand === null ? (
        <p className="text-neutralx-500">Stripe-account controleren…</p>
      ) : stand.klaar ? (
        <p className="font-semibold text-ok">Stripe-account klaar: gasten kunnen aan tafel afrekenen met iDEAL, Apple Pay, Google Pay of hun pas.</p>
      ) : stand.gekoppeld ? (
        <p className="font-semibold text-warn">{stand.ingevuld ? "Stripe controleert je gegevens nog. Dit duurt meestal kort." : "Maak je aanmelding bij Stripe af om betalingen te ontvangen."}</p>
      ) : (
        <p className="text-neutralx-600">Koppel jullie eigen Stripe-account. Gasten betalen dan aan tafel, en Stripe zet het geld vanzelf op jullie bankrekening.</p>
      )}
      {stand !== null && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!stand.klaar && (
            <button type="button" disabled={bezig} onClick={() => void ga("stripe-koppelen")} className="btn-primary disabled:opacity-60">
              {stand.gekoppeld ? "Aanmelding bij Stripe afmaken" : "Stripe-account koppelen"}
            </button>
          )}
          {stand.gekoppeld && (
            <button type="button" disabled={bezig} onClick={() => void ga("stripe-overzicht")} className="btn-ghost disabled:opacity-60">
              Stripe-overzicht openen
            </button>
          )}
        </div>
      )}
      {fout && (
        <p role="alert" className="mt-2 font-semibold text-crit">
          {fout}
        </p>
      )}
    </div>
    {/* het geld van de zaak bij Stripe: automatisch uitbetalen of zelf opnemen */}
    {stand?.klaar && <Uitbetalen />}
    </>
  );
}
