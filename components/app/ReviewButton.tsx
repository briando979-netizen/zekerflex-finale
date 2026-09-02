"use client";

import { useState } from "react";
import { Portal } from "@/components/chat/Portal";

export function ReviewButton({
  subjectType,
  subjectId,
  subjectName,
  shiftId,
  label = "Beoordeel",
  done: initialDone = false,
}: {
  subjectType: "freelancer" | "company";
  subjectId: string;
  subjectName: string;
  shiftId?: string;
  label?: string;
  done?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType, subjectId, rating, text, ...(shiftId ? { shiftId } : {}) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Kon review niet opslaan");
      }
      setDone(true);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <span className="text-xs text-neutralx-400">Beoordeeld ✓</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
        {label}
      </button>
      {open && (
        <Portal>
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold text-ink">Beoordeel {subjectName}</h2>
            <div className="mt-3 flex gap-1 text-2xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={n <= rating ? "text-amber-500" : "text-neutralx-300"}
                  aria-label={`${n} sterren`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="field-input mt-3"
              placeholder="Hoe ging de samenwerking?"
              maxLength={1500}
            />
            {err && <p className="mt-1 text-xs text-crit">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1">
                {busy ? "Versturen…" : "Review plaatsen"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                Annuleer
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
