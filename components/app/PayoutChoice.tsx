"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// "Voorkeur voor uitbetaling" — the factoring speed choice, shown inline in the
// "uren indienen" flow right after the hours are submitted. Persists via PUT /api/me/payout.
// ---------------------------------------------------------------------------

type Speed = "instant" | "threeDay" | "standard";

const OPTIONS: { speed: Speed; badge?: string; body: string; factoring: boolean }[] = [
  {
    speed: "instant",
    badge: "Directe betaalopdracht 🚀",
    body:
      "ZekerFlex dient na goedkeuring direct een betaalopdracht in en neemt jouw vordering over " +
      "(4% vergoeding). Bij ZekerFlex Bank wordt het bedrag direct geboekt; bij een externe bank kan bijschrijving langer duren.",
    factoring: true,
  },
  {
    speed: "threeDay",
    body:
      "ZekerFlex neemt jouw vordering over en dient de betaalopdracht binnen 3 werkdagen na goedkeuring in " +
      "(2% vergoeding). De ontvangende bank kan daarna extra verwerkingstijd nodig hebben.",
    factoring: true,
  },
  {
    speed: "standard",
    body: "Wacht tot de opdrachtgever betaalt.",
    factoring: false,
  },
];

export function PayoutChoice({ initialSpeed = "standard" }: { initialSpeed?: Speed }) {
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function choose(next: Speed) {
    if (next === speed || saving) return;
    // Fast payout = assigning the claim to ZekerFlex: explicit consent first.
    const consent =
      next === "standard" ||
      window.confirm(
        "Bij snelle uitbetaling draag je je vordering op de opdrachtgever over aan ZekerFlex. ZekerFlex dient de betaalopdracht direct in (4% vergoeding) of binnen 3 werkdagen (2% vergoeding). De bankverwerking kan daarna langer duren.\n\nGa je akkoord met de voorwaarden voor snelle uitbetaling (zekerflex.com/voorwaarden/snelle-uitbetaling)?",
      );
    if (!consent) return;
    const prev = speed;
    setSpeed(next);
    setSaving(true);
    setErr("");
    try {
      const r = await fetch("/api/me/payout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed: next, ...(next !== "standard" ? { acceptTerms: true } : {}) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? "Opslaan mislukt — probeer het opnieuw.");
      }
    } catch (e) {
      setSpeed(prev);
      setErr((e as Error).message || "Opslaan mislukt — probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-bold text-ink">Voorkeur voor uitbetaling</h3>
        <span
          className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-neutralx-400 text-[10px] font-semibold text-neutralx-400"
          title="Kies je voor factoring, dan koopt ZekerFlex je factuur en betaalt direct uit — de fee wordt van je uitbetaling afgetrokken. Wachten op de opdrachtgever is gratis."
        >
          i
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {OPTIONS.map((o) => {
          const active = speed === o.speed;
          return (
            <button
              key={o.speed}
              type="button"
              onClick={() => choose(o.speed)}
              aria-pressed={active}
              className={`relative block w-full rounded-xl border-2 px-4 pb-4 text-left transition ${
                o.badge ? "pt-5" : "pt-4"
              } ${active ? "border-brand-500 bg-brand-50/40" : "border-hair hover:border-hairstrong"}`}
            >
              {o.badge && (
                <span className="absolute -top-3 left-3 rounded-md bg-brand-mint px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">
                  {o.badge}
                </span>
              )}
              <div className="flex gap-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 ${
                    active ? "border-brand-500" : "border-neutralx-400"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                </span>
                <div>
                  <p className="text-sm leading-relaxed text-neutralx-700">{o.body}</p>
                  {o.factoring && (
                    <p className="mt-1.5 text-xs leading-relaxed text-neutralx-400">
                      Door te kiezen voor factoring ga je akkoord met de{" "}
                      <a
                        href="/voorwaarden"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-neutralx-500 underline"
                      >
                        akte van koop en cessie
                      </a>
                      .
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {err ? (
        <p role="alert" className="mt-2 text-xs text-crit">{err}</p>
      ) : saving ? (
        <p className="mt-2 text-xs text-neutralx-400">Opslaan…</p>
      ) : (
        <p className="mt-2 text-xs text-neutralx-400">Je keuze is opgeslagen — je kunt hem later altijd wijzigen.</p>
      )}
    </div>
  );
}
