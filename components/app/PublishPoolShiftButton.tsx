"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { publishShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

export function PublishPoolShiftButton({ shiftId, poolName }: { shiftId: string; poolName: string }) {
  const toast = useToast();
  const router = useRouter();
  const k = useT().poolPubliceer;
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
    <div className="flex items-center gap-2 rounded-xl border border-hair bg-brand-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{fmt(k.kop, { naam: poolName })}</p>
        <p className="text-xs text-neutralx-500">
          {k.uitleg}
        </p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-xs" disabled={pending}>
            {k.annuleer}
          </button>
          <button type="button" onClick={publish} className="btn-primary text-xs" disabled={pending}>
            {pending ? k.bezig : k.bevestig}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-primary flex-shrink-0 text-xs">
          {k.openMarkt}
        </button>
      )}
    </div>
  );
}
