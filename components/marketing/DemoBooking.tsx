"use client";

import { useMemo, useState } from "react";
import { DEMO_TIME_SLOTS, formatDemoDate, isSelectableDemoDate } from "@/lib/demo/slots";

type Step = "date" | "time" | "info" | "done";

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DemoBooking() {
  const now = useMemo(() => new Date(), []);
  const minMonth = useMemo(() => startOfMonth(now), [now]);
  const maxMonth = useMemo(() => {
    const m = startOfMonth(now);
    m.setMonth(m.getMonth() + 2);
    return m;
  }, [now]);

  const [view, setView] = useState<Date>(minMonth);
  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", phone: "", note: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ id: string; when: string } | null>(null);

  const cells = useMemo(() => {
    const first = startOfMonth(view);
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      out.push(iso(new Date(view.getFullYear(), view.getMonth(), day)));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const canPrev = startOfMonth(view) > minMonth;
  const canNext = startOfMonth(view) < maxMonth;

  function pickDate(d: string) {
    setDate(d);
    setTime(null);
    setStep("time");
  }

  async function submit() {
    if (!consent) {
      setErr("Zet het vinkje voor akkoord om te bevestigen.");
      return;
    }
    if (!date || !time) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, date, time, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error?.message ?? "Verzenden mislukt. Probeer het later opnieuw.");
        return;
      }
      setResult({ id: data.id, when: data.when });
      setStep("done");
    } catch {
      setErr("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-e2">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-hair bg-paper-soft px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">ZF</span>
        <div>
          <p className="text-sm font-semibold text-ink">Plan een demo met ZekerFlex</p>
          <p className="text-xs text-neutralx-500">30 minuten · online · vrijblijvend</p>
        </div>
      </div>

      <div className="p-6">
        {step === "date" && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => canPrev && setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                disabled={!canPrev}
                aria-label="Vorige maand"
                className="grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft disabled:opacity-30"
              >
                ‹
              </button>
              <p className="font-semibold text-ink">
                {MONTHS[view.getMonth()]} {view.getFullYear()}
              </p>
              <button
                type="button"
                onClick={() => canNext && setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                disabled={!canNext}
                aria-label="Volgende maand"
                className="grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft disabled:opacity-30"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-neutralx-400">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (!c) return <div key={i} />;
                const day = Number(c.slice(-2));
                const ok = isSelectableDemoDate(c);
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={!ok}
                    onClick={() => pickDate(c)}
                    className={`aspect-square rounded-lg text-sm transition-colors ${
                      ok
                        ? "font-medium text-ink hover:bg-brand-500 hover:text-white"
                        : "cursor-default text-neutralx-300"
                    } ${date === c ? "bg-brand-500 text-white" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-neutralx-500">Kies een werkdag. We bevestigen je afspraak per e-mail.</p>
          </>
        )}

        {step === "time" && date && (
          <>
            <button
              type="button"
              onClick={() => setStep("date")}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            >
              ‹ {formatDemoDate(date)}
            </button>
            <p className="text-sm font-semibold text-ink">Kies een tijd</p>
            <p className="text-xs text-neutralx-500">Tijden in de Nederlandse tijdzone (CET/CEST).</p>
            <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {DEMO_TIME_SLOTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTime(t);
                    setStep("info");
                  }}
                  className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                    time === t
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-hairstrong text-ink hover:border-brand-500 hover:text-brand-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "info" && date && time && (
          <>
            <button
              type="button"
              onClick={() => setStep("time")}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            >
              ‹ {formatDemoDate(date)} om {time}
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink">Voornaam *</span>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-ink">Achternaam *</span>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink">Zakelijk e-mailadres *</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink">Bedrijfsnaam *</span>
                <input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-ink">Telefoon</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink">Waar wil je het vooral over hebben? (optioneel)</span>
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-4 flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-500"
              />
              <span className="text-xs leading-relaxed text-neutralx-600">
                Ik ga akkoord dat ZekerFlex mijn gegevens gebruikt om deze demo in te plannen. Zie de{" "}
                <a href="/privacy" className="underline hover:text-ink">
                  privacy policy
                </a>
                .
              </span>
            </label>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !form.firstName || !form.lastName || !form.email || !form.company}
              className="btn-primary mt-4 w-full disabled:opacity-60"
            >
              {busy ? "Versturen…" : "Demo aanvragen"}
            </button>
          </>
        )}

        {step === "done" && result && (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mintwash">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 13l4 4L19 7" stroke="#0A4B3C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-ink">Aanvraag ontvangen</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Je voorkeur staat genoteerd voor
              <br />
              <strong className="text-ink">{result.when}</strong>.
            </p>
            <p className="mt-2 text-sm text-neutralx-600">
              We bevestigen de afspraak binnen één werkdag per e-mail, met een videolink.
            </p>
            <a
              href={`/api/demo/${result.id}/ics`}
              className="btn-ghost mt-5 inline-block text-sm"
            >
              Zet in je agenda
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
