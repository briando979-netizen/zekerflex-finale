"use client";

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// "Uren invullen" as a short guided flow instead of one long form:
//   1. Heb je deze klus gewerkt?  ja → verder · nee → reden doorgeven
//   2. Kloppen deze uren?        ja → verder · nee → aanpassen
//   3. Extra kosten declareren?  (optioneel, alleen als vooraf afgesproken)
//   4. Beoordeel de opdrachtgever (sterren + optionele tekst)
//   5. Hoe en hoe snel uitbetalen (niet voor payroll)
//   6. Overzicht → indienen (review wordt na het indienen opgeslagen)
// ---------------------------------------------------------------------------

type Speed = "instant" | "threeDay" | "standard";
type Step = "worked" | "notWorked" | "hours" | "extra" | "review" | "payout" | "confirm";

function localValue(date: Date | string) {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const hhmm = (v: string) => new Date(v).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SPEEDS: { speed: Speed; title: string; body: string }[] = [
  { speed: "instant", title: "Binnen 1 minuut 🚀", body: "Direct na goedkeuring. ZekerFlex neemt je vordering over voor 4% minder dan je factuurbedrag." },
  { speed: "threeDay", title: "Binnen 3 werkdagen", body: "ZekerFlex neemt je vordering over voor 2% minder dan je factuurbedrag." },
  { speed: "standard", title: "Gratis — als de opdrachtgever betaalt", body: "Je ontvangt het volledige bedrag zodra de opdrachtgever betaalt." },
];

const NOT_WORKED: { id: string; label: string }[] = [
  { id: "client_cancelled", label: "De opdrachtgever heeft afgezegd" },
  { id: "no_show_client", label: "Ter plekke was er geen werk / niemand aanwezig" },
  { id: "sick", label: "Ik was ziek of kon niet" },
  { id: "other", label: "Andere reden" },
];

export function TimesheetSubmitForm({
  timesheetId,
  scheduledStart,
  scheduledEnd,
  breakMinutes,
  status,
  clientId,
  clientName,
  shiftId,
  payoutSpeed = "standard",
  payroll = false,
  hourlyRateCents = 0,
  gpsBacked = false,
  earningsToBank = false,
  fastPay = false,
  termsAccepted = false,
}: {
  timesheetId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  breakMinutes: number;
  status: string;
  clientId: string;
  clientName: string;
  shiftId?: string;
  payoutSpeed?: Speed;
  payroll?: boolean;
  hourlyRateCents?: number;
  /** start/end come from GPS check-in/out */
  gpsBacked?: boolean;
  earningsToBank?: boolean;
  /** this client offers 1-minute / 3-day payout (credit-checked) */
  fastPay?: boolean;
  /** the worker already accepted the overdrachtsvoorwaarden */
  termsAccepted?: boolean;
}) {
  const [step, setStep] = useState<Step>("worked");
  const [start, setStart] = useState(localValue(scheduledStart));
  const [end, setEnd] = useState(localValue(scheduledEnd));
  const [breaks, setBreaks] = useState(String(breakMinutes));
  const [editHours, setEditHours] = useState(false);
  const [note, setNote] = useState("");
  const [extraOn, setExtraOn] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [speed, setSpeed] = useState<Speed>(fastPay ? payoutSpeed : "standard");
  const [terms, setTerms] = useState(termsAccepted);
  const [toBank, setToBank] = useState(earningsToBank);
  const [notWorkedReason, setNotWorkedReason] = useState("");
  const [notWorkedNote, setNotWorkedNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "submitted" | "notWorked">(status !== "DRAFT" ? "submitted" : null);
  const [error, setError] = useState("");

  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000) - (Number(breaks) || 0));
  const extraCents = extraOn ? Math.round(Number(extraAmount.replace(",", ".")) * 100) || 0 : 0;
  const grossCents = Math.round((minutes / 60) * hourlyRateCents);
  const order: Step[] = ["worked", "hours", "extra", "review", ...(payroll ? [] : (["payout"] as Step[])), "confirm"];
  const idx = order.indexOf(step);
  const next = () => setStep(order[Math.min(order.length - 1, idx + 1)]!);
  const back = () => setStep(order[Math.max(0, idx - 1)]!);

  function validHours(): string | null {
    if (new Date(end) <= new Date(start)) return "De eindtijd moet na de begintijd liggen.";
    if (minutes <= 0) return "Na aftrek van de pauze blijft er geen werktijd over.";
    if (minutes > 16 * 60) return "Meer dan 16 uur op één dag — controleer je tijden.";
    return null;
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!payroll) {
        const pr = await fetch("/api/me/payout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speed, ...(speed !== "standard" && terms && !termsAccepted ? { acceptTerms: true } : {}) }) });
        if (!pr.ok) {
          const d = await pr.json().catch(() => ({}));
          throw new Error(d?.error?.message ?? "Uitbetaalkeuze opslaan lukte niet.");
        }
        if (toBank !== earningsToBank) {
          await fetch("/api/me/bank/payout-destination", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: toBank ? "bank" : "iban" }) }).catch(() => undefined);
        }
      }
      const response = await fetch(`/api/timesheets/${timesheetId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStart: new Date(start).toISOString(),
          actualEnd: new Date(end).toISOString(),
          breakMinutes: Number(breaks) || 0,
          ...(note ? { note } : {}),
          ...(extraCents > 0 ? { extraCostsCents: extraCents, extraCostsNote: extraNote.trim() } : {}),
        }),
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(d?.error?.message ?? "Indienen lukte niet.");
      if (rating > 0) {
        await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectType: "company", subjectId: clientId, rating, text: reviewText, ...(shiftId ? { shiftId } : {}) }),
        }).catch(() => undefined);
      }
      setDone("submitted");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reportNotWorked() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/timesheets/${timesheetId}/not-worked`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: notWorkedReason, note: notWorkedNote }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(d?.error?.message ?? "Doorgeven lukte niet.");
    setDone("notWorked");
  }

  if (done === "notWorked") {
    return (
      <section className="surface p-5">
        <p className="eyebrow">Doorgegeven</p>
        <h2 className="mt-2 font-display text-xl font-bold">Bedankt, we pakken het op</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutralx-600">ZekerFlex handelt dit af met {clientName}. Je hoort van ons als er iets geregeld moet worden (bijvoorbeeld een annuleringsvergoeding).</p>
        <Link href="/dashboard/diensten" className="btn-primary mt-5 w-full">
          Naar mijn klussen
        </Link>
      </section>
    );
  }

  if (done === "submitted") {
    return (
      <section className="surface p-5">
        <p className="eyebrow">Ingediend ✓</p>
        <h2 className="mt-2 font-display text-xl font-bold">Je uren zijn verstuurd</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
          {payroll
            ? `${clientName} keurt je uren goed; daarna krijg je binnen 1 minuut een voorschot en volgt de rest op je loonstrook.`
            : `${clientName} keurt je uren goed. Daarna betalen we uit ${speed === "instant" ? "binnen 1 minuut" : speed === "threeDay" ? "binnen 3 werkdagen" : "zodra de opdrachtgever betaalt"}${toBank ? " op je ZekerFlex Bank" : " op je IBAN"}.`}
        </p>
        <div className="mt-6 space-y-2">
          <Link href={payroll ? "/dashboard/verloning" : "/dashboard/uitbetalingen"} className="btn-ghost w-full">
            {payroll ? "Bekijk je loonstroken" : "Uitbetalingen & voorschot"}
          </Link>
          <Link href="/dashboard/diensten" className="btn-primary w-full">
            Naar mijn klussen
          </Link>
        </div>
      </section>
    );
  }

  const field = "field-input";
  const yesNo = (yes: () => void, no: () => void, yesLabel = "Ja", noLabel = "Nee") => (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button type="button" onClick={no} className="rounded-xl border border-hairstrong py-3 text-base font-semibold text-ink hover:bg-paper-soft">
        {noLabel}
      </button>
      <button type="button" onClick={yes} className="rounded-xl bg-brand-500 py-3 text-base font-semibold text-white">
        {yesLabel}
      </button>
    </div>
  );

  return (
    <section className="surface p-5">
      {/* progress */}
      {step !== "notWorked" && (
        <div className="mb-4 flex gap-1" aria-hidden>
          {order.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-brand-500" : "bg-paper-soft"}`} />
          ))}
        </div>
      )}

      {step === "worked" && (
        <>
          <p className="eyebrow">Stap 1</p>
          <h2 className="mt-2 font-display text-xl font-bold">Heb je deze klus gewerkt?</h2>
          <p className="mt-2 text-sm text-neutralx-600">Bij {clientName}.</p>
          {yesNo(next, () => setStep("notWorked"), "Ja, gewerkt", "Nee")}
        </>
      )}

      {step === "notWorked" && (
        <>
          <p className="eyebrow">Niet gewerkt</p>
          <h2 className="mt-2 font-display text-xl font-bold">Wat is er gebeurd?</h2>
          <div className="mt-4 space-y-2">
            {NOT_WORKED.map((r) => (
              <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${notWorkedReason === r.id ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
                <input type="radio" name="nw" checked={notWorkedReason === r.id} onChange={() => setNotWorkedReason(r.id)} className="accent-brand-500" />
                {r.label}
              </label>
            ))}
          </div>
          <textarea className={`${field} mt-3`} rows={3} maxLength={500} value={notWorkedNote} onChange={(e) => setNotWorkedNote(e.target.value)} placeholder="Toelichting (optioneel)" />
          {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setStep("worked")} className="rounded-xl border border-hairstrong py-3 font-semibold">
              Terug
            </button>
            <button type="button" disabled={!notWorkedReason || busy} onClick={reportNotWorked} className="btn-primary disabled:opacity-50">
              {busy ? "Versturen…" : "Doorgeven"}
            </button>
          </div>
        </>
      )}

      {step === "hours" && (
        <>
          <p className="eyebrow">Stap 2</p>
          <h2 className="mt-2 font-display text-xl font-bold">Kloppen deze uren?</h2>
          <div className="mt-4 rounded-xl bg-paper-soft p-4 text-sm">
            <p className="flex justify-between gap-3">
              <span className="text-neutralx-500">Begin</span>
              <span className="font-semibold">{hhmm(start)}</span>
            </p>
            <p className="mt-1 flex justify-between gap-3">
              <span className="text-neutralx-500">Einde</span>
              <span className="font-semibold">{hhmm(end)}</span>
            </p>
            <p className="mt-1 flex justify-between gap-3">
              <span className="text-neutralx-500">Pauze</span>
              <span className="font-semibold">{breaks || 0} min</span>
            </p>
            <p className="mt-2 flex justify-between gap-3 border-t border-hair pt-2">
              <span className="text-neutralx-500">Gewerkt</span>
              <span className="font-semibold">
                {Math.floor(minutes / 60)}u {minutes % 60}m{hourlyRateCents ? ` · ${euro(grossCents)} bruto` : ""}
              </span>
            </p>
            {gpsBacked && <p className="mt-2 text-xs text-ok">📍 Onderbouwd met je in- en uitcheck op locatie.</p>}
          </div>
          {!editHours ? (
            yesNo(
              () => {
                const e = validHours();
                if (e) return setError(e);
                setError("");
                next();
              },
              () => setEditHours(true),
              "Ja, klopt",
              "Nee, aanpassen",
            )
          ) : (
            <div className="mt-4 space-y-3">
              <label className="field-label">
                Begintijd
                <input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="field-label">
                Eindtijd
                <input type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <label className="field-label">
                Pauze in minuten
                <input type="number" min="0" max="240" className={field} value={breaks} onChange={(e) => setBreaks(e.target.value)} />
              </label>
              <label className="field-label">
                Waarom wijkt het af? <span className="font-normal text-neutralx-400">(voor de opdrachtgever)</span>
                <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bijvoorbeeld: een half uur langer gebleven op verzoek van de teamleider" />
              </label>
              {error && <p className="text-sm text-crit">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  const e = validHours();
                  if (e) return setError(e);
                  setError("");
                  next();
                }}
                className="btn-primary w-full"
              >
                Verder
              </button>
            </div>
          )}
          {error && !editHours && <p className="mt-2 text-sm text-crit">{error}</p>}
        </>
      )}

      {step === "extra" && (
        <>
          <p className="eyebrow">Stap 3</p>
          <h2 className="mt-2 font-display text-xl font-bold">Extra kosten declareren?</h2>
          <p className="mt-2 text-sm text-neutralx-600">Bijvoorbeeld parkeren, reiskosten of materiaal — alleen als je dit vooraf met {clientName} hebt afgesproken.</p>
          {!extraOn ? (
            yesNo(() => setExtraOn(true), next, "Ja, declareren", "Nee")
          ) : (
            <div className="mt-4 space-y-3">
              <label className="field-label">
                Bedrag incl. btw
                <input inputMode="decimal" className={field} value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0,00" />
              </label>
              <label className="field-label">
                Waarvoor?
                <textarea className={field} rows={2} maxLength={300} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Bijvoorbeeld: parkeerkosten" />
              </label>
              {error && <p className="text-sm text-crit">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setExtraOn(false);
                    setError("");
                    next();
                  }}
                  className="rounded-xl border border-hairstrong py-3 font-semibold"
                >
                  Toch niet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (extraCents <= 0) return setError("Vul een geldig bedrag in.");
                    if (!extraNote.trim()) return setError("Beschrijf waar de kosten voor zijn.");
                    setError("");
                    next();
                  }}
                  className="btn-primary"
                >
                  Verder
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === "review" && (
        <>
          <p className="eyebrow">Stap 4</p>
          <h2 className="mt-2 font-display text-xl font-bold">Hoe was het bij {clientName}?</h2>
          <div className="mt-4 flex justify-center gap-2 text-4xl">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} className={n <= rating ? "text-amber-500" : "text-neutralx-300"} aria-label={`${n} sterren`}>
                ★
              </button>
            ))}
          </div>
          {rating > 0 && <textarea className={`${field} mt-3`} rows={2} maxLength={500} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Wat ging goed of kan beter? (optioneel)" />}
          <p className="mt-2 text-center text-xs text-neutralx-500">Je beoordeling helpt andere freelancers. Daarna kan het niet meer voor deze klus.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={next} className="rounded-xl border border-hairstrong py-3 font-semibold">
              Overslaan
            </button>
            <button type="button" disabled={rating === 0} onClick={next} className="btn-primary disabled:opacity-50">
              Verder
            </button>
          </div>
        </>
      )}

      {step === "payout" && (
        <>
          <p className="eyebrow">Stap 5</p>
          <h2 className="mt-2 font-display text-xl font-bold">Hoe snel wil je je geld?</h2>
          {!fastPay && (
            <p className="mt-3 rounded-xl bg-paper-soft px-3 py-2 text-xs text-neutralx-600">
              {clientName} biedt geen snelle uitbetaling aan — bij deze klus ontvang je je geld zodra de opdrachtgever betaalt.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {SPEEDS.map((o) => {
              const locked = o.speed !== "standard" && !fastPay;
              return (
                <label key={o.speed} className={`flex gap-3 rounded-xl border px-4 py-3 ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${speed === o.speed ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
                  <input type="radio" name="speed" disabled={locked} checked={speed === o.speed} onChange={() => setSpeed(o.speed)} className="mt-1 accent-brand-500" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {o.title}
                      {locked && <span className="ml-1 text-xs font-normal text-neutralx-400">— niet bij deze opdrachtgever</span>}
                    </span>
                    <span className="block text-xs leading-relaxed text-neutralx-500">{o.body}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {speed !== "standard" && !termsAccepted && (
            <label className="mt-3 flex items-start gap-2 rounded-xl border border-hair bg-paper-soft/60 p-3 text-xs text-neutralx-700">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-brand-500" />
              <span>
                Ik ga akkoord met de <a href="/voorwaarden/snelle-uitbetaling" target="_blank" className="font-semibold underline">voorwaarden voor snelle uitbetaling</a>: ik draag mijn vordering op de opdrachtgever over aan ZekerFlex, dat mij het factuurbedrag min de vergoeding uitbetaalt. Dit geldt voor de klussen waarbij ik voor snelle uitbetaling kies.
              </span>
            </label>
          )}
          <p className="mt-4 text-sm font-semibold text-ink">Waarheen?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setToBank(true)} className={`rounded-xl border px-3 py-3 text-left text-sm ${toBank ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
              <span className="block font-semibold">🏦 ZekerFlex Bank</span>
              <span className="block text-xs text-neutralx-500">Direct op je rekening</span>
            </button>
            <button type="button" onClick={() => setToBank(false)} className={`rounded-xl border px-3 py-3 text-left text-sm ${!toBank ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
              <span className="block font-semibold">Eigen IBAN</span>
              <span className="block text-xs text-neutralx-500">Via een bankoverschrijving</span>
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={back} className="rounded-xl border border-hairstrong py-3 font-semibold">
              Terug
            </button>
            <button type="button" disabled={speed !== "standard" && !termsAccepted && !terms} onClick={next} className="btn-primary disabled:opacity-50">
              Verder
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="eyebrow">Laatste stap</p>
          <h2 className="mt-2 font-display text-xl font-bold">Controleer en dien in</h2>
          <dl className="mt-4 divide-y divide-hair rounded-xl border border-hair text-sm">
            <Row label="Gewerkt" value={`${hhmm(start)} – ${new Date(end).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}, ${breaks || 0} min pauze`} />
            <Row label="Uren" value={`${Math.floor(minutes / 60)}u ${minutes % 60}m${hourlyRateCents ? ` · ${euro(grossCents)} bruto` : ""}`} />
            {extraCents > 0 && <Row label="Extra kosten" value={`${euro(extraCents)} — ${extraNote}`} />}
            <Row label="Beoordeling" value={rating ? "★".repeat(rating) : "overgeslagen"} />
            {!payroll && <Row label="Uitbetaling" value={`${SPEEDS.find((s) => s.speed === speed)!.title} · ${toBank ? "ZekerFlex Bank" : "eigen IBAN"}`} />}
          </dl>
          {error && <p className="mt-3 text-sm text-crit">{error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={back} className="rounded-xl border border-hairstrong py-3 font-semibold">
              Terug
            </button>
            <button type="button" disabled={busy} onClick={submit} className="btn-primary disabled:opacity-60">
              {busy ? "Indienen…" : "Uren indienen"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-neutralx-500">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
