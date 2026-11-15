"use client";

import { useEffect, useState } from "react";
import { tijdTekst, type LeverFase } from "@/lib/horeca/bezorgen";

// De stand van een online afhaal- of bezorgbestelling voor de gast (15 nov 2026), ververst elke 15 seconden tot
// hij afgeleverd of geannuleerd is. Alleen met de ondertekende link; de zaak beslist de tijd.

export interface LeverStand {
  nummer: number;
  soort: string;
  fase: LeverFase;
  tijd: string | null;
  bevestigd: boolean;
  teBetalenCent: number;
  bezorgkostenCent: number;
  betaald: boolean;
}

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);

function zin(s: LeverStand): string {
  const bezorgen = s.soort === "bezorgen";
  const om = tijdTekst(s.tijd);
  switch (s.fase) {
    case "bevestigen":
      return "We hebben je bestelling. De zaak bevestigt zo de tijd; deze pagina ververst vanzelf.";
    case "keuken":
      return bezorgen ? `Bevestigd: we bezorgen rond ${om}. Je bestelling wordt bereid.` : `Bevestigd: je kunt hem om ${om} ophalen. Je bestelling wordt bereid.`;
    case "klaar":
      return bezorgen ? "Je bestelling is klaar; de bezorger vertrekt zo." : "Je bestelling staat klaar om op te halen.";
    case "onderweg":
      return "Je bestelling is onderweg naar je toe.";
    case "afgeleverd":
      return bezorgen ? "Afgeleverd. Eet smakelijk!" : "Opgehaald. Eet smakelijk!";
    case "geannuleerd":
      return "Deze bestelling is geannuleerd. Bel de zaak als je vragen hebt.";
  }
}

export function LeverStatus({ slug, token, begin, telefoon }: { slug: string; token: string; begin: LeverStand; telefoon: string }) {
  const [stand, setStand] = useState(begin);
  const klaar = stand.fase === "afgeleverd" || stand.fase === "geannuleerd";

  useEffect(() => {
    if (klaar) return;
    const t = window.setInterval(() => {
      void fetch(`/api/horeca/site/${slug}/leveren?token=${encodeURIComponent(token)}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<LeverStand>) : null))
        .then((d) => {
          if (d) setStand(d);
        })
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [slug, token, klaar]);

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
        <p role="status" aria-live="polite" className="text-lg font-semibold">
          {zin(stand)}
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Bestelnummer</dt>
            <dd className="font-bold">{stand.nummer}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{stand.betaald ? "Betaald" : stand.soort === "bezorgen" ? "Te betalen bij de bezorging" : "Te betalen bij het ophalen"}</dt>
            <dd className="font-bold">{euro(stand.teBetalenCent)}</dd>
          </div>
          {stand.bezorgkostenCent > 0 && (
            <div className="flex justify-between text-[#0A120E]/70">
              <dt>waarvan bezorgkosten</dt>
              <dd>{euro(stand.bezorgkostenCent)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-[#0A120E]/70">Bewaar deze pagina om je bestelling te volgen.{telefoon && ` Vragen? Bel ${telefoon}.`}</p>
      </div>
    </section>
  );
}
