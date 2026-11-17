"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToOfferAction, zetReserveAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// Knoppen van de reservebank op de kluspagina van de werkgever (lib/reservebank). Na elke actie neemt de pagina de
// stand van de server over (router.refresh), nooit een lokaal bijgewerkte lijst.
// ---------------------------------------------------------------------------

/** "Op de reservebank" of "Van de reservebank halen" voor één open reactie. */
export function ReservebankKnop({ offerId, naam, op }: { offerId: string; naam: string; op: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const d = useT().shiftDetail;
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const wissel = async () => {
    if (bezig) return;
    setBezig(true);
    setFout(null);
    const r = await zetReserveAction(offerId, !op).catch(() => ({ ok: false, message: d.reserveMislukt }));
    setBezig(false);
    if (!r.ok) {
      setFout(r.message);
      return;
    }
    toast.success(fmt(op ? d.reserveAfGehaald : d.reserveOpGezet, { naam }));
    router.refresh();
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void wissel()}
        disabled={bezig}
        aria-label={fmt(op ? d.reserveAfVan : d.reserveOpVan, { naam })}
        className="rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-medium text-neutralx-700 hover:border-brand-400 disabled:opacity-50"
      >
        {bezig ? d.reserveBezig : op ? d.reserveAf : d.reserveOp}
      </button>
      {fout && (
        <span role="alert" className="text-xs text-crit">
          {fout}
        </span>
      )}
    </span>
  );
}

/** "Inplannen" van een reserve met één klik: precies dezelfde weg als een gewone reactie accepteren. */
export function ReserveInplannenKnop({ offerId, naam }: { offerId: string; naam: string }) {
  const router = useRouter();
  const toast = useToast();
  const d = useT().shiftDetail;
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const plan = async () => {
    if (bezig || klaar) return;
    setBezig(true);
    setFout(null);
    const r = await respondToOfferAction(offerId, "accepted").catch(() => ({ ok: false, message: d.reserveMislukt }));
    setBezig(false);
    if (!r.ok) {
      setFout(r.message);
      return;
    }
    setKlaar(true);
    toast.success(fmt(d.reserveIngepland, { naam }));
    router.refresh();
  };

  if (klaar) {
    return (
      <span role="status" className="pill-ok">
        {fmt(d.reserveIngepland, { naam })}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void plan()}
        disabled={bezig}
        aria-label={fmt(d.reserveInplannenVan, { naam })}
        className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {bezig ? d.reserveBezig : d.reserveInplannen}
      </button>
      {fout && (
        <span role="alert" className="text-xs text-crit">
          {fout}
        </span>
      )}
    </span>
  );
}
