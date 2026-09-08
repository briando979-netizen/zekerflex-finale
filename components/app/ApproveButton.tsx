"use client";

import { useState, useTransition } from "react";
import { approveTimesheetAction } from "@/app/werkgever/uren/actions";
import { useT } from "@/components/i18n/I18nProvider";

export function ApproveButton({ timesheetId }: { timesheetId: string }) {
  const c = useT().controls;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (msg?.ok) {
    return <span className="pill-ok">{msg.text}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await approveTimesheetAction(timesheetId);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {pending ? c.approving : c.approve}
      </button>
      {msg && !msg.ok && <span className="text-xs text-crit">{msg.text}</span>}
    </div>
  );
}
