"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string | null;
  dresscode: string | null;
}

export function TemplatesBoard({ minRateCents = 1620 }: { minRateCents?: number }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [rateEuro, setRateEuro] = useState((minRateCents / 100).toFixed(2));
  const [breakMin, setBreakMin] = useState("30");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/werkgever/templates", { cache: "no-store" });
    if (res.ok) setTemplates((await res.json()).templates);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetForm() {
    setLabel("");
    setRateEuro((minRateCents / 100).toFixed(2));
    setBreakMin("30");
    setDescription("");
    setAdding(false);
    setErr(null);
  }

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          hourlyRateCents: Math.round(parseFloat(rateEuro || "0") * 100),
          breakMinutes: Number(breakMin) || 0,
          description: description || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Opslaan mislukt");
      resetForm();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Deze template verwijderen?")) return;
    const res = await fetch(`/api/werkgever/templates/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <div className="space-y-4">
      {!templates ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-neutralx-500">Nog geen eigen templates aangemaakt.</p>
      ) : (
        <div className="divide-y divide-hair rounded-xl border border-hair">
          {templates.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{t.label}</p>
                <p className="mt-0.5 text-xs text-neutralx-500">
                  € {(t.hourlyRateCents / 100).toFixed(2).replace(".", ",")}/u · {t.breakMinutes}m pauze
                </p>
                {t.description && <p className="mt-1 text-xs text-neutralx-400">{t.description}</p>}
              </div>
              <button type="button" onClick={() => remove(t.id)} className="text-[11px] font-medium text-neutralx-500 hover:text-crit">
                Verwijderen
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost text-sm">
          + Template toevoegen
        </button>
      ) : (
        <div className="rounded-xl border border-hair p-4">
          <div className="space-y-3">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Naam (bijv. 'Ochtenddienst filiaal Rotterdam')" className="field-input w-full" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="field-label">Uurtarief (€)</span>
                <input type="number" step="0.10" min={minRateCents / 100} value={rateEuro} onChange={(e) => setRateEuro(e.target.value)} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Pauze (min)</span>
                <input type="number" min={0} max={240} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field-input" />
              </label>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Omschrijving (optioneel)" rows={2} className="field-input w-full" />
            {err && <p className="text-sm text-crit">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={create} disabled={busy || !label} className="btn-primary text-sm disabled:opacity-50">
                {busy ? "Bezig…" : "Opslaan"}
              </button>
              <button type="button" onClick={resetForm} className="btn-ghost text-sm">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
