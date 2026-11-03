"use client";

import Link from "next/link";
import { useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { useToast } from "@/components/ui/Toast";
import type { FollowedEmployer } from "@/lib/worker/follows";

export function FollowedEmployersList({ initial }: { initial: FollowedEmployer[] }) {
  const t = useFT().follow;
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const unfollow = async (e: FollowedEmployer) => {
    setBusy(e.tenantId);
    try {
      const r = await fetch("/api/me/volgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: e.tenantId, follow: false }),
      });
      if (!r.ok) {
        toast.error(t.failed);
        return;
      }
      setList((all) => all.filter((x) => x.tenantId !== e.tenantId));
    } finally {
      setBusy(null);
    }
  };

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-hair bg-white px-5 py-12 text-center shadow-card">
        <p className="text-4xl" aria-hidden>🤍</p>
        <p className="mt-3 font-medium text-ink">{t.emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">{t.emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
      {list.map((e) => (
        <li key={e.tenantId} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <span aria-hidden>❤️</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{e.name}</p>
            <p className="text-xs text-neutralx-500">{t.openShifts(e.openShifts)}</p>
          </div>
          {e.openShifts > 0 && (
            <Link href={`/dashboard/klussen?employer=${encodeURIComponent(e.name)}`} className="text-xs font-semibold text-brand-600 hover:underline">
              {t.seeShifts}
            </Link>
          )}
          <button
            type="button"
            onClick={() => void unfollow(e)}
            disabled={busy === e.tenantId}
            className="text-xs font-medium text-neutralx-500 hover:text-crit disabled:opacity-50"
          >
            {t.unfollow}
          </button>
        </li>
      ))}
    </ul>
  );
}
