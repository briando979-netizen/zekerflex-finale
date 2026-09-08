"use client";

import { useState } from "react";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";

// ---------------------------------------------------------------------------
// Full-screen "Vervanging zoeken via ZekerFlex" flow (freelancer). Opened from
// ShiftActions on the klusdetail page. Two steps:
//   1. explainer page + sticky "Zoek een vervanger" / "Annuleren"
//   2. native-style confirm dialog → POST /api/me/replacement
// On success the klus is re-listed on the marketplace and the freelancer keeps
// responsibility until they pick a substitute.
// ---------------------------------------------------------------------------

export function RegelVervangingFlow({
  assignmentId,
  heroPhoto,
  onClose,
  onRequested,
}: {
  assignmentId: string;
  heroPhoto?: string | null;
  onClose: () => void;
  onRequested: () => void;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Aanvraag mislukt");
      toast.success("Vervanger gevraagd", "Andere krachten kunnen zich nu aanbieden.");
      onRequested();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-white">
        <div className="relative h-40 w-full sm:h-52">
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-ink" />
          )}
          <span className="absolute inset-0 bg-ink/35" />
        </div>

        <div className="mx-auto max-w-2xl px-5 pb-44 pt-6">
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
            Vervanging zoeken via ZekerFlex
          </h1>
          <div className="mt-5 space-y-4 border-t border-hair pt-5 text-sm leading-relaxed text-neutralx-700">
            <p className="font-semibold text-ink">
              Zorg dat je vervanging altijd met de opdrachtgever overlegd!
            </p>
            <p>
              De klus wordt opnieuw uitgezet op het platform, maar jij blijft verantwoordelijk voor
              de vervanger en het selecteren hiervan. Zorg ervoor dat je vervanger bij het selecteren
              voldoet aan de gestelde eisen van de klusomschrijving en geschikt is om de klus over te
              nemen.
            </p>
            <p>
              Reageert er niemand op de klus? Dan ben jij nog steeds verplicht om te gaan werken. Kom
              je niet opdagen? Dit heeft direct gevolgen voor je opkomstpercentage.
            </p>
            <p>
              Kan je écht niet werken? Neem dan zo snel mogelijk contact op met de opdrachtgever
              zodat ze tijd hebben iemand anders te vinden.
            </p>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-hair bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button type="button" onClick={() => setConfirmOpen(true)} className="btn-primary w-full">
              Zoek een vervanger
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 block w-full text-center text-sm font-semibold text-neutralx-500 underline underline-offset-2"
            >
              Annuleren
            </button>
          </div>
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/45 p-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift">
              <h2 className="font-display text-lg font-bold text-ink">
                Klus vervangingsverzoek bevestiging
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
                Door de klus voor vervanging aan te bieden, begrijp en aanvaard je dat het jouw
                verantwoordelijkheid is om een geschikte vervanger te vinden en als je dit niet doet,
                zal dit jouw aanwezigheidspercentage negatief beïnvloeden.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmOpen(false)}
                  className="btn-ghost flex-1 disabled:opacity-50"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {busy ? "Bezig…" : "Bevestigen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
}
