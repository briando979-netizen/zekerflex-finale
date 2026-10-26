"use client";

import { useState, useTransition } from "react";
import { approveTimesheetAction, requestManualReviewAction } from "@/app/werkgever/uren/actions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";

interface Props {
  timesheetId: string;
  /** Any non-critical signal present (e.g. missing GPS check-in) — approvable with an explicit confirm. */
  hasFlags?: boolean;
  /** A critical signal (mock GPS, severe geofence miss, impossible hours, overlap) — cannot self-approve. */
  hasCriticalFlag?: boolean;
  flagSummary?: string;
}

export function ApproveButton({ timesheetId, hasFlags = false, hasCriticalFlag = false, flagSummary = "" }: Props) {
  const c = useT().controls;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);

  // On success the toast carries the confirmation — it survives this row
  // leaving the list when the server action revalidates it (Next 15).
  if (ok) return <span className="pill-ok">{c.approved}</span>;
  if (reviewRequested) return <span className="pill-warn">{c.reviewRequested}</span>;

  if (hasCriticalFlag) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await requestManualReviewAction(timesheetId);
              if (r.ok) {
                setReviewRequested(true);
                toast.success(r.message);
              } else {
                setError(r.message);
                toast.error(r.message);
              }
            })
          }
          className="btn-ghost px-3 py-1.5 text-xs text-crit"
        >
          {pending ? c.approving : c.requestReview}
        </button>
        {error && <span role="alert" className="text-xs text-crit">{error}</span>}
      </div>
    );
  }

  const approve = (overrideGpsCheck?: boolean) =>
    start(async () => {
      setError(null);
      const r = await approveTimesheetAction(timesheetId, overrideGpsCheck);
      if (r.ok) {
        setOk(true);
        toast.success(r.message);
      } else {
        setError(r.message);
        toast.error(r.message);
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (hasFlags) {
            if (window.confirm(`${flagSummary || "Dit urenbriefje heeft een signaal."}\n\nToch goedkeuren?`)) {
              approve(true);
            }
            return;
          }
          approve();
        }}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {pending ? c.approving : hasFlags ? c.approveWithFlags : c.approve}
      </button>
      {error && <span role="alert" className="text-xs text-crit">{error}</span>}
    </div>
  );
}
