"use client";

import { useState } from "react";

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";

// Aanmeldformulier voor sales-partners (ZZP, commissie) -> /api/sales-partner.
export function SalesPartnerForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", region: "", experience: "", motivation: "", consent: false });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");

  async function submit() {
    if (status === "sending") return;
    if (!form.consent) {
      setError("Zet het vinkje voor akkoord.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/sales-partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.region.trim() ? { region: form.region.trim() } : {}),
          ...(form.experience.trim() ? { experience: form.experience.trim() } : {}),
          ...(form.motivation.trim() ? { motivation: form.motivation.trim() } : {}),
          consent: true,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (res.ok) setStatus("done");
      else {
        setStatus("error");
        setError(d?.error?.message ?? "Versturen mislukt. Probeer het later opnieuw.");
      }
    } catch {
      setStatus("error");
      setError("Netwerkfout. Probeer het later opnieuw.");
    }
  }

  return (
    <div id="aanmelden" className="rounded-2xl border border-hair bg-white p-6 md:p-8 scroll-mt-24">
      {status === "done" ? (
        <div className="text-center">
          <p className="font-display text-xl font-bold text-ink">Bedankt — we nemen contact op</p>
          <p className="mt-2 text-sm text-neutralx-600">Je aanmelding staat genoteerd. We bellen of mailen je doorgaans binnen één werkdag om je op weg te helpen.</p>
        </div>
      ) : (
        <>
          <h3 className="font-display text-xl font-bold text-ink">Meld je aan als sales-partner</h3>
          <p className="mt-1 text-sm text-neutralx-600">Geen vaste uren, geen target — je verdient uit resultaat. Laat je gegevens achter.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="sp-name">Naam</label>
              <input id="sp-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div>
              <label className={lbl} htmlFor="sp-email">E-mail</label>
              <input id="sp-email" className={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </div>
            <div>
              <label className={lbl} htmlFor="sp-phone">Telefoon <span className="text-neutralx-400">(optioneel)</span></label>
              <input id="sp-phone" className={inp} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
            </div>
            <div>
              <label className={lbl} htmlFor="sp-region">Regio <span className="text-neutralx-400">(optioneel)</span></label>
              <input id="sp-region" className={inp} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="bv. Groningen, Randstad…" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="sp-exp">Ervaring met sales / je netwerk <span className="text-neutralx-400">(optioneel)</span></label>
              <input id="sp-exp" className={inp} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="bv. horeca-ondernemers in mijn regio, 3 jaar accountmanagement…" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="sp-motivation">Motivatie <span className="text-neutralx-400">(optioneel)</span></label>
              <textarea id="sp-motivation" className={inp} rows={3} value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} placeholder="Vertel kort waarom je dit wilt doen." />
            </div>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-neutralx-600">
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
            <span>Ik ga akkoord dat ZekerFlex contact met me opneemt over deze aanmelding.</span>
          </label>
          {error && <p className="mt-2 text-sm text-crit" role="alert">{error}</p>}
          <button type="button" onClick={() => void submit()} disabled={status === "sending"} className="btn-primary mt-4 disabled:opacity-50">
            {status === "sending" ? "Versturen…" : "Aanmelding versturen"}
          </button>
        </>
      )}
    </div>
  );
}
