"use client";

import { useState } from "react";

export function UitzendbureauContactForm() {
  const [form, setForm] = useState({ contactName: "", company: "", email: "", phone: "", headcount: "", sector: "", note: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!consent) {
      setErr("Zet het vinkje voor akkoord om te bevestigen.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/uitzendbureau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error?.message ?? "Verzenden mislukt. Probeer het later opnieuw.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6 text-center shadow-e2">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mintwash">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="#0A4B3C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="mt-4 font-display text-lg font-bold text-ink">Aanvraag ontvangen</h3>
        <p className="mt-1.5 text-sm text-neutralx-600">We nemen binnen één werkdag contact met je op.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-e2">
      <div className="border-b border-hair bg-paper-soft px-6 py-4">
        <p className="text-sm font-semibold text-ink">Uitzendkrachten inhuren via ZekerFlex</p>
        <p className="text-xs text-neutralx-500">Wij zijn de formele werkgever — jij regelt de bezetting.</p>
      </div>
      <div className="p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink">Contactpersoon *</span>
            <input
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink">Bedrijfsnaam *</span>
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink">Zakelijk e-mailadres *</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink">Aantal medewerkers nodig</span>
            <input
              value={form.headcount}
              onChange={(e) => setForm({ ...form, headcount: e.target.value })}
              placeholder="Bijv. 3-5"
              className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink">Sector</span>
            <input
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
              placeholder="Bijv. logistiek, horeca"
              className="mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-semibold text-ink">Toelichting (optioneel)</span>
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
            Ik ga akkoord dat ZekerFlex mijn gegevens gebruikt om contact op te nemen. Zie de{" "}
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
          disabled={busy || !form.contactName || !form.company || !form.email}
          className="btn-primary mt-4 w-full disabled:opacity-60"
        >
          {busy ? "Versturen…" : "Aanvraag versturen"}
        </button>
      </div>
    </div>
  );
}
