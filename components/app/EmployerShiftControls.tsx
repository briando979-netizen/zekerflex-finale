"use client";

import { useState } from "react";
import { Portal } from "@/components/chat/Portal";
import { updateShiftAction, cancelShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

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

const toLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function EmployerShiftControls({ shift }: { shift: ShiftInit }) {
  const [mode, setMode] = useState<null | "edit" | "cancel">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const editable = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status);
  const cancellable = !["COMPLETED", "CANCELLED"].includes(shift.status);

  if (!editable && !cancellable) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        <button type="button" onClick={() => setMode("edit")} className="btn-ghost text-sm">
          Dienst aanpassen
        </button>
      )}
      {cancellable && (
        <button type="button" onClick={() => setMode("cancel")} className="text-sm font-medium text-crit hover:underline">
          Dienst annuleren
        </button>
      )}
      {msg && <span className="text-xs text-neutralx-500">{msg}</span>}

      {mode === "edit" && (
        <EditModal
          shift={shift}
          onClose={() => setMode(null)}
          onDone={(m) => {
            setMsg(m);
            setMode(null);
          }}
        />
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

function EditModal({ shift, onClose, onDone }: { shift: ShiftInit; onClose: () => void; onDone: (m: string) => void }) {
  const [title, setTitle] = useState(shift.title);
  const [description, setDescription] = useState(shift.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocal(shift.startsAt));
  const [endsAt, setEndsAt] = useState(toLocal(shift.endsAt));
  const [breakMin, setBreakMin] = useState(String(shift.breakMinutes));
  const [rate, setRate] = useState((shift.hourlyRateCents / 100).toFixed(2));
  const [positions, setPositions] = useState(String(shift.positions));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const res = await updateShiftAction(shift.id, {
      title,
      description,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      breakMinutes: Number(breakMin) || 0,
      hourlyRateCents: Math.round(parseFloat(rate.replace(",", ".")) * 100),
      positions: Number(positions) || 1,
    });
    setBusy(false);
    if (res.ok) onDone(res.message);
    else setErr(res.message);
  };

  return (
    <Shell title="Dienst aanpassen" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="field-label">Titel</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Omschrijving</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="field-input" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Start</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Einde</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Pauze (min)</span>
            <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Uurtarief (€)</span>
            <input value={rate} onChange={(e) => setRate(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Plekken (min. {shift.assignedCount})</span>
            <input type="number" value={positions} onChange={(e) => setPositions(e.target.value)} className="field-input" />
          </label>
        </div>
        {err && <p className="text-xs text-crit">{err}</p>}
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? "Opslaan…" : "Wijzigingen opslaan"}
        </button>
        {shift.assignedCount > 0 && (
          <p className="text-xs text-neutralx-400">
            Er {shift.assignedCount === 1 ? "is" : "zijn"} al {shift.assignedCount} kracht(en) aangenomen — die krijgen een melding.
          </p>
        )}
      </div>
    </Shell>
  );
}

function CancelModal({ shift, onClose, onDone }: { shift: ShiftInit; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr("Geef kort een reden op.");
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
    <Shell title="Dienst annuleren" onClose={onClose}>
      <div className="space-y-3">
        {shift.assignedCount > 0 && (
          <p className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-neutralx-700">
            Let op: er {shift.assignedCount === 1 ? "is" : "zijn"} al {shift.assignedCount} kracht(en) uitgekozen. Als zij
            een claim indienen en jij die goedkeurt, betaal je <strong>50%</strong> van de klus.
          </p>
        )}
        <label className="block">
          <span className="field-label">Reden</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="field-input" placeholder="Waarom gaat de dienst niet door?" />
        </label>
        {err && <p className="text-xs text-crit">{err}</p>}
        <button type="button" onClick={submit} disabled={busy} className="w-full rounded-full bg-crit px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Annuleren…" : "Definitief annuleren"}
        </button>
      </div>
    </Shell>
  );
}
