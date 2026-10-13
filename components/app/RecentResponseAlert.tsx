"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface RecentResponse {
  id: string;
  type: "direct_accept" | "counter_offer";
  freelancerUserId: string;
  freelancerName: string;
  shiftId: string;
  shiftTitle: string;
  at: string;
  proposedRateCents?: number;
  listedRateCents?: number;
}

const POLL_MS = 6000;

// A real-time, must-dismiss card the moment a freelancer responds to a shift
// (direct accept or a new counter-offer) — previously entirely passive: the
// only feedback was the notification bell, and even that silently dropped
// offer responses (lib/notifications/feed.ts's dead offersForUser("__none__")
// stub). Polls like the existing incoming-call alert in ChatDock/InboxPage.
export function RecentResponseAlert() {
  const [queue, setQueue] = useState<RecentResponse[]>([]);
  const sinceRef = useRef<string>(new Date().toISOString());
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/werkgever/recent-responses?since=${encodeURIComponent(sinceRef.current)}`, {
          cache: "no-store",
        });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { responses: RecentResponse[]; now: string };
        sinceRef.current = d.now;
        const fresh = d.responses.filter((x) => !seenRef.current.has(x.id));
        if (fresh.length > 0) {
          for (const x of fresh) seenRef.current.add(x.id);
          setQueue((q) => [...q, ...fresh]);
        }
      } catch {
        /* ignore — next poll tries again */
      }
    };
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0]!;
  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-scale-in rounded-2xl bg-white p-6 text-center shadow-lift">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-mint text-2xl">
          {current.type === "direct_accept" ? "🎉" : "💬"}
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-ink">{current.freelancerName}</h2>
        <p className="mt-1.5 text-sm text-neutralx-600">
          {current.type === "direct_accept" ? (
            <>heeft <strong>{current.shiftTitle}</strong> aangenomen.</>
          ) : (
            <>
              biedt <strong>€ {((current.proposedRateCents ?? 0) / 100).toFixed(2)}/u</strong> voor{" "}
              <strong>{current.shiftTitle}</strong>
              {current.listedRateCents ? ` (was € ${(current.listedRateCents / 100).toFixed(2)}/u)` : ""}.
            </>
          )}
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={dismiss} className="btn-ghost flex-1 text-sm">
            Sluiten
          </button>
          <Link href={`/werkgever/diensten/${current.shiftId}`} onClick={dismiss} className="btn-primary flex-1 text-sm">
            Bekijk klus
          </Link>
        </div>
        {queue.length > 1 && (
          <p className="mt-3 text-xs text-neutralx-400">+{queue.length - 1} meer wachten</p>
        )}
      </div>
    </div>
  );
}
