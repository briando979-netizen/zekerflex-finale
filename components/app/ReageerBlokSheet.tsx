"use client";

import Link from "next/link";
import { Portal } from "@/components/chat/Portal";
import { useDialog } from "@/components/app/useDialog";
import { useFT } from "@/components/i18n/useFT";
import { reageerStapHref, type ReageerStap } from "@/lib/onboarding/laat-weten";

/**
 * Wat een werker onderaan een klus ziet als hij nog niet mag reageren. Alleen weergave: de
 * echte poort blijft de server (payoutEligibility, werkrecht); `reden` is de zin die de server gaf.
 */
export function ReageerBlokSheet({ reden, stap, onClose }: { reden: string; stap: ReageerStap; onClose: () => void }) {
  const t = useFT().reageerBlok;
  const ref = useDialog(true, onClose);
  const stapTekst = stap === "anders" ? null : t[stap];
  // Zonder goedgekeurd ID precies de sheet van YoungOnes (21 nov): kop "REAGEER OP DEZE KLUS", één gele melding
  // "Je moet jouw ID-check nog afronden." en de knop "Check ID" (de ID-controle staat op /dashboard/verificatie).
  const idCheck = stap === "identiteit";
  // Een uitzendkracht op een freelance klus (21 nov): er ontbreekt niets aan de aanmelding, alleen de werkvorm past niet.
  const werkvorm = stap === "werkvorm";

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/50" onClick={onClose}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reageer-blok-titel"
          className="w-full max-w-md rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="border-b border-hair px-5 py-4 text-center font-display text-lg font-bold uppercase tracking-tight text-ink">
            {t.eyebrow}
          </h2>
          <div className="space-y-4 px-5 pb-2 pt-5">
            <div role="alert" className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3">
              <p id="reageer-blok-titel" className="font-display text-base font-bold text-ink">{idCheck ? t.idTitel : werkvorm ? t.werkvormTitel : t.titel}</p>
              {!idCheck && !werkvorm && stapTekst ? <p className="mt-1 text-sm text-neutralx-700">{t.tekst}</p> : null}
              {!idCheck && <p className="mt-1 text-sm text-neutralx-700">{reden}</p>}
            </div>
            {!idCheck && stapTekst && (
              <p className="text-sm text-neutralx-600">
                <span className="font-semibold text-ink">{t.mistLabel}:</span> {stapTekst}
              </p>
            )}
          </div>
          <div className="p-4">
            {stapTekst && (
              <Link href={reageerStapHref(stap)} className="btn-primary block w-full py-3 text-center text-sm">
                {idCheck ? t.idKnop : werkvorm ? t.werkvormKnop : t.knop}
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full py-1 text-center text-sm font-medium text-neutralx-500 underline hover:text-ink"
            >
              {t.sluiten}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
