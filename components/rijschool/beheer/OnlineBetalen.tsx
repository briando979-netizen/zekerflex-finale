"use client";

import { useEffect, useState } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding } from "@/components/rijschool/ui";
import { euro } from "@/lib/payroll/format";

// Online betalen (iDEAL) voor de rijschool: haar eigen Stripe-account koppelen,
// zien of het klaar is, en naar haar Stripe-dashboard voor de uitbetalingen.

interface Stand {
  gekoppeld: boolean;
  klaar: boolean;
  ingevuld: boolean;
  kostenCent: number;
}

const URL = "/api/rijschool/beheer/betalen";

export function OnlineBetalen() {
  const [s, setS] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    stuur<Stand>(URL)
      .then(setS)
      .catch((e) => setFout(foutVan(e)));
  }, []);

  async function ga(actie: "koppelen" | "dashboard") {
    setBezig(true);
    setFout(null);
    try {
      const { url } = await stuur<{ url: string }>(URL, "POST", { actie });
      window.location.assign(url);
    } catch (e) {
      setFout(foutVan(e));
      setBezig(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink">Online betalen met iDEAL</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
            Leerlingen kopen een pakket of betalen een openstaand bedrag in hun app. Het geld gaat rechtstreeks naar je eigen bankrekening, via je eigen Stripe-account. De lessen
            komen na betaling vanzelf op hun tegoed.
          </p>
        </div>
        {s && (s.klaar ? <span className="pill-ok">Staat aan</span> : s.gekoppeld ? <span className="pill-warn">Nog niet klaar</span> : <span className="pill-neutral">Uit</span>)}
      </div>
      <Melding fout={fout} />
      {s && (
        <>
          {!s.klaar && (
            <p className="text-sm text-neutralx-700">
              {s.gekoppeld
                ? s.ingevuld
                  ? "Stripe controleert je gegevens nog. Dat duurt meestal een paar minuten tot een dag."
                  : "Vul je gegevens bij Stripe verder in (bedrijf, KVK, bankrekening). Daarna staat online betalen aan."
                : "Je maakt in een paar minuten een eigen Stripe-account aan met je KVK-gegevens en bankrekening. Stripe controleert dat zelf."}
            </p>
          )}
          <p className="text-xs text-neutralx-500">
            Kosten: {euro(s.kostenCent)} per betaling. Dat is wat iDEAL via Stripe kost; ZekerFlex rekent het alleen door. Geen abonnement.
          </p>
          <div className="flex flex-wrap gap-2">
            {!s.klaar && (
              <button type="button" className="btn-primary" disabled={bezig} onClick={() => void ga("koppelen")}>
                {s.gekoppeld ? "Gegevens bij Stripe aanvullen" : "Online betalen aanzetten"}
              </button>
            )}
            {s.gekoppeld && s.ingevuld && (
              <button type="button" className="btn-ghost" disabled={bezig} onClick={() => void ga("dashboard")}>
                Uitbetalingen bekijken (Stripe)
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
