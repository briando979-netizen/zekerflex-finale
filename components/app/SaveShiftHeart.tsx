"use client";

import { useEffect, useState } from "react";

const KEY = "zf-saved-shifts";

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Per-device "bewaard" toggle on a shift card. Lightweight; no server state. */
export function SaveShiftHeart({ shiftId }: { shiftId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(read().has(shiftId));
  }, [shiftId]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const set = read();
    if (set.has(shiftId)) set.delete(shiftId);
    else set.add(shiftId);
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
      /* ignore */
    }
    setSaved(set.has(shiftId));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Verwijder uit bewaard" : "Bewaar deze klus"}
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
