"use client";

import { useCallback, useEffect, useState } from "react";

interface Code {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  minimumCents: number | null;
  firstTimeOnly: boolean;
  percentOff: number | null;
  amountOffCents: number | null;
}
interface Low {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
  sku: string;
  product: { id: string; name: string };
}

const eur = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** Webshopbeheer → Acties: discount codes (via Stripe), low stock, CSV export. */
export function ShopAdminTools() {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [low, setLow] = useState<Low[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ code: "", kind: "percent" as "percent" | "amount", value: "10", maxRedemptions: "", expiresAt: "", minimum: "", firstTimeOnly: false });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCodes = useCallback(async () => {
    const r = await fetch("/api/admin/shop/codes", { cache: "no-store" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setCodes(d.codes);
      setCodesError(null);
    } else setCodesError(d?.error?.message ?? "Kortingscodes konden niet worden geladen (is Stripe gekoppeld?).");
  }, []);
  const loadLow = useCallback(async () => {
    const r = await fetch(`/api/admin/shop/low-stock?threshold=${threshold}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setLow((await r.json()).variants);
  }, [threshold]);
  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);
  useEffect(() => {
    void loadLow();
  }, [loadLow]);

  async function createCode() {
    setBusy(true);
    setNote(null);
    const value = Number(form.value.replace(",", "."));
    const body = {
      code: form.code,
      ...(form.kind === "percent" ? { percentOff: value } : { amountOffCents: Math.round(value * 100) }),
      ...(form.maxRedemptions ? { maxRedemptions: Number(form.maxRedemptions) } : {}),
      ...(form.expiresAt ? { expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString() } : {}),
      ...(form.minimum ? { minimumCents: Math.round(Number(form.minimum.replace(",", ".")) * 100) } : {}),
      ...(form.firstTimeOnly ? { firstTimeOnly: true } : {}),
    };
    const r = await fetch("/api/admin/shop/codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setNote({ ok: false, text: d?.error?.message ?? "Aanmaken lukte niet." });
    setNote({ ok: true, text: `Code ${d.code.code} staat klaar — klanten vullen hem in bij het afrekenen.` });
    setForm({ ...form, code: "" });
    void loadCodes();
  }

  const input = "a-input";

  return (
    <div className="space-y-6">
      {note && <p className="a-panel p-3 text-sm" style={{ color: note.ok ? "var(--a-ok, #16a34a)" : "var(--a-crit, #dc2626)" }}>{note.text}</p>}

      <section className="a-panel space-y-4 p-6">
        <div>
          <p className="a-kicker">Promoties</p>
          <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: "var(--a-text)" }}>Kortingscodes</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--a-dim)" }}>Worden direct in Stripe aangemaakt: klanten vullen ze in bij het afrekenen. Geldigheid, maximaal gebruik en minimumbedrag bewaakt Stripe.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="a-label">
            Code
            <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="ZOMER15" />
          </label>
          <label className="a-label">
            Korting
            <span className="flex gap-2">
              <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "amount" })}>
                <option value="percent">%</option>
                <option value="amount">€</option>
              </select>
              <input className={input} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </span>
          </label>
          <label className="a-label">
            Max. aantal keer (leeg = onbeperkt)
            <input className={input} inputMode="numeric" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
          </label>
          <label className="a-label">
            Geldig tot (optioneel)
            <input className={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
          <label className="a-label">
            Minimaal bestelbedrag € (optioneel)
            <input className={input} inputMode="decimal" value={form.minimum} onChange={(e) => setForm({ ...form, minimum: e.target.value })} />
          </label>
          <label className="a-label flex items-center gap-2">
            <input type="checkbox" checked={form.firstTimeOnly} onChange={(e) => setForm({ ...form, firstTimeOnly: e.target.checked })} />
            Alleen voor eerste bestelling
          </label>
        </div>
        <button type="button" className="a-button a-button-primary" disabled={busy || form.code.length < 3 || !form.value} onClick={createCode}>
          Code aanmaken
        </button>
        {codesError ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>{codesError}</p>
        ) : !codes ? null : codes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen kortingscodes.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {codes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono font-semibold" style={{ color: "var(--a-text)" }}>{c.code}</span>
                <span className="a-tag">{c.percentOff ? `${c.percentOff}%` : c.amountOffCents ? eur(c.amountOffCents) : "?"}</span>
                <span style={{ color: "var(--a-dim)" }}>
                  {c.timesRedeemed}× gebruikt{c.maxRedemptions ? ` van ${c.maxRedemptions}` : ""}
                  {c.expiresAt ? ` · tot ${new Date(c.expiresAt).toLocaleDateString("nl-NL")}` : ""}
                  {c.minimumCents ? ` · vanaf ${eur(c.minimumCents)}` : ""}
                  {c.firstTimeOnly ? " · eerste bestelling" : ""}
                </span>
                <button
                  type="button"
                  className="a-button ml-auto"
                  onClick={async () => {
                    await fetch("/api/admin/shop/codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, active: !c.active }) });
                    void loadCodes();
                  }}
                >
                  {c.active ? "Uitzetten" : "Aanzetten"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="a-panel space-y-3 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <p className="a-kicker">Voorraad</p>
            <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: "var(--a-text)" }}>Bijna op ({low.length})</h2>
          </div>
          <label className="a-label">
            Drempel
            <input className="a-input w-20" type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} />
          </label>
        </div>
        {low.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Alles ruim op voorraad.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {low.map((v) => (
              <div key={v.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1" style={{ color: "var(--a-text)" }}>
                  {v.product.name}
                  {v.size ? ` — ${v.size}` : ""}
                  {v.color ? `, ${v.color}` : ""}
                </span>
                <span className="font-mono text-xs" style={{ color: "var(--a-mute)" }}>{v.sku}</span>
                <span className="a-tag" style={v.stock === 0 ? { color: "#dc2626" } : {}}>{v.stock === 0 ? "uitverkocht" : `${v.stock} over`}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="a-panel flex flex-wrap items-end gap-3 p-6">
        <div className="flex-1">
          <p className="a-kicker">Export</p>
          <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: "var(--a-text)" }}>Bestellingen per maand (CSV)</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--a-dim)" }}>Voor je boekhouding of verzendpartner — opent direct in Excel.</p>
        </div>
        <input className="a-input w-auto" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <a className="a-button a-button-primary" href={`/api/admin/shop/export?month=${month}`}>
          Download
        </a>
      </section>
    </div>
  );
}
