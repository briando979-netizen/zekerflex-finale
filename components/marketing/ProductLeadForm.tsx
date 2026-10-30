"use client";

import { useState } from "react";
import { ALL_PRODUCTS } from "@/lib/products";

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";

// Product-bewuste lead-capture: landt via /api/partner-lead in de sales-pijplijn.
// `defaultProduct` is een product-slug die vooraf geselecteerd wordt (op de
// losse productpagina's); op de hub laat je 'm leeg zodat de bezoeker kiest.
export function ProductLeadForm({ defaultProduct = "" }: { defaultProduct?: string }) {
  const [product, setProduct] = useState<string>(defaultProduct);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", message: "", consent: false });
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
      const res = await fetch("/api/partner-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(product ? { product } : {}),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
          consent: true,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
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
    <div id="aanvraag" className="rounded-2xl border border-hair bg-white p-6 md:p-8 scroll-mt-24">
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
              <label className={lbl} htmlFor="plf-name">Naam</label>
              <input id="plf-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div>
              <label className={lbl} htmlFor="plf-company">Bedrijf</label>
              <input id="plf-company" className={inp} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoComplete="organization" />
            </div>
            <div>
              <label className={lbl} htmlFor="plf-email">E-mail</label>
              <input id="plf-email" className={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </div>
            <div>
              <label className={lbl} htmlFor="plf-phone">Telefoon <span className="text-neutralx-400">(optioneel)</span></label>
              <input id="plf-phone" className={inp} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="plf-product">Welk product?</label>
              <select id="plf-product" className={inp} value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">— weet ik nog niet —</option>
                {ALL_PRODUCTS.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="plf-message">Bericht <span className="text-neutralx-400">(optioneel)</span></label>
              <textarea id="plf-message" className={inp} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Vertel kort wat je zoekt (doelgroep, koppeling met bestaand systeem, zelf hosten…)" />
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
  );
}
