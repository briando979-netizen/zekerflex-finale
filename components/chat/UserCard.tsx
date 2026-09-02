"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { Portal } from "./Portal";

interface ReviewItem {
  id: string;
  authorName: string;
  authorRole: string;
  rating: number;
  text: string;
  shiftTitle?: string;
  at: string;
}
interface CardData {
  card: {
    userId: string;
    name: string;
    role: "freelancer" | "employer" | "admin";
    headline: string | null;
    avatarUrl: string | null;
    meta: string;
    freelancer?: {
      reliabilityPct: number;
      attendancePct: number | null;
      shiftsCompleted: number;
      badge: string;
      reviews: { average: number; count: number; recent: ReviewItem[] };
    };
    company?: {
      tenantId: string;
      name: string;
      websiteUrl: string | null;
      photoUrl: string | null;
      about: string | null;
      reviews: { average: number; count: number; recent: ReviewItem[] };
    };
  };
  statusNote: string | null;
  presence: { online: boolean; label: string } | null;
  saved: boolean;
  isSelf: boolean;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-500" aria-label={`${n} van 5`}>
      {"★★★★★".slice(0, Math.round(n))}
      <span className="text-neutralx-300">{"★★★★★".slice(Math.round(n))}</span>
    </span>
  );
}

export function UserCard({
  userId,
  onClose,
  onMessage,
  onCall,
}: {
  userId: string;
  onClose: () => void;
  onMessage?: (userId: string) => void;
  onCall?: (userId: string, mode: "audio" | "video") => void;
}) {
  const [data, setData] = useState<CardData | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/profile/${userId}/card`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CardData) => {
        setData(d);
        setSaved(d.saved);
      })
      .catch(() => setErr(true));
  }, [userId]);

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    if (next) {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, favourite: true }),
      });
    } else {
      await fetch(`/api/contacts?userId=${userId}`, { method: "DELETE" });
    }
  };

  const c = data?.card;
  const rev = c?.freelancer?.reviews ?? c?.company?.reviews ?? null;

  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {err && <p className="p-6 text-sm text-neutralx-500">Kon profiel niet laden.</p>}
        {c && (
          <>
            <div className="relative">
              {c.company?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.company.photoUrl} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="h-20 w-full bg-gradient-to-r from-brand-600 to-brand-500" />
              )}
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-lg"
                aria-label="Sluiten"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pb-5">
              <span className="-mt-9 block w-fit rounded-full ring-4 ring-white">
                <Avatar userId={c.userId} name={c.name} role={c.role} avatars={c.avatarUrl ? { [c.userId]: "1" } : {}} size={64} />
              </span>
              <p className="mt-2 font-display text-lg font-bold text-ink">{c.name}</p>
              <p className="text-xs text-neutralx-500">
                {c.meta}
                {data?.presence && (
                  <>
                    {" · "}
                    <span className={data.presence.online ? "text-ok" : ""}>
                      {data.presence.online ? "online" : data.presence.label}
                    </span>
                  </>
                )}
              </p>

              {(c.headline || data?.statusNote) && (
                <p className="mt-3 text-sm text-neutralx-600">{c.headline || data?.statusNote}</p>
              )}

              {/* freelancer stats */}
              {c.freelancer && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Betrouwbaar" value={`${c.freelancer.reliabilityPct}%`} />
                  <Metric
                    label="Opkomst"
                    value={c.freelancer.attendancePct != null ? `${c.freelancer.attendancePct}%` : "–"}
                  />
                  <Metric label="Diensten" value={String(c.freelancer.shiftsCompleted)} />
                </div>
              )}

              {c.company?.websiteUrl && (
                <a
                  href={c.company.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
                >
                  🌐 {c.company.websiteUrl.replace(/^https?:\/\//, "")}
                </a>
              )}
              {c.company?.about && <p className="mt-2 text-sm text-neutralx-600">{c.company.about}</p>}

              {/* actions */}
              {!data?.isSelf && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {onMessage && (
                    <button type="button" onClick={() => onMessage(c.userId)} className="btn-primary text-sm">
                      Bericht
                    </button>
                  )}
                  {onCall && c.role !== "admin" && (
                    <>
                      <button type="button" onClick={() => onCall(c.userId, "audio")} className="btn-ghost text-sm" aria-label="Bellen">
                        📞
                      </button>
                      <button type="button" onClick={() => onCall(c.userId, "video")} className="btn-ghost text-sm" aria-label="Videobellen">
                        📹
                      </button>
                    </>
                  )}
                  <button type="button" onClick={toggleSave} className="btn-ghost text-sm">
                    {saved ? "★ Opgeslagen" : "☆ Opslaan"}
                  </button>
                </div>
              )}

              {/* reviews */}
              {rev && rev.count > 0 && (
                <div className="mt-5 border-t border-hair pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Reviews</p>
                    <p className="text-sm">
                      <Stars n={rev.average} /> <span className="text-neutralx-500">{rev.average} ({rev.count})</span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-neutralx-400">Laatste 6 maanden</p>
                  <ul className="mt-3 space-y-3">
                    {rev.recent.slice(0, 5).map((r) => (
                      <li key={r.id} className="rounded-lg bg-paper-soft p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{r.authorName}</span>
                          <Stars n={r.rating} />
                        </div>
                        {r.text && <p className="mt-1 text-sm text-neutralx-600">{r.text}</p>}
                        {r.shiftTitle && <p className="mt-1 text-[11px] text-neutralx-400">{r.shiftTitle}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rev && rev.count === 0 && (
                <p className="mt-5 border-t border-hair pt-4 text-sm text-neutralx-400">Nog geen reviews.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper-soft py-2">
      <p className="num font-display text-lg font-bold text-ink">{value}</p>
      <p className="text-[11px] text-neutralx-500">{label}</p>
    </div>
  );
}
