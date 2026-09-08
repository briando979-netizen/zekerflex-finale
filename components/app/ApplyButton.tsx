"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { applyToShiftAction } from "@/app/dashboard/klussen/actions";

export function ApplyButton({
  shiftId,
  disabled,
  notReadyReason,
}: {
  shiftId: string;
  disabled?: boolean;
  /** why the freelancer can't apply yet (verification pending, etc.) — shown as a hint */
  notReadyReason?: string | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (msg?.ok) return <span className="pill-ok">{msg.text}</span>;

  const needsVerification = Boolean(
    notReadyReason && /verificat|geverifieerd/i.test(notReadyReason),
  );

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
      {notReadyReason && (
        <span className="max-w-[220px] text-right text-[11px] leading-snug text-neutralx-400">
          {notReadyReason}{" "}
          {needsVerification && (
            <Link href="/dashboard/verificatie" className="font-medium text-brand-600 hover:underline">
              Verifiëren →
            </Link>
          )}
        </span>
      )}
      {msg && !msg.ok && <span className="max-w-[220px] text-right text-xs text-crit">{msg.text}</span>}
    </div>
  );
}
