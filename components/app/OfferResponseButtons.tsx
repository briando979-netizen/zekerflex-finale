"use client";

import { useState, useTransition } from "react";
import { respondToOfferAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { useToast } from "@/components/ui/Toast";

export function OfferResponseButtons({ offerId }: { offerId: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | "accepted" | "declined">(null);

  if (done) {
    return (
      <span className={done === "accepted" ? "pill-ok" : "pill-crit"}>
        {done === "accepted" ? "Geaccepteerd" : "Afgewezen"}
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await respondToOfferAction(offerId, "declined");
            if (r.ok) {
              setDone("declined");
              toast.info(r.message);
            } else toast.error(r.message);
          })
        }
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        Afwijzen
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await respondToOfferAction(offerId, "accepted");
            if (r.ok) {
              setDone("accepted");
              toast.success(r.message);
            } else toast.error(r.message);
          })
        }
        className="btn-primary px-3 py-1.5 text-xs"
      >
        Accepteren
      </button>
    </div>
  );
}
