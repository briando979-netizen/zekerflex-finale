"use client";

import { useState } from "react";

interface Card {
  userId: string;
  name: string;
  avatarUrl: string | null;
  badge: string;
  area: string | null;
  reliabilityPct: number;
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
  avgRateCents: number | null;
  rating: { average: number; count: number };
  reviews: { rating: number; text: string; authorRole: string; at: string; shiftTitle?: string }[];
  skills: { name: string; rating: number; shiftsWorked: number }[];
  certificates: { label: string; expiresOn?: string }[];
  history: { title: string; city: string; company: string; monthLabel: string; rateCents: number }[];
}

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span className="inline-flex" aria-label={`${n} van 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" className={i <= full ? "text-amber-400" : "text-neutralx-300"}>
          <path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export function CandidateCardButton({ userId, shiftId, name }: { userId: string; shiftId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = async () => {
    setOpen(true);
    if (card || state === "loading") return;
    setState("loading");
    try {
      const r = await fetch(`/api/werkgever/kandidaat?userId=${encodeURIComponent(userId)}&shiftId=${encodeURIComponent(shiftId)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setCard(d.card);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-medium text-neutralx-700 hover:border-brand-400"
      >
        Bekijk profiel
      </button>

      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Profiel</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten" className="grid h-8 w-8 place-items-center rounded-full bg-neutralx-100 text-neutralx-600">✕</button>
            </div>

            {state === "loading" && <p className="py-8 text-center text-sm text-neutralx-500">Laden…</p>}
            {state === "error" && <p className="py-8 text-center text-sm text-crit">Kon dit profiel niet laden.</p>}

            {card && (
              <div className="space-y-5">
                {/* kop */}
                <div className="flex items-center gap-4">
                  {card.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                      {card.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">{card.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-neutralx-500">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">★ {card.badge}</span>
                      {card.area && <span>📍 omgeving {card.area}</span>}
                      {card.rating.count > 0 && (
                        <span className="inline-flex items-center gap-1"><Stars n={card.rating.average} /> {card.rating.average} ({card.rating.count})</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat value={`${card.reliabilityPct}%`} label="betrouwbaar" />
                  <Stat value={card.attendancePct !== null ? `${card.attendancePct}%` : "—"} label="opkomst" />
                  <Stat value={String(card.shiftsCompleted)} label="diensten" />
                  <Stat value={String(card.cancellations)} label="geannuleerd" tone={card.cancellations > 0 ? "warn" : "ok"} />
                </div>
                {card.avgRateCents !== null && (
                  <p className="text-center text-sm text-neutralx-600">
                    Gemiddeld tarief bij klussen: <strong className="text-ink">{euro(card.avgRateCents)}/u</strong>
                  </p>
                )}

                {/* skills + certs */}
                {(card.skills.length > 0 || card.certificates.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {card.skills.slice(0, 8).map((s) => (
                      <span key={s.name} className="rounded-full bg-neutralx-100 px-2.5 py-1 text-xs text-neutralx-700">
                        {s.name}{s.rating > 0 ? ` · ★${s.rating}` : ""}
                      </span>
                    ))}
                    {card.certificates.slice(0, 8).map((c, i) => (
                      <span key={`c-${i}`} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">✓ {c.label}</span>
                    ))}
                  </div>
                )}

                {/* werkverleden */}
                {card.history.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Werkverleden</h3>
                    <ul className="space-y-2">
                      {card.history.map((h, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-hair px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{h.title}</span>
                            <span className="block truncate text-xs text-neutralx-500">{h.company} · {h.city} · {h.monthLabel}</span>
                          </span>
                          <span className="num flex-shrink-0 text-xs text-neutralx-500">{euro(h.rateCents)}/u</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* reviews */}
                {card.reviews.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Beoordelingen</h3>
                    <div className="space-y-2">
                      {card.reviews.map((r, i) => (
                        <figure key={i} className="rounded-xl border border-hair p-3">
                          <Stars n={r.rating} />
                          <blockquote className="mt-1 text-sm text-neutralx-700">&ldquo;{r.text}&rdquo;</blockquote>
                          {r.shiftTitle && <figcaption className="mt-0.5 text-xs text-neutralx-400">{r.shiftTitle}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl bg-neutralx-50 py-2">
      <div className={`font-display text-base font-bold ${tone === "warn" ? "text-warn" : "text-brand-600"}`}>{value}</div>
      <div className="text-[10px] text-neutralx-500">{label}</div>
    </div>
  );
}
