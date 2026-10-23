"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";
import { RegelVervangingFlow } from "@/components/app/RegelVervangingFlow";
import { AddToCalendarButton } from "@/components/app/AddToCalendarButton";
import type { CalendarEvent } from "@/lib/calendar/links";
import { NOTICE_HOURS } from "@/lib/claims/policy";

// ---------------------------------------------------------------------------
// Action set for a shift the freelancer has been assigned to:
//   • Bevestig dat je komt        (no-show prevention)
//   • Zet in je agenda            (.ics download)
//   • Regel vervanging            (full "Vervanging zoeken" flow → open request)
//   • Zeg deze klus af            (free the seat, back to the marketplace)
// Once a replacement request is open the block switches to a list:
//   Je zoekt vervanging voor deze klus → Trek vervanging in / Zeg deze klus af
// ---------------------------------------------------------------------------

export interface ShiftActionsProps {
  assignmentId: string;
  shiftId: string;
  shiftTitle: string;
  startsAtISO: string;
  confirmedAt: string | null;
  replacementRequested: boolean;
  replacementRequestId?: string | null;
  replacementResponseCount?: number;
  heroPhoto?: string | null;
  /** Shift details for the "Zet in je agenda" deep-links. */
  calendar?: CalendarEvent | null;
  variant?: "card" | "detail";
}

export function ShiftActions({
  assignmentId,
  shiftTitle,
  startsAtISO,
  confirmedAt,
  replacementRequested,
  replacementRequestId,
  replacementResponseCount = 0,
  heroPhoto,
  calendar,
  variant = "card",
}: ShiftActionsProps) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmed, setConfirmed] = useState(Boolean(confirmedAt));
  const [reqOpen, setReqOpen] = useState(replacementRequested);
  const [flowOpen, setFlowOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const started = new Date(startsAtISO).getTime() < Date.now();
  const icsHref = `/api/me/assignments/${assignmentId}/ics`;

  // Annuleertermijn: tot NOTICE_HOURS vóór aanvang kun je kosteloos afzeggen.
  const freeUntilMs = new Date(startsAtISO).getTime() - NOTICE_HOURS * 3_600_000;
  const stillFree = Date.now() < freeUntilMs;
  const deadlineLabel = new Date(freeUntilMs).toLocaleString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });

  function confirmAttendance() {
    start(async () => {
      const res = await fetch("/api/me/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      if (res.ok) {
        setConfirmed(true);
        toast.success("Bedankt — je komst is bevestigd");
      } else {
        toast.error("Bevestigen mislukt");
      }
    });
  }

  async function withdrawReplacement() {
    if (!replacementRequestId) return;
    setWithdrawBusy(true);
    try {
      const res = await fetch("/api/me/replacement", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: replacementRequestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Intrekken mislukt");
      setReqOpen(false);
      setWithdrawOpen(false);
      toast.success("Vervanging ingetrokken", "De klus blijft van jou.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setWithdrawBusy(false);
    }
  }

  const AgendaLink = calendar ? (
    <AddToCalendarButton assignmentId={assignmentId} compact {...calendar} />
  ) : (
    <a
      href={icsHref}
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairstrong px-2.5 py-1.5 text-xs font-medium text-neutralx-600 hover:border-brand-400 hover:text-brand-700"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Zet in je agenda
    </a>
  );

  const CancelModal = cancelOpen ? (
    <CancelShiftModal
      assignmentId={assignmentId}
      shiftTitle={shiftTitle}
      startsAtISO={startsAtISO}
      onClose={() => setCancelOpen(false)}
      onCancelled={(late) => {
        setCancelOpen(false);
        toast.success(
          "Klus afgezegd",
          late
            ? "Omdat dit buiten de opzegtermijn is, kan de opdrachtgever een vergoeding van 50% claimen."
            : "De dienst staat weer open op het platform.",
        );
        router.refresh();
      }}
    />
  ) : null;

  if (reqOpen) {
    return (
      <>
        <div>
          <p className="font-display text-base font-bold text-ink">Je zoekt vervanging voor deze klus</p>
          <div className="mt-3 divide-y divide-hair border-y border-hair">
            {replacementRequestId && replacementResponseCount > 0 && (
              <Link
                href={`/dashboard/diensten/vervanging/${replacementRequestId}`}
                className="flex items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
              >
                Bekijk reacties ({replacementResponseCount})
                <span className="text-neutralx-400">›</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
            >
              Trek vervanging in
              <span className="text-neutralx-400">›</span>
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-crit"
            >
              Zeg deze klus af
              <span className="text-neutralx-400">›</span>
            </button>
          </div>
          {!started && <div className="mt-3">{AgendaLink}</div>}
        </div>

        {withdrawOpen && (
          <Portal>
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 p-6">
              <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift">
                <h2 className="font-display text-lg font-bold text-ink">Vervanging intrekken?</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
                  De klus blijft van jou en de openstaande oproep voor een vervanger wordt gesloten.
                  Eventuele reacties vervallen.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    onClick={() => setWithdrawOpen(false)}
                    className="btn-ghost flex-1 disabled:opacity-50"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    onClick={withdrawReplacement}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {withdrawBusy ? "Bezig…" : "Intrekken"}
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {CancelModal}
      </>
    );
  }

  return (
    <div className={variant === "detail" ? "space-y-3" : "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        {confirmed ? (
          <span className="pill-ok">✓ Bevestigd</span>
        ) : (
          <button
            type="button"
            disabled={pending || started}
            onClick={confirmAttendance}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Bevestig dat je komt
          </button>
        )}
        {AgendaLink}
      </div>

      {!started && (
        <div className="space-y-3">
          {/* Annuleringstermijn */}
          <div
            className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
              stillFree ? "border-hair bg-paper-soft text-neutralx-600" : "border-warn/30 bg-warn/5 text-neutralx-700"
            }`}
          >
            {stillFree ? (
              <>
                🕒 Gratis afzeggen kan nog tot <span className="font-semibold text-ink">{deadlineLabel}</span>. Daarna kan de
                opdrachtgever tot 50% in rekening brengen.
              </>
            ) : (
              <>
                <span className="font-semibold text-warn">Binnen de opzegtermijn.</span> Afzeggen kan nog, maar de
                opdrachtgever kan tot 50% van de dienst in rekening brengen. Kun je niet?{" "}
                <span className="font-semibold text-ink">Regel kosteloos een vervanger</span> — dan heeft het geen gevolgen
                voor je betrouwbaarheidsscore.
              </>
            )}
          </div>

          {/* Extra info voor jou */}
          <div className="rounded-lg border border-hairstrong bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
            <p className="mb-1.5 text-sm font-semibold text-ink">Extra info voor jou</p>
            <p>
              <span className="font-semibold text-ink">Vergeet je ID-kaart niet</span> — je checkt op locatie in en uit via de
              app.
            </p>
            <p className="mt-1.5">
              De eindtijd is <span className="font-semibold text-ink">indicatief</span>: de klus kan eerder of later eindigen.
              Alleen je <span className="font-semibold text-ink">daadwerkelijk gewerkte uren</span> worden uitbetaald, dus houd
              hier rekening mee in je planning.
            </p>
          </div>

          {/* Acties — volle-breedte rijen */}
          <div className="divide-y divide-hair border-y border-hair">
            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
            >
              Regel vervanging via ZekerFlex
              <span className="text-neutralx-400" aria-hidden>›</span>
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-crit"
            >
              Zeg deze klus af
              <span className="text-neutralx-400" aria-hidden>›</span>
            </button>
          </div>
        </div>
      )}

      {flowOpen && (
        <RegelVervangingFlow
          assignmentId={assignmentId}
          heroPhoto={heroPhoto ?? null}
          onClose={() => setFlowOpen(false)}
          onRequested={() => {
            setFlowOpen(false);
            setReqOpen(true);
            router.refresh();
          }}
        />
      )}

      {CancelModal}
    </div>
  );
}

function CancelShiftModal({
  assignmentId,
  shiftTitle,
  startsAtISO,
  onClose,
  onCancelled,
}: {
  assignmentId: string;
  shiftTitle: string;
  startsAtISO: string;
  onClose: () => void;
  onCancelled: (late: boolean) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const hoursUntilStart = (new Date(startsAtISO).getTime() - Date.now()) / 3_600_000;
  const withinNotice = hoursUntilStart >= NOTICE_HOURS;

  async function cancelShift() {
    if (reason.trim().length < 3) {
      toast.error("Geef kort aan waarom je afzegt.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/me/assignments/${assignmentId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Afzeggen mislukt");
      onCancelled(Boolean(data?.late));
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-display text-lg font-bold text-ink">Zeg deze klus af</h2>
          <p className="mt-1 text-sm text-neutralx-600">&ldquo;{shiftTitle}&rdquo;</p>

          {withinNotice ? (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-neutralx-700">
              <span className="font-semibold text-warn">Let op:</span> zonder vervanger afzeggen telt mee
              in je betrouwbaarheidsscore en kan je matching beperken. Je zegt af binnen de opzegtermijn
              ({NOTICE_HOURS} uur), dus hier zijn geen kosten aan verbonden. Deze actie kun je niet
              ongedaan maken.
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-crit/30 bg-crit/5 px-3 py-2 text-xs leading-relaxed text-neutralx-700">
              <span className="font-semibold text-crit">Let op:</span> je zegt af binnen {NOTICE_HOURS} uur voor
              aanvang. De opdrachtgever krijgt hierdoor de optie om 50% van deze dienst bij jou in rekening
              te brengen. Dit telt ook mee in je betrouwbaarheidsscore. Deze actie kun je niet ongedaan maken.
            </div>
          )}

          <label className="mt-3 block text-xs font-medium text-neutralx-500">
            Waarom wil je deze klus afzeggen?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="field-input mt-1"
            placeholder="Bijv. ziek, dubbel geboekt, vervoer niet gelukt…"
          />

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={cancelShift}
              disabled={busy}
              className="w-full rounded-xl border border-crit/40 bg-crit/5 px-3 py-2 text-sm font-semibold text-crit hover:bg-crit/10 disabled:opacity-50"
            >
              {busy ? "Bezig…" : "Zeg deze klus af"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="block w-full py-1.5 text-center text-xs text-neutralx-400 hover:text-ink"
            >
              Toch niet
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
