"use client";

import { useCallback, useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";

interface MyReview {
  rating: number;
  text: string;
  at: string;
}

/**
 * On a finished klus: shows the review the freelancer wrote about this
 * opdrachtgever (readable back). Writing a review only happens in the
 * "uren indienen" flow, so there is no write button here — nothing renders
 * until a review exists.
 */
export function CompanyReviewInline({
  tenantId,
  shiftId,
}: {
  tenantId: string;
  shiftId: string;
}) {
  const t = useFT().los.review;
  const [mine, setMine] = useState<MyReview | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/reviews?type=company&id=${encodeURIComponent(tenantId)}&shiftId=${encodeURIComponent(shiftId)}&mine=1`,
        { cache: "no-store" },
      );
      if (!r.ok) return setMine(null);
      const d = await r.json();
      setMine(d.mine ?? null);
    } catch {
      setMine(null);
    }
  }, [tenantId, shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!mine) return null;

  return (
    <div className="rounded-lg border border-hair bg-paper-soft/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-500" aria-label={vulIn(t.sterren, { n: mine.rating })}>
          {"★★★★★".slice(0, mine.rating)}
          <span className="text-neutralx-400">{"★★★★★".slice(mine.rating)}</span>
        </span>
        <span className="text-[11px] font-medium text-neutralx-400">{t.jouw}</span>
      </div>
      {mine.text ? (
        <p className="mt-1.5 text-sm leading-relaxed text-neutralx-700">“{mine.text}”</p>
      ) : (
        <p className="mt-1.5 text-xs text-neutralx-400">{t.alleenCijfer}</p>
      )}
    </div>
  );
}
