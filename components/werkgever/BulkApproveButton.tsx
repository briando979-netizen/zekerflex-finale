"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveCleanTimesheetsAction } from "@/app/werkgever/uren/actions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

/** Werkgever → Uren: alle briefjes zonder signaal of extra kosten in één keer goedkeuren. */
export function BulkApproveButton({ ids, bedrag }: { ids: string[]; bedrag: string }) {
  const t = useT();
  const h = t.hours;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair bg-white px-4 py-3">
      <p className="text-sm text-neutralx-600">{fmt(h.bulkHint, { bedrag })}</p>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(fmt(h.bulkConfirm, { n: ids.length, bedrag }))) return;
            start(async () => {
              setError(null);
              const r = await approveCleanTimesheetsAction(ids);
              if (r.ok) toast.success(r.message);
              else {
                setError(r.message);
                toast.error(r.message);
              }
              router.refresh();
            });
          }}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {pending ? t.controls.approving : fmt(h.bulkButton, { n: ids.length })}
        </button>
        {error && <span role="alert" className="text-xs text-crit">{error}</span>}
      </div>
    </div>
  );
}
