"use client";

import { useState } from "react";
import { nlMoment, type EffectieveStatus, type OfferteOpenbaar } from "@/lib/offertes/model";
import { OfferteWeergave } from "@/components/offertes/OfferteWeergave";

// De klant bekijkt de offerte en gaat akkoord of wijst af. De server controleert alles opnieuw; dit scherm toont alleen.

const UITLEG: Partial<Record<EffectieveStatus, string>> = {
  verlopen: "Deze offerte is verlopen en kan niet meer geaccepteerd worden. Neem contact op met het bedrijf als je hem toch wilt.",
};

export function OfferteKlantScherm({ token, begin }: { token: string; begin: OfferteOpenbaar }) {
  const [o, setO] = useState<OfferteOpenbaar>(begin);
  const [naam, setNaam] = useState("");
  const [akkoord, setAkkoord] = useState(false);
  const [reden, setReden] = useState("");
  const [website, setWebsite] = useState("");
  const [stap, setStap] = useState<"kies" | "afwijzen">("kies");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function stuur(actie: "accepteer" | "wijs-af") {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch(`/api/offerte-link/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie, naam, akkoord, reden, website }) });
      const d = (await res.json().catch(() => null)) as { offerte?: OfferteOpenbaar; error?: { message?: string } } | null;
      if (!res.ok) {
        setFout(d?.error?.message ?? "Je reactie kon niet worden verstuurd. Probeer het opnieuw.");
        return;
      }
      if (d?.offerte) setO(d.offerte);
    } catch {
      setFout("Je reactie kon niet worden verstuurd. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const veld = "field-input w-full";
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-hair bg-white p-4 sm:p-6">
        <OfferteWeergave o={{ ...o }} />
      </div>

      {o.status === "geaccepteerd" && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Je hebt deze offerte geaccepteerd{o.beslistOp ? ` op ${nlMoment(o.beslistOp)}` : ""}. {o.bedrijfsnaam} ziet dat nu in zijn overzicht.
        </p>
      )}
      {o.status === "afgewezen" && (
        <p role="status" className="rounded-xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-600">
          Je hebt deze offerte afgewezen{o.beslistOp ? ` op ${nlMoment(o.beslistOp)}` : ""}.
        </p>
      )}
      {UITLEG[o.status] && (
        <p role="status" className="rounded-xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-600">
          {UITLEG[o.status]}
        </p>
      )}

      {o.status === "verstuurd" && (
        <form
          className="space-y-4 rounded-xl border border-hair bg-white p-4 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void stuur(stap === "afwijzen" ? "wijs-af" : "accepteer");
          }}
        >
          {/* verborgen veld tegen bots: een mens ziet en vult dit nooit */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          {stap === "kies" ? (
            <>
              <h3 className="font-display text-lg font-bold text-ink">Je reactie</h3>
              <div>
                <label htmlFor="of-naam" className="field-label">
                  Je naam
                </label>
                <input id="of-naam" className={veld} value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={80} autoComplete="name" />
              </div>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} />
                <span>Ik ga akkoord met deze offerte en de voorwaarden.</span>
              </label>
              {fout && (
                <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
                  {fout}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={bezig || !akkoord || naam.trim().length < 2}>
                  {bezig ? "Bezig…" : "Akkoord"}
                </button>
                <button type="button" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink hover:border-brand-500" disabled={bezig} onClick={() => setStap("afwijzen")}>
                  Afwijzen
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display text-lg font-bold text-ink">Offerte afwijzen</h3>
              <div>
                <label htmlFor="of-reden" className="field-label">
                  Reden (niet verplicht)
                </label>
                <textarea id="of-reden" className={veld} rows={3} maxLength={500} value={reden} onChange={(e) => setReden(e.target.value)} />
              </div>
              {fout && (
                <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
                  {fout}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={bezig}>
                  {bezig ? "Bezig…" : "Offerte afwijzen"}
                </button>
                <button type="button" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink hover:border-brand-500" disabled={bezig} onClick={() => setStap("kies")}>
                  Terug
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
