"use client";

import { useState, useTransition } from "react";
import { applyToShiftAction } from "@/app/dashboard/klussen/actions";

export function ApplyButton({ shiftId, disabled }: { shiftId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (msg?.ok) return <span className="pill-ok">{msg.text}</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await applyToShiftAction(shiftId);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
        className="btn-primary px-4 py-2 text-sm"
      >
        {pending ? "Bezig…" : "Aannemen"}
      </button>
      {msg && !msg.ok && <span className="max-w-[220px] text-right text-xs text-crit">{msg.text}</span>}
    </div>
  );
}
