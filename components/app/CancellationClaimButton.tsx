"use client";

import { useEffect, useState } from "react";
import { Portal } from "@/components/chat/Portal";

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export function CancellationClaimButton({ shiftId, shiftTitle }: { shiftId: string; shiftTitle: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ status: string; claimedCents?: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/claims", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const mine = (d.claims ?? []).find((c: { shiftId: string }) => c.shiftId === shiftId);
        if (mine) setState({ status: mine.status, claimedCents: mine.claimedCents });
      })
      .catch(() => undefined);
  }, [shiftId]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/me/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, reason }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Indienen mislukt");
      setState({ status: j.claim.status, claimedCents: j.claim.claimedCents });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state) {
    const label =
      state.status === "approved"
        ? `Claim goedgekeurd — ${state.claimedCents ? euro(state.claimedCents) : "50%"} volgt`
        : state.status === "rejected"
          ? "Claim afgewezen"
          : "Claim ingediend — wacht op opdrachtgever";
    return <span className="text-xs font-medium text-neutralx-500">{label}</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white">
        50% claimen
      </button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-lg font-bold text-ink">Vergoeding claimen</h2>
              <p className="mt-1 text-sm text-neutralx-600">
                De opdrachtgever heeft “{shiftTitle}” geannuleerd nadat jij was ingepland. Je kunt 50% van de klus claimen.
                De opdrachtgever beoordeelt je claim.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="field-input mt-3"
                placeholder="Toelichting (optioneel) — bijv. dat je andere klussen hebt afgezegd."
              />
              {err && <p className="mt-1 text-xs text-crit">{err}</p>}
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1">
                  {busy ? "Indienen…" : "Claim indienen"}
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
