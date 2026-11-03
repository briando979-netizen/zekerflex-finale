"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { parseWilReageren, WIL_REAGEREN_KEY, type WilReageren } from "@/lib/worker/wil-reageren";

// On Ontdekken: the klus a new worker wanted on the public site before signing
// up (components/marketing/ReageerKnop.tsx). Opening it or dismissing it forgets it.
export function WilReagerenNudge() {
  const t = useFT().intent;
  const [klus, setKlus] = useState<WilReageren | null>(null);

  useEffect(() => {
    try {
      setKlus(parseWilReageren(localStorage.getItem(WIL_REAGEREN_KEY)));
    } catch {
      /* storage blocked: nothing to show */
    }
  }, []);

  function forget() {
    try {
      localStorage.removeItem(WIL_REAGEREN_KEY);
    } catch {
      /* ignore */
    }
    setKlus(null);
  }

  if (!klus) return null;
  return (
    <div role="status" className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-neutralx-700">
        <p className="font-semibold text-ink">{t.title}</p>
        <p className="mt-0.5">{t.body(klus.title)}</p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
        <Link href={`/dashboard/klussen/${klus.id}`} onClick={forget} className="btn-primary">
          {t.open}
        </Link>
        <button type="button" onClick={forget} className="text-sm font-semibold text-neutralx-600 underline hover:text-ink">
          {t.dismiss}
        </button>
      </div>
    </div>
  );
}
