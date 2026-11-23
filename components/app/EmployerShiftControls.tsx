"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Portal } from "@/components/chat/Portal";
import Link from "next/link";
import { cancelShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { Punten } from "@/components/werkgever/iconen";

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


// De knop "Opties" op de kluspagina (23 nov 2026, zoals het menu van YoungOnes): Klus aanpassen, Klus dupliceren en Klus annuleren
// in één menu in plaats van drie losse knoppen. Escape en ergens anders tikken sluiten het menu; de pijltjestoetsen lopen langs de regels.
export function EmployerShiftControls({ shift }: { shift: ShiftInit }) {
  const t = useT();
  const c = t.controls;
  const k = t.klusPagina;
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "cancel">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const editable = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status);
  const cancellable = !["COMPLETED", "CANCELLED"].includes(shift.status);

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLElement>("button[aria-haspopup]")?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const regels = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (regels.length === 0) return;
      e.preventDefault();
      const nu = regels.indexOf(document.activeElement as HTMLElement);
      const volgende = e.key === "ArrowDown" ? (nu + 1) % regels.length : (nu - 1 + regels.length) % regels.length;
      regels[volgende]?.focus();
    };
    const buiten = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", toets);
    document.addEventListener("pointerdown", buiten);
    return () => {
      document.removeEventListener("keydown", toets);
      document.removeEventListener("pointerdown", buiten);
    };
  }, [open]);

  const REGEL = "flex min-h-11 w-full items-center px-4 text-left text-sm hover:bg-paper-soft";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={k.optiesMenu}
        className="btn-ghost min-h-11 gap-2 rounded-lg px-3 text-sm sm:px-4"
      >
        <span className="hidden sm:inline">{k.opties}</span>
        <Punten maat={18} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={k.optiesMenu} className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-hair bg-white py-1 shadow-e3">
          {editable && (
            // same form and preview as placing a klus (/werkgever/diensten/[id]/bewerken)
            <Link role="menuitem" href={`/werkgever/diensten/${shift.id}/bewerken`} className={`${REGEL} text-ink`}>
              {c.editShift}
            </Link>
          )}
          {/* "Klus dupliceren" (naar YoungOnes): dezelfde klus opnieuw plaatsen met een nieuwe datum, ook na afloop */}
          <Link role="menuitem" href={`/werkgever/diensten/nieuw?kopie=${encodeURIComponent(shift.id)}`} className={`${REGEL} text-ink`}>
            {c.duplicateShift}
          </Link>
          {cancellable && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setMode("cancel");
              }}
              className={`${REGEL} font-medium text-crit`}
            >
              {c.cancelShift}
            </button>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="absolute right-0 top-full mt-2 w-56 text-right text-xs text-neutralx-500">
          {msg}
        </p>
      )}

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
