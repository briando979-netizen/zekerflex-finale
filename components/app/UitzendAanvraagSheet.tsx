"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";
import { counterOfferAction } from "@/app/dashboard/klussen/actions";
import { moneyExact } from "@/components/app/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { basisLocale } from "@/lib/i18n/config";
import { UITZEND_AANVRAAG_TEKSTEN, vulUitzend } from "@/lib/i18n/uitzend-aanvraag";

/**
 * "Vraag uitzendcontract aan" bij een klus van een uitzendpartner (21 nov 2026, eigenaar: dezelfde weergave als YoungOnes,
 * met onze opzet). Zelfde vorm als het gewone reageervenster (ReageerModal): Let op, zo gaat het (bureau krijgt de aanvraag,
 * belt binnen 2 werkdagen, contract tekenen), de dienst en het vaste uurloon, een vrij bericht en de toestemming om de
 * contactgegevens te delen. De aanvraag zelf gaat langs dezelfde weg als een reactie (counterOfferAction, vast uurloon); de
 * server mailt het bureau (lib/uitzend/aanvraag.ts).
 */
export function UitzendAanvraagSheet({
  shiftId,
  listedRateCents,
  klant,
  bureau,
  startTime,
  endTime,
  toestemming,
  onClose,
}: {
  shiftId: string;
  listedRateCents: number;
  klant: string;
  bureau: string;
  startTime: string;
  endTime: string;
  toestemming?: string | undefined;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const t = UITZEND_AANVRAAG_TEKSTEN[basisLocale(locale)];
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bericht, setBericht] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const vul = (tekst: string) => vulUitzend(tekst, { klant, bureau });

  function bevestig() {
    setFout(null);
    start(async () => {
      try {
        const r = await counterOfferAction(shiftId, listedRateCents, bericht.trim().slice(0, 500));
        if (!r.ok) throw new Error(r.message);
        toast.success(t.verstuurdKop, vul(t.verstuurdTekst));
        onClose();
        router.push("/dashboard/diensten");
        router.refresh();
      } catch (e) {
        setFout((e as Error).message);
      }
    });
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/50" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="uitzend-aanvraag-titel"
          className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="uitzend-aanvraag-titel" className="border-b border-hair px-5 py-4 text-center font-display text-lg font-bold uppercase tracking-tight text-ink">
            {t.titel}
          </h2>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5 text-sm text-neutralx-700">
              <span className="font-semibold">{t.letOp}</span> {vul(t.letOpTekst)}
            </p>

            <div>
              <p className="text-sm font-semibold text-ink">{t.zoKop}</p>
              <ol className="mt-2 space-y-2.5">
                {t.stappen.map((stap, i) => (
                  <li key={stap} className="flex gap-3 text-sm text-neutralx-700">
                    <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-violet-50 text-xs font-bold text-violet-700">{i + 1}</span>
                    <span>{vul(stap)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <dl className="divide-y divide-hair overflow-hidden rounded-xl border border-hair text-sm">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-neutralx-600">{t.dienst}</dt>
                <dd className="num font-semibold text-ink">
                  {startTime} - {endTime}
                </dd>
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutralx-600">{t.uurloon}</dt>
                  <dd className="num font-semibold text-ink">{moneyExact(listedRateCents)}</dd>
                </div>
                <p className="mt-0.5 text-right text-[11px] text-neutralx-400">{t.uurloonUitleg}</p>
              </div>
            </dl>

            <label className="block">
              <span className="text-sm font-semibold text-ink">{t.bericht}</span>
              <textarea
                value={bericht}
                onChange={(e) => setBericht(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t.berichtPlaats}
                className="mt-1.5 w-full rounded-lg border border-hairstrong bg-paper-soft px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>

            {toestemming && <p className="text-xs leading-relaxed text-neutralx-500">{toestemming}</p>}
            {fout && (
              <p role="alert" className="text-sm text-crit">
                {fout}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t border-hair px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={bevestig} disabled={pending} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
              {pending ? "…" : t.bevestig}
            </button>
            <button type="button" onClick={onClose} className="w-full py-2 text-sm font-semibold text-neutralx-600 underline">
              {t.annuleren}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
