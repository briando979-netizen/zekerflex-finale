"use client";

import { useEffect, useState } from "react";
import { SAVED_EVENT, deviceStore, readSaved, toggleSaved } from "@/lib/shifts/bewaard";

/**
 * Per-device "bewaard" toggle on a shift card. Lightweight; no server state.
 * The klussen feed shows the saved ones under "Bewaard" (MarketplaceView).
 */
export function SaveShiftHeart({
  shiftId,
  labels = { save: "Bewaar deze klus", unsave: "Verwijder uit bewaard" },
}: {
  shiftId: string;
  /** from the freelancer dictionary (card.save / card.unsave); Dutch by default */
  labels?: { save: string; unsave: string };
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = () => setSaved(readSaved(deviceStore()).has(shiftId));
    load();
    window.addEventListener(SAVED_EVENT, load);
    return () => window.removeEventListener(SAVED_EVENT, load);
  }, [shiftId]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSaved(deviceStore(), shiftId).has(shiftId));
    window.dispatchEvent(new Event(SAVED_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? labels.unsave : labels.save}
      className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition hover:scale-110"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} className={saved ? "text-crit" : "text-neutralx-500"}>
        <path
          d="M12 20s-7-4.4-9.2-8.5C1.3 8.7 2.8 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.2 0 4.7 3.2 3.2 6C19 15.6 12 20 12 20Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
