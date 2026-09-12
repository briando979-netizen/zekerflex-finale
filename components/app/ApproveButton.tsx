"use client";

import { useState, useTransition } from "react";
import { approveTimesheetAction } from "@/app/werkgever/uren/actions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";

export function ApproveButton({ timesheetId }: { timesheetId: string }) {
  const c = useT().controls;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // On success the toast carries the confirmation — it survives this row
  // leaving the list when the server action revalidates it (Next 15).
  if (ok) return <span className="pill-ok">{c.approved}</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await approveTimesheetAction(timesheetId);
            if (r.ok) {
              setOk(true);
              toast.success(r.message);
            } else {
              setError(r.message);
              toast.error(r.message);
            }
          })
        }
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {pending ? c.approving : c.approve}
      </button>
      {error && <span className="text-xs text-crit">{error}</span>}
    </div>
  );
}
