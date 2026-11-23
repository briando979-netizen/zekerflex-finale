"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { heropenShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

// Een volle klus waar iemand van afzegde, weer openzetten. Dit staat op de klus als "Klussen automatisch heropenen" uit staat
// (Instellingen → Klus-instellingen, lib/werkgever/heropenen.ts): dan blijft de klus op "volledig bezet" staan tot het bedrijf hem
// zelf weer openzet. Eerst vragen (er gaan meldingen naar werkers in de buurt), dan de server-actie; de melding komt in de taal van de app.

export function KlusWeerOpenKnop({ shiftId }: { shiftId: string }) {
  const toast = useToast();
  const router = useRouter();
  const k = useT().klusWeerOpen;
  const [pending, start] = useTransition();
  const [vraag, setVraag] = useState(false);

  function zetOpen() {
    start(async () => {
      const res = await heropenShiftAction(shiftId);
      if (res.ok) {
        toast.success(res.message);
        setVraag(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <section aria-labelledby="klus-weer-open-kop" className="rounded-2xl border border-warn/40 bg-warn/10 p-4">
      <h2 id="klus-weer-open-kop" className="font-semibold text-ink">
        {k.kop}
      </h2>
      <p className="mt-1 text-sm text-neutralx-700">{vraag ? k.vraag : k.uitleg}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {vraag ? (
          <>
            <button type="button" onClick={() => setVraag(false)} disabled={pending} className="btn-ghost min-h-11 text-sm">
              {k.nee}
            </button>
            <button type="button" onClick={zetOpen} disabled={pending} className="btn-primary min-h-11 text-sm">
              {pending ? k.bezig : k.ja}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setVraag(true)} className="btn-primary min-h-11 text-sm">
            {k.knop}
          </button>
        )}
      </div>
    </section>
  );
}
