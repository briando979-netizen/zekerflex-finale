"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";
import { counterOfferAction } from "@/app/dashboard/klussen/actions";
import { moneyExact } from "@/components/app/ui";

/**
 * "Reageer op deze klus" — the confirmation screen a freelancer sees before
 * reacting: beschikbaarheid (volledige dienst of flexibel), rate (tegenbod),
 * motivation, akkoord-vinkjes, en automatisch intrekken. Pas na "Bevestig je
 * reactie" gaat de reactie de deur uit.
 */
export function ReageerButton({
  shiftId,
  listedRateCents,
  clientName,
  startTime,
  endTime,
  conflict = false,
  agreementHref = null,
  disabled = false,
  notReadyReason,
  label = "Reageer op deze klus",
  full = false,
}: {
  shiftId: string;
  listedRateCents: number;
  clientName: string;
  startTime: string; // "09:00"
  endTime: string; // "16:00"
  conflict?: boolean;
  agreementHref?: string | null;
  disabled?: boolean;
  notReadyReason?: string | null;
  label?: string;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={full ? "flex flex-col gap-1" : "flex flex-col items-end gap-1"}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={`btn-primary text-sm disabled:opacity-50 ${full ? "w-full py-2.5" : "px-4 py-2"}`}
        >
          {label}
        </button>
        {notReadyReason && (
          <span className="max-w-[240px] text-right text-[11px] leading-snug text-neutralx-400">{notReadyReason}</span>
        )}
      </div>
      {open && (
        <Modal
          shiftId={shiftId}
          listedRateCents={listedRateCents}
          clientName={clientName}
          startTime={startTime}
          endTime={endTime}
          conflict={conflict}
          agreementHref={agreementHref}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  shiftId,
  listedRateCents,
  clientName,
  startTime,
  endTime,
  conflict,
  agreementHref,
  onClose,
}: {
  shiftId: string;
  listedRateCents: number;
  clientName: string;
  startTime: string;
  endTime: string;
  conflict: boolean;
  agreementHref: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [mode, setMode] = useState<"full" | "flex">("full");
  const [from, setFrom] = useState(startTime);
  const [to, setTo] = useState(endTime);
  const [rate, setRate] = useState((listedRateCents / 100).toFixed(2).replace(".", ","));
  const [motivation, setMotivation] = useState("");
  const [okAgreement, setOkAgreement] = useState(false);
  const [okDresscode, setOkDresscode] = useState(false);
  const [autoWithdraw, setAutoWithdraw] = useState(false);
  const [hours, setHours] = useState(4);
  const [err, setErr] = useState<string | null>(null);

  const rateCents = Math.round(parseFloat(rate.replace(",", ".")) * 100);
  const isCounter = Number.isFinite(rateCents) && rateCents !== listedRateCents;
  const canConfirm = okAgreement && okDresscode && !pending;

  function submit() {
    setErr(null);
    if (!okAgreement || !okDresscode) return setErr("Ga akkoord met de overeenkomst en de voorschriften.");
    if (!Number.isFinite(rateCents) || rateCents < 1000 || rateCents > 25000) {
      return setErr("Voer een uurtarief tussen € 10 en € 250 in.");
    }
    const parts: string[] = [];
    if (motivation.trim()) parts.push(motivation.trim());
    if (mode === "flex") parts.push(`Voorgestelde tijden: ${from}–${to}`);
    if (autoWithdraw) parts.push(`Reactie automatisch intrekken ${hours} uur voor aanvang.`);
    const note = parts.join("\n");

    start(async () => {
      try {
        const r = await counterOfferAction(shiftId, rateCents, note);
        if (!r.ok) throw new Error(r.message);
        toast.success("Je reactie staat bij Mijn klussen", `${clientName} bekijkt je reactie en kiest wie de klus doet.`);
        onClose();
        router.push("/dashboard/diensten");
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/50" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="border-b border-hair px-5 py-4 text-center font-display text-lg font-bold uppercase tracking-tight text-ink">
            Reageer op deze klus
          </h2>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5 text-sm text-neutralx-700">
              <span className="font-semibold">Let op!</span> Als je wordt uitgekozen verwacht {clientName} dat je komt
              werken.
            </p>

            {/* Beschikbaarheid */}
            <div>
              <p className="text-sm font-semibold text-ink">Jouw beschikbaarheid</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("full")}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    mode === "full" ? "border-brand-500 bg-brand-50" : "border-hairstrong"
                  }`}
                >
                  <span className="block text-sm font-bold text-ink">Volledige dienst</span>
                  <span className="block text-xs text-neutralx-500">
                    {startTime} - {endTime}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("flex")}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    mode === "flex" ? "border-brand-500 bg-brand-50" : "border-hairstrong"
                  }`}
                >
                  <span className="block text-sm font-bold text-ink">Flexibel</span>
                  <span className="block text-xs text-neutralx-500">Stel je tijden voor</span>
                </button>
              </div>
              {mode === "flex" ? (
                <div className="mt-2 flex items-center gap-3 rounded-lg bg-paper-soft p-3">
                  <label className="flex-1 text-xs text-neutralx-600">
                    Van
                    <input
                      type="time"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="mt-1 w-full rounded border border-hairstrong px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex-1 text-xs text-neutralx-600">
                    Tot
                    <input
                      type="time"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 w-full rounded border border-hairstrong px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
                  <span className="font-semibold text-ink">Kun je niet de volledige dienst werken?</span> Schakel over
                  naar flexibel om je eigen start- of eindtijd voor te stellen.
                </p>
              )}
            </div>

            {/* Uurtarief */}
            <div>
              <label className="flex items-center justify-between text-sm font-semibold text-ink">
                Uurtarief
                <span
                  className="grid h-4 w-4 place-items-center rounded-full border border-neutralx-400 text-[9px] text-neutralx-400"
                  title="Je mag een ander tarief voorstellen. De opdrachtgever ziet dit als tegenbod."
                >
                  i
                </span>
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-hairstrong bg-paper-soft px-3 py-2.5 text-sm">
                <span className="mr-1 text-neutralx-500">€</span>
                <input
                  value={rate}
                  inputMode="decimal"
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full bg-transparent outline-none"
                />
              </div>
              {isCounter && (
                <p className="mt-1 text-[11px] text-warn">Tegenbod — aangeboden tarief is {moneyExact(listedRateCents)}/u.</p>
              )}
            </div>

            {/* Motivatie */}
            <div>
              <p className="text-sm font-semibold text-ink">Waarom moet {clientName} jou uitkiezen?</p>
              <textarea
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Je motivatie (optioneel)"
                className="mt-1.5 w-full rounded-lg border border-hairstrong bg-paper-soft px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>

            {/* Akkoord */}
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 text-sm text-neutralx-700">
                <input
                  type="checkbox"
                  checked={okAgreement}
                  onChange={(e) => setOkAgreement(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand-500"
                />
                <span>
                  Ik ga akkoord met de{" "}
                  {agreementHref ? (
                    <a href={agreementHref} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      overeenkomst
                    </a>
                  ) : (
                    <span className="font-semibold underline">overeenkomst</span>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-neutralx-700">
                <input
                  type="checkbox"
                  checked={okDresscode}
                  onChange={(e) => setOkDresscode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand-500"
                />
                <span>
                  Ik ga akkoord met de <span className="font-semibold underline">kledingvoorschriften</span> voor deze klus
                </span>
              </label>
            </div>

            {/* Automatisch intrekken */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Automatisch reactie intrekken</p>
                <span
                  className="grid h-4 w-4 place-items-center rounded-full border border-neutralx-400 text-[9px] text-neutralx-400"
                  title="Handig als je niet meer wilt reageren zodra de klus dichtbij is en je nog niet gekozen bent."
                >
                  i
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-hair p-3">
                <p className="text-sm text-neutralx-600">
                  Trek mijn reactie{" "}
                  {autoWithdraw ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setHours((h) => Math.max(1, h - 1))}
                        className="grid h-5 w-5 place-items-center rounded border border-hairstrong text-xs"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-bold text-ink">{hours}</span>
                      <button
                        type="button"
                        onClick={() => setHours((h) => Math.min(72, h + 1))}
                        className="grid h-5 w-5 place-items-center rounded border border-hairstrong text-xs"
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <span className="font-bold text-ink">0</span>
                  )}{" "}
                  uur voor aanvang klus automatisch in
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoWithdraw}
                  onClick={() => setAutoWithdraw((v) => !v)}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${autoWithdraw ? "bg-brand-500" : "bg-hairstrong"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${autoWithdraw ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            </div>

            {err && <p className="text-xs text-crit">{err}</p>}
          </div>

          <div className="border-t border-hair p-4">
            {conflict && (
              <p className="mb-2 text-center text-xs leading-relaxed text-crit">
                Controleer je planning. Deze klus kan conflicteren met een andere match. Kijk of je planning haalbaar
                is.
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canConfirm}
              className="btn-primary w-full py-3 text-sm disabled:opacity-50"
            >
              {pending ? "Versturen…" : "Bevestig je reactie"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="mt-2 block w-full text-center text-sm font-medium text-neutralx-500 underline hover:text-ink"
            >
              Annuleren
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
