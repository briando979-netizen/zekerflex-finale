"use client";

import { useState } from "react";
import { Portal } from "@/components/chat/Portal";
import Link from "next/link";
import { cancelShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

interface ShiftInit {
  id: string;
  title: string;
  description: string | null;
  startsAt: string; // ISO
  endsAt: string;
  breakMinutes: number;
  hourlyRateCents: number;
  positions: number;
  status: string;
  assignedCount: number;
}

export function EmployerShiftControls({ shift }: { shift: ShiftInit }) {
  const c = useT().controls;
  const [mode, setMode] = useState<null | "cancel">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const editable = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status);
  const cancellable = !["COMPLETED", "CANCELLED"].includes(shift.status);

  if (!editable && !cancellable) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        // same form and preview as placing a klus (/werkgever/diensten/[id]/bewerken)
        <Link href={`/werkgever/diensten/${shift.id}/bewerken`} className="btn-ghost text-sm">
          {c.editShift}
        </Link>
      )}
      {cancellable && (
        <button type="button" onClick={() => setMode("cancel")} className="text-sm font-medium text-crit hover:underline">
          {c.cancelShift}
        </button>
      )}
      {msg && <span className="text-xs text-neutralx-500">{msg}</span>}

      {mode === "cancel" && (
        <CancelModal
          shift={shift}
          onClose={() => setMode(null)}
          onDone={(m) => {
            setMsg(m);
            setMode(null);
          }}
        />
      )}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            <button type="button" onClick={onClose} className="text-lg text-neutralx-400">✕</button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function CancelModal({ shift, onClose, onDone }: { shift: ShiftInit; onClose: () => void; onDone: (m: string) => void }) {
  const c = useT().controls;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr(c.reasonShort);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await cancelShiftAction(shift.id, reason.trim());
    setBusy(false);
    if (res.ok) onDone(res.message);
    else setErr(res.message);
  };

  return (
    <Shell title={c.cancelTitle} onClose={onClose}>
      <div className="space-y-3">
        {shift.assignedCount > 0 && (
          <p className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-neutralx-700">
            {fmt(c.cancelWarn, {
              n: shift.assignedCount,
              verb: shift.assignedCount === 1 ? c.verbIs : c.verbAre,
            })}
          </p>
        )}
        <label className="block">
          <span className="field-label">{c.reason}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="field-input" placeholder={c.reasonPh} />
        </label>
        {err && <p role="alert" className="text-xs text-crit">{err}</p>}
        <button type="button" onClick={submit} disabled={busy} className="w-full rounded-full bg-crit px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? c.cancelling : c.cancelDefinitive}
        </button>
      </div>
    </Shell>
  );
}
