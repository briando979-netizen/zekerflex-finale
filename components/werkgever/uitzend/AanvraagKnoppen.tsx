"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToOfferAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

/**
 * De knoppen bij een open aanvraag (/werkgever/uitzend). "Gebeld" onthoudt het bureau zelf (POST /api/werkgever/uitzend/gebeld);
 * inplannen en afwijzen gaan langs dezelfde weg als bij elke reactie op een klus (respondToOfferAction). Daarna haalt de pagina
 * de stand opnieuw van de server (router.refresh), niet uit de klik. Tekst: uitzendBureau.knoppen in het werkgeverswoordenboek.
 */
export function AanvraagKnoppen({ offerId, gebeld, naam }: { offerId: string; gebeld: boolean; naam: string }) {
  const k = useT().uitzendBureau.knoppen;
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [afwijzen, setAfwijzen] = useState(false);

  async function markeer() {
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/werkgever/uitzend/gebeld", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId, gebeld: !gebeld }),
    }).catch(() => null);
    if (r?.ok) router.refresh();
    else {
      const d = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(d?.error?.message ?? k.opslaanMislukt);
    }
    setBezig(false);
  }

  async function beslis(besluit: "accepted" | "declined") {
    setBezig(true);
    setFout(null);
    const r = await respondToOfferAction(offerId, besluit).catch(() => null);
    if (r?.ok) {
      setAfwijzen(false);
      router.refresh();
    } else setFout(r?.message ?? k.mislukt);
    setBezig(false);
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {afwijzen ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutralx-600">{fmt(k.afwijzenVraag, { naam })}</span>
          <button type="button" className="btn-ghost" disabled={bezig} onClick={() => void beslis("declined")}>
            {k.jaAfwijzen}
          </button>
          <button type="button" className="btn-ghost" disabled={bezig} onClick={() => setAfwijzen(false)}>
            {k.nee}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button type="button" className="btn-primary" disabled={bezig} onClick={() => void beslis("accepted")}>
            {k.inplannen}
          </button>
          <button type="button" className="btn-ghost" disabled={bezig} onClick={() => void markeer()}>
            {gebeld ? k.nietGebeld : k.gebeld}
          </button>
          <button type="button" className="btn-ghost" disabled={bezig} onClick={() => setAfwijzen(true)}>
            {k.afwijzen}
          </button>
        </div>
      )}
      {fout && (
        <p role="alert" className="text-sm text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
