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
import { useFT } from "@/components/i18n/useFT";

// ---------------------------------------------------------------------------
// Action set for a shift the freelancer has been assigned to:
//   • Bevestig dat je komt        (no-show prevention)
//   • Zet in je agenda            (.ics download)
//   • Regel vervanging            (full "Vervanging zoeken" flow → open request)
//   • Zeg deze klus af            (free the seat, back to the marketplace)
// Once a replacement request is open the block switches to a list:
//   Je zoekt vervanging voor deze klus → Trek vervanging in / Zeg deze klus af
// Teksten in vijf talen via useFT().act (lib/i18n/freelancer.ts); **vet** in een
// zin wordt een nadruk-span, zodat elke taal zijn eigen woordvolgorde houdt.
// ---------------------------------------------------------------------------

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <span key={i} className="font-semibold text-ink">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

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
  const ft = useFT();
  const t = ft.act;
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
  const deadlineLabel = new Date(freeUntilMs).toLocaleString(ft.intl, {
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
        toast.success(t.confirmedToast);
      } else {
        toast.error(t.confirmFailed);
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
      if (!res.ok) throw new Error(data?.error?.message ?? t.withdrawFailed);
      setReqOpen(false);
      setWithdrawOpen(false);
      toast.success(t.withdrawn, t.withdrawnBody);
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
      {t.addToCalendar}
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
        toast.success(t.cancelledToast, late ? t.cancelledLate : t.cancelledFree);
        router.refresh();
      }}
    />
  ) : null;

  if (reqOpen) {
    return (
      <>
        <div>
          <p className="font-display text-base font-bold text-ink">{t.seeking}</p>
          <div className="mt-3 divide-y divide-hair border-y border-hair">
            {replacementRequestId && replacementResponseCount > 0 && (
              <Link
                href={`/dashboard/diensten/vervanging/${replacementRequestId}`}
                className="flex items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
              >
                {t.viewResponses(replacementResponseCount)}
                <span className="text-neutralx-400">›</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
            >
              {t.withdraw}
              <span className="text-neutralx-400">›</span>
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-crit"
            >
              {t.cancelJob}
              <span className="text-neutralx-400">›</span>
            </button>
          </div>
          {!started && <div className="mt-3">{AgendaLink}</div>}
        </div>

        {withdrawOpen && (
          <Portal>
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 p-6">
              <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift">
                <h2 className="font-display text-lg font-bold text-ink">{t.withdrawQ}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{t.withdrawBody}</p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    onClick={() => setWithdrawOpen(false)}
                    className="btn-ghost flex-1 disabled:opacity-50"
                  >
                    {t.back}
                  </button>
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    onClick={withdrawReplacement}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {withdrawBusy ? t.busy : t.withdrawBtn}
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
          <span className="pill-ok">{t.confirmed}</span>
        ) : (
          <button
            type="button"
            disabled={pending || started}
            onClick={confirmAttendance}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {t.confirmBtn}
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
              <Rich text={t.freeUntil(deadlineLabel)} />
            ) : (
              <>
                <span className="font-semibold text-warn">{t.lateTitle}</span> <Rich text={t.lateBody} />
              </>
            )}
          </div>

          {/* Extra info voor jou */}
          <div className="rounded-lg border border-hairstrong bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
            <p className="mb-1.5 text-sm font-semibold text-ink">{t.extraTitle}</p>
            <p>
              <Rich text={t.idCard} />
            </p>
            <p className="mt-1.5">
              <Rich text={t.endTime} />
            </p>
          </div>

          {/* Acties — volle-breedte rijen */}
          <div className="divide-y divide-hair border-y border-hair">
            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-brand-700"
            >
              {t.replaceVia}
              <span className="text-neutralx-400" aria-hidden>›</span>
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="flex w-full items-center justify-between py-3.5 text-sm font-semibold text-ink hover:text-crit"
            >
              {t.cancelJob}
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
  const t = useFT().act;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const hoursUntilStart = (new Date(startsAtISO).getTime() - Date.now()) / 3_600_000;
  const withinNotice = hoursUntilStart >= NOTICE_HOURS;

  async function cancelShift() {
    if (reason.trim().length < 3) {
      toast.error(t.reasonRequired);
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
      if (!res.ok) throw new Error(data?.error?.message ?? t.cancelFailed);
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
          <h2 className="font-display text-lg font-bold text-ink">{t.cancelJob}</h2>
          <p className="mt-1 text-sm text-neutralx-600">&ldquo;{shiftTitle}&rdquo;</p>

          {withinNotice ? (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-neutralx-700">
              <span className="font-semibold text-warn">{t.warn}</span> {t.earlyWarn(NOTICE_HOURS)}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-crit/30 bg-crit/5 px-3 py-2 text-xs leading-relaxed text-neutralx-700">
              <span className="font-semibold text-crit">{t.warn}</span> {t.lateWarn(NOTICE_HOURS)}
            </div>
          )}

          <label htmlFor="cancel-reason" className="mt-3 block text-xs font-medium text-neutralx-500">
            {t.reasonLabel}
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="field-input mt-1"
            placeholder={t.reasonPlaceholder}
          />

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={cancelShift}
              disabled={busy}
              className="w-full rounded-xl border border-crit/40 bg-crit/5 px-3 py-2 text-sm font-semibold text-crit hover:bg-crit/10 disabled:opacity-50"
            >
              {busy ? t.busy : t.cancelJob}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="block w-full py-1.5 text-center text-xs text-neutralx-400 hover:text-ink"
            >
              {t.notNow}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
