"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every `seconds` while the tab is visible, plus a manual refresh. */
export function AutoRefresh({ seconds = 60, fetchedAt }: { seconds?: number; fetchedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(new Date(fetchedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [fetchedAt]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <div className="flex items-center gap-3 text-xs text-neutralx-500">
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${pending ? "animate-pulse bg-warn" : "bg-ok"}`} aria-hidden />
        {pending ? "Bijwerken…" : label ? `Bijgewerkt om ${label}` : "Live"}
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="rounded-lg border border-hairstrong px-2.5 py-1 font-semibold text-ink hover:bg-paper-soft disabled:opacity-50"
      >
        Vernieuwen
      </button>
    </div>
  );
}
