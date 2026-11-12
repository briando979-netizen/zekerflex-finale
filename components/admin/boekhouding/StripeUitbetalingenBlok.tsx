"use client";

import { useRef, useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";
import type { StripeImportUitkomst } from "@/lib/boekhouding/stripe/import";
import { API_BOEKHOUDING } from "@/lib/boekhouding/scherm-api";

// ---------------------------------------------------------------------------
// Beheer → Boekhouding → Bank: een Stripe-payoutrapport (csv) inlezen. Alleen een type uit de datalaag (import type).
// Het live Stripe-account staat dicht: er is nu waarschijnlijk niets in te lezen.
// ---------------------------------------------------------------------------

export function StripeUitbetalingenBlok({ administratieId }: { administratieId: string }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [uitkomst, setUitkomst] = useState<StripeImportUitkomst | null>(null);
  const bestandRef = useRef<HTMLInputElement>(null);

  const leesIn = async () => {
    const bestand = bestandRef.current?.files?.[0];
    if (!bestand) {
      setFout("Kies eerst een bestand om in te lezen.");
      return;
    }
    setBezig(true);
    setUitkomst(null);
    try {
      const form = new FormData();
      form.set("administratieId", administratieId);
      form.set("bestand", bestand);
      const res = await fetch(`${API_BOEKHOUDING}/stripe`, { method: "POST", body: form, cache: "no-store" });
      const antwoord = (await res.json().catch(() => ({}))) as { uitkomst?: StripeImportUitkomst; error?: { message?: string }; message?: string };
      if (!res.ok || !antwoord.uitkomst) throw new Error(antwoord.error?.message ?? antwoord.message ?? "Inlezen mislukt. Probeer het opnieuw.");
      setUitkomst(antwoord.uitkomst);
      setFout(null);
      if (bestandRef.current) bestandRef.current.value = "";
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Inlezen mislukt.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <Panel
      title="Stripe-uitbetalingen inlezen"
      subtitle="Het rapport Payout reconciliation uit het Stripe Dashboard (csv, hooguit 5 MB). Er is geen koppeling met Stripe: je leest het bestand zelf in."
    >
      <div className="space-y-3">
        <Notice tone="warn">
          Het live Stripe-account staat nu dicht, dus er is voorlopig weinig om in te lezen. Het kolomformaat (payout_id, gross, fee, net, currency, created) is nog niet met een echt Stripe-exportbestand bevestigd; herkent het scherm het bestand niet, dan zegt het dat eerlijk.
        </Notice>
        <Notice tone="neutral">
          Elke uitbetaling wordt geboekt op bank (1100), Stripe-saldo (1150) en betaalkosten (4200, zonder btw: de accountant bevestigt de btw). Staat dezelfde uitbetaling als transactie in je bankafschrift, laat die daar dan staan: boek haar niet nog een keer.
        </Notice>
        <label className="a-label" htmlFor="stripe-bestand">
          Bestand
          <input id="stripe-bestand" ref={bestandRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="a-input" />
        </label>
        <button type="button" className="a-btn a-btn-primary" disabled={bezig || !administratieId} onClick={() => void leesIn()}>
          {bezig ? "Bezig…" : "Uitbetalingen inlezen"}
        </button>
        {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
        {uitkomst && (
          <div className="space-y-2 text-sm" aria-live="polite">
            <Notice tone={uitkomst.fouten.length > 0 ? "warn" : "ok"}>
              {uitkomst.totaal} {uitkomst.totaal === 1 ? "uitbetaling" : "uitbetalingen"} gelezen: {uitkomst.nieuw} geboekt, {uitkomst.alBekend} al bekend, {uitkomst.fouten.length} met een fout.
            </Notice>
            {uitkomst.doorAccountantTeBevestigen > 0 && (
              <p>{uitkomst.doorAccountantTeBevestigen} boeking(en) met Stripe-kosten zonder btw: laat de btw-behandeling door een accountant bevestigen.</p>
            )}
            {uitkomst.fouten.map((f) => (
              <Notice key={`${f.payoutId ?? ""}-${f.regel ?? ""}-${f.fout}`} tone="crit" role="alert">
                {f.payoutId ? `Uitbetaling ${f.payoutId}: ` : f.regel ? `Regel ${f.regel}: ` : ""}{f.fout}
              </Notice>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
