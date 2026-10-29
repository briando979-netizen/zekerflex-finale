"use client";

import { useRef, useState } from "react";
import { PARTNER_PLANS } from "@/lib/partner-plans";

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";

export function PartnerPlans() {
  const [planId, setPlanId] = useState<string>("");
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", message: "", consent: false });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const formRef = useRef<HTMLDivElement>(null);

  function choose(id: string) {
    setPlanId(id);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit() {
    if (status === "sending") return;
    if (!form.consent) {
      setError("Zet het vinkje voor akkoord.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/partner-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(planId ? { planId } : {}),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
          consent: true,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(d?.error?.message ?? "Versturen mislukt. Probeer het later opnieuw.");
      }
    } catch {
      setStatus("error");
      setError("Netwerkfout. Probeer het later opnieuw.");
    }
  }

  return (
    <div>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PARTNER_PLANS.map((p) => (
          <div key={p.id} className={`flex flex-col rounded-2xl border bg-white p-6 ${p.featured ? "border-brand-500 shadow-card" : "border-hair"}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold text-ink">{p.name}</h3>
              {p.featured && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">Populair</span>}
            </div>
            <p className="mt-1 text-sm text-neutralx-600">{p.tagline}</p>
            <p className="mt-4 font-display text-lg font-bold text-ink">{p.priceLabel}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-neutralx-700">
              {p.features.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => choose(p.id)} className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-semibold ${p.featured ? "btn-primary" : "btn-ghost border border-hairstrong"}`}>
              {p.ctaLabel}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-neutralx-400">Bedragen zijn indicatieve startprijzen; de definitieve prijs stemmen we af op omvang en modules.</p>

      <div ref={formRef} className="mt-10 rounded-2xl border border-hair bg-white p-6 md:p-8">
        {status === "done" ? (
          <div className="text-center">
            <p className="font-display text-xl font-bold text-ink">Bedankt — we nemen contact op</p>
            <p className="mt-2 text-sm text-neutralx-600">Je aanvraag staat genoteerd. We reageren doorgaans binnen één werkdag.</p>
          </div>
        ) : (
          <>
            <h3 className="font-display text-xl font-bold text-ink">Vraag het aan</h3>
            <p className="mt-1 text-sm text-neutralx-600">Laat je gegevens achter, dan nemen we contact op met een voorstel op maat.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Naam</label>
                <input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </div>
              <div>
                <label className={lbl}>Bedrijf</label>
                <input className={inp} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoComplete="organization" />
              </div>
              <div>
                <label className={lbl}>E-mail</label>
                <input className={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
              </div>
              <div>
                <label className={lbl}>Telefoon <span className="text-neutralx-400">(optioneel)</span></label>
                <input className={inp} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Pakket</label>
                <select className={inp} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">— weet ik nog niet —</option>
                  {PARTNER_PLANS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Bericht <span className="text-neutralx-400">(optioneel)</span></label>
                <textarea className={inp} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Vertel kort wat je zoekt (aantal vestigingen, modules, zelf hosten…)" />
              </div>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-neutralx-600">
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
              <span>Ik ga akkoord dat ZekerFlex contact met me opneemt over deze aanvraag.</span>
            </label>
            {error && <p className="mt-2 text-sm text-crit" role="alert">{error}</p>}
            <button type="button" onClick={() => void submit()} disabled={status === "sending"} className="btn-primary mt-4 disabled:opacity-50">
              {status === "sending" ? "Versturen…" : "Aanvraag versturen"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
