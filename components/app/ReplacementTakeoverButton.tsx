"use client";

import { useState } from "react";
import Link from "next/link";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";

/**
 * Marketplace action for a shift whose holder asked for a replacement. Instead
 * of taking a (non-existent) free seat, the freelancer offers to take over; the
 * original picks a responder later.
 */
export function ReplacementTakeoverButton({
  shiftId,
  disabled = false,
  notReadyReason,
}: {
  shiftId: string;
  disabled?: boolean;
  notReadyReason?: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/replacement/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Aanmelden mislukt");
      setDone(true);
      setOpen(false);
      toast.success("Je aanbod is verstuurd", "Je krijgt bericht als de kracht jou kiest.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <span className="pill-warn">Aangeboden als vervanger</span>;
  }

  const needsVerification = Boolean(
    notReadyReason && /verificat|geverifieerd/i.test(notReadyReason),
  );

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Neem klus over
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
      </div>
      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4"
            onClick={() => !busy && setOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-bold text-ink">Deze klus overnemen</h2>
              <p className="mt-1 text-sm text-neutralx-600">
                De ingeplande kracht zoekt een vervanger. Meld je aan — diegene kiest wie het
                overneemt. Pas dan wordt de klus (met modelovereenkomst) van jou.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="field-input mt-3"
                placeholder="Kort bericht (optioneel) — waarom jij een goede match bent."
              />
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1">
                  {busy ? "Versturen…" : "Meld me aan"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="btn-ghost"
                >
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
