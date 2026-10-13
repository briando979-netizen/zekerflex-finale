"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { publishShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

export function PublishPoolShiftButton({ shiftId, poolName }: { shiftId: string; poolName: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function publish() {
    start(async () => {
      const res = await publishShiftAction(shiftId);
      if (res.ok) {
        toast.success(res.message);
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Privé uitgenodigd: pool &ldquo;{poolName}&rdquo;</p>
        <p className="text-xs text-neutralx-500">
          Alleen deze pool ziet en kan reageren op deze dienst, totdat je &apos;m op de open markt zet.
        </p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-xs" disabled={pending}>
            Annuleer
          </button>
          <button type="button" onClick={publish} className="btn-primary text-xs" disabled={pending}>
            {pending ? "Bezig…" : "Bevestig"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-primary flex-shrink-0 text-xs">
          Zet op de open markt
        </button>
      )}
    </div>
  );
}
