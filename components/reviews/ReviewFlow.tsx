"use client";

import { useEffect, useRef, useState } from "react";
import { LOW_SCORE } from "@/lib/review-requests/shared";

// ---------------------------------------------------------------------------
// The customer's side of a review request (/review/<token>). After the stars,
// BOTH options are offered for every score, side by side: a public review on
// Google and a private message to the company. A low score only opens the
// message form straight away; the Google button stays just as visible.
// ---------------------------------------------------------------------------

const LABELS = ["Slecht", "Matig", "Redelijk", "Goed", "Uitstekend"];

export function ReviewFlow({ token, bedrijf, voornaam, hasGoogle, initialRating, feedbackSent }: { token: string; bedrijf: string; voornaam: string; hasGoogle: boolean; initialRating: number | null; feedbackSent: boolean }) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(initialRating !== null && initialRating <= LOW_SCORE);
  const [tekst, setTekst] = useState("");
  const [sent, setSent] = useState(feedbackSent);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void fetch(`/api/review/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "geopend" }), keepalive: true }).catch(() => undefined);
  }, [token]);

  async function post(payload: object): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/review/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
      return false;
    }
    return true;
  }

  async function choose(n: number) {
    if (await post({ action: "sterren", rating: n })) {
      setRating(n);
      if (n <= LOW_SCORE) setOpen(true);
    }
  }

  async function sendFeedback() {
    if (await post({ action: "feedback", tekst })) setSent(true);
  }

  const shown = hover ?? rating;
  return (
    <div className="card p-6 sm:p-8">
      <p className="text-sm text-neutralx-500">{voornaam ? `Hoi ${voornaam},` : "Hoi,"}</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">Hoe was je ervaring met {bedrijf}?</h1>

      <div role="radiogroup" aria-label="Kies 1 tot 5 sterren" className="mt-6 flex items-center gap-1" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "ster" : "sterren"}: ${LABELS[n - 1]}`}
            disabled={busy}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => void choose(n)}
            className="grid h-12 w-12 place-items-center rounded-full text-4xl leading-none transition hover:scale-110 disabled:opacity-60"
            style={{ color: shown !== null && n <= shown ? "#F2A900" : "#D5D9DE" }}
          >
            ★
          </button>
        ))}
        <span className="ml-3 text-sm font-medium text-neutralx-600" aria-live="polite">
          {shown !== null ? LABELS[shown - 1] : ""}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
          {error}
        </p>
      )}

      {rating !== null && (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-neutralx-600">Dank je wel! Je kiest zelf wat je ermee doet: een review op Google is openbaar, een bericht aan {bedrijf} niet.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {hasGoogle && (
              <a href={`/api/review/${token}/naar-google`} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-12 justify-center text-center">
                Deel je ervaring op Google
              </a>
            )}
            {!sent && (
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn-ghost min-h-12 justify-center">
                Stuur {bedrijf} een bericht
              </button>
            )}
          </div>
          {sent ? (
            <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
              {bedrijf} heeft je bericht ontvangen. Bedankt dat je de moeite nam.
            </p>
          ) : (
            open && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink" htmlFor="review-tekst">
                  {rating <= LOW_SCORE ? `Wat kan ${bedrijf} beter doen?` : `Wil je ${bedrijf} nog iets laten weten?`}
                </label>
                <textarea id="review-tekst" className="field-input min-h-[120px]" maxLength={3000} value={tekst} onChange={(e) => setTekst(e.target.value)} />
                <button type="button" disabled={busy || tekst.trim().length < 3} onClick={() => void sendFeedback()} className="btn-primary disabled:opacity-50">
                  {busy ? "Versturen…" : "Verstuur bericht"}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
