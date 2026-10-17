"use client";

import { useRef, useState } from "react";

export interface CardRow {
  id: string;
  stripeCardId: string;
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: string;
}

interface StripeElement {
  mount(el: HTMLElement): void;
  destroy(): void;
}
interface StripeJs {
  createEphemeralKeyNonce(o: { issuingCard: string }): Promise<{ nonce?: string; error?: { message: string } }>;
  elements(): { create(type: string, o: Record<string, unknown>): StripeElement };
}
declare global {
  interface Window {
    Stripe?: (pk: string) => StripeJs;
  }
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const price = (c: number) => (c === 0 ? "gratis" : `eenmalig ${euro(c)}`);
const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "actief", cls: "bg-ok/10 text-ok" },
  inactive: { label: "bevroren / nog niet geactiveerd", cls: "bg-warn/10 text-warn" },
  canceled: { label: "opgezegd", cls: "bg-paper-soft text-neutralx-500" },
};

let stripeLoad: Promise<void> | null = null;
function loadStripeJs(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  stripeLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve();
    s.onerror = () => {
      stripeLoad = null;
      reject(new Error("Stripe.js laden mislukt"));
    };
    document.head.appendChild(s);
  });
  return stripeLoad;
}

export function BankCards(props: {
  cards: CardRow[];
  fees: { cardVirtualCents: number; cardPhysicalCents: number };
  canManage: boolean;
  frozen: boolean;
  balanceCents: number;
  holderName: string;
  publishableKey: string | null;
  onChanged: (note: { ok: boolean; text: string }) => void | Promise<void>;
}) {
  const { cards, fees, canManage, frozen, balanceCents, publishableKey, onChanged } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const mounted = useRef<StripeElement[]>([]);
  const [form, setForm] = useState(() => {
    const [first = "", ...rest] = props.holderName.split(" ");
    return { type: "virtual" as "virtual" | "physical", firstName: first, lastName: rest.join(" "), dob: "", phone: "", line1: "", postalCode: "", city: "", acceptTerms: false };
  });
  const fee = form.type === "physical" ? fees.cardPhysicalCents : fees.cardVirtualCents;
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function request() {
    setBusy(true);
    const res = await fetch("/api/me/bank/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, country: "NL", requestKey: crypto.randomUUID() }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      return onChanged({ ok: false, text: d?.error?.message ?? "Pas aanvragen lukte niet." });
    }
    setOpen(false);
    await onChanged({
      ok: true,
      text: form.type === "physical" ? "Fysieke pas aangevraagd — hij wordt naar je adres gestuurd. Activeer hem hier zodra hij binnen is." : "Virtuele pas klaar — direct te gebruiken voor online betalingen.",
    });
  }

  async function status(card: CardRow, next: "active" | "inactive" | "canceled") {
    if (next === "canceled" && !window.confirm(`Pas …${card.last4} definitief opzeggen? Dit kan niet ongedaan worden.`)) return;
    setBusy(true);
    const res = await fetch(`/api/me/bank/cards/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    await onChanged(res?.ok ? { ok: true, text: next === "active" ? "Pas actief." : next === "inactive" ? "Pas bevroren — betalingen worden geweigerd." : "Pas opgezegd." } : { ok: false, text: d?.error?.message ?? "Wijzigen lukte niet." });
  }

  async function reveal(card: CardRow) {
    mounted.current.forEach((m) => m.destroy());
    mounted.current = [];
    if (revealed === card.id) return setRevealed(null);
    if (!publishableKey) return onChanged({ ok: false, text: "Pasgegevens tonen is nog niet ingesteld (STRIPE_PUBLISHABLE_KEY ontbreekt)." });
    try {
      await loadStripeJs();
      const stripe = window.Stripe!(publishableKey);
      const { nonce, error } = await stripe.createEphemeralKeyNonce({ issuingCard: card.stripeCardId });
      if (!nonce) throw new Error(error?.message ?? "geen nonce");
      const res = await fetch(`/api/me/bank/cards/${card.id}/key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "geen sleutel");
      setRevealed(card.id);
      const elements = stripe.elements();
      const style = { base: { fontSize: "16px", fontFamily: "ui-monospace, monospace", color: "#ffffff" } };
      requestAnimationFrame(() => {
        for (const [type, id] of [
          ["issuingCardNumberDisplay", "zf-card-number"],
          ["issuingCardExpiryDisplay", "zf-card-expiry"],
          ["issuingCardCvcDisplay", "zf-card-cvc"],
        ] as const) {
          const el = document.getElementById(id);
          if (!el) continue;
          const e = elements.create(type, { issuingCard: card.stripeCardId, nonce, ephemeralKeySecret: d.secret, style });
          e.mount(el);
          mounted.current.push(e);
        }
      });
    } catch (err) {
      await onChanged({ ok: false, text: `Pasgegevens tonen lukte niet: ${(err as Error).message}` });
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <span className="text-sm font-semibold">Betaalpassen</span>
        {canManage && !frozen && (
          <button type="button" onClick={() => setOpen(!open)} className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
            {open ? "Annuleren" : "+ Pas aanvragen"}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-b border-hair bg-paper-soft/50 p-5">
          <div className="flex flex-wrap gap-2">
            {(["virtual", "physical"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`rounded-xl border px-4 py-2.5 text-left text-sm ${form.type === t ? "border-brand-500 bg-white" : "border-hairstrong"}`}>
                <span className="block font-semibold text-ink">{t === "virtual" ? "Virtuele pas" : "Fysieke pas"}</span>
                <span className="block text-xs text-neutralx-500">
                  {t === "virtual" ? "Direct klaar, online + Apple/Google Pay" : "Per post, ook voor de kassa"} · {price(t === "virtual" ? fees.cardVirtualCents : fees.cardPhysicalCents)}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.firstName} onChange={set("firstName")} placeholder="Voornaam" className={field} />
            <input value={form.lastName} onChange={set("lastName")} placeholder="Achternaam" className={field} />
            <label className="text-xs text-neutralx-500">
              Geboortedatum
              <input type="date" value={form.dob} onChange={set("dob")} className={field} />
            </label>
            <label className="text-xs text-neutralx-500">
              Mobiel nummer (voor beveiligde online betalingen)
              <input value={form.phone} onChange={set("phone")} placeholder="+31 6 …" className={field} />
            </label>
            <input value={form.line1} onChange={set("line1")} placeholder="Straat en huisnummer" className={`${field} sm:col-span-2`} />
            <input value={form.postalCode} onChange={set("postalCode")} placeholder="Postcode" className={field} />
            <input value={form.city} onChange={set("city")} placeholder="Plaats" className={field} />
          </div>
          <label className="flex items-start gap-2 text-xs text-neutralx-600">
            <input type="checkbox" checked={form.acceptTerms} onChange={set("acceptTerms")} className="mt-0.5" />
            <span>
              Ik ga akkoord met de pasvoorwaarden en de{" "}
              <a href="https://stripe.com/legal/issuing/celtic-authorized-user-terms" target="_blank" rel="noreferrer" className="underline">
                voorwaarden van de uitgever
              </a>
              {fee > 0 ? `, en dat de paskosten (${euro(fee)}) van mijn saldo worden afgeschreven` : ""}.
            </span>
          </label>
          <button
            type="button"
            onClick={request}
            disabled={busy || !form.acceptTerms || !form.firstName || !form.lastName || !form.dob || !form.line1 || !form.postalCode || !form.city || balanceCents < fee}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Bezig…" : balanceCents < fee ? `Waardeer eerst op (paskosten ${euro(fee)})` : fee === 0 ? "Gratis pas aanvragen" : `Pas aanvragen voor ${euro(fee)}`}
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen betaalpas. Elke betaling met de pas gaat direct van je ZekerFlex Bank-saldo af.</p>
      ) : (
        <ul className="grid gap-4 p-5 sm:grid-cols-2">
          {cards.map((c) => {
            const st = STATUS[c.status] ?? { label: c.status, cls: "bg-paper-soft text-neutralx-500" };
            return (
              <li key={c.id} className="space-y-3">
                <div className={`relative aspect-[1.586] rounded-2xl bg-gradient-to-br p-5 text-white shadow-lift ${c.status === "canceled" ? "from-neutral-500 to-neutral-700 opacity-60" : "from-[#0E5C4A] to-[#031a15]"}`}>
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">ZekerFlex Bank</span>
                    <span className="text-xs font-semibold uppercase text-white/70">{c.type === "physical" ? "fysiek" : "virtueel"}</span>
                  </div>
                  {revealed === c.id ? (
                    <div className="absolute inset-x-5 bottom-5 space-y-1">
                      <div id="zf-card-number" className="h-6" />
                      <div className="flex gap-6 text-xs text-white/70">
                        <span className="flex items-center gap-1">
                          geldig t/m <span id="zf-card-expiry" className="inline-block h-5 w-16" />
                        </span>
                        <span className="flex items-center gap-1">
                          CVC <span id="zf-card-cvc" className="inline-block h-5 w-10" />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-x-5 bottom-5">
                      <p className="font-mono text-lg tracking-widest">•••• •••• •••• {c.last4}</p>
                      <p className="mt-1 text-xs text-white/70">
                        {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)} · {c.brand}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
                  {canManage && c.status !== "canceled" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => reveal(c)} className="font-semibold text-brand-600 hover:underline">
                        {revealed === c.id ? "Verbergen" : "Toon gegevens"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => status(c, c.status === "active" ? "inactive" : "active")} className="font-semibold text-ink hover:underline">
                        {c.status === "active" ? "Bevriezen" : c.type === "physical" ? "Activeren / ontdooien" : "Ontdooien"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => status(c, "canceled")} className="text-neutralx-500 hover:text-crit hover:underline">
                        Opzeggen
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
