"use client";

import { useEffect, useState } from "react";

const DEFAULT_PRIMARY = "#0E5C4A";
const DEFAULT_MINT = "#4FE0A0";

export function BrandingEditor() {
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [mint, setMint] = useState(DEFAULT_MINT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/branding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.branding) {
          setPrimary(d.branding.primaryHex);
          setMint(d.branding.mintHex);
        }
      })
      .catch(() => undefined);
  }, []);

  const save = async (p = primary, m = mint) => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryHex: p, mintHex: m }),
      });
      setSaved(r.ok);
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setPrimary(DEFAULT_PRIMARY);
    setMint(DEFAULT_MINT);
    void save(DEFAULT_PRIMARY, DEFAULT_MINT);
  };

  const panel = { background: "var(--a-elev)", border: "1px solid var(--a-border)" };
  const text = { color: "var(--a-text)" };
  const mute = { color: "var(--a-mute)" };

  return (
    <div className="rounded-xl p-4" style={panel}>
      <p className="mb-1 text-sm font-semibold" style={text}>Merkkleuren</p>
      <p className="mb-4 text-xs" style={mute}>
        Pas de primaire kleur en het accent (mint) aan. De tinten worden automatisch afgeleid. Wijzigingen gelden
        site-breed na opslaan + herladen. Standaardwaarden geven exact de huidige look.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <ColorRow label="Primaire kleur" value={primary} onChange={setPrimary} />
        <ColorRow label="Accent (mint)" value={mint} onChange={setMint} />
      </div>

      {/* preview */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: primary }}>
          Voorbeeldknop
        </span>
        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: mint, color: "#0C0E12" }}>
          Accent
        </span>
        <span className="h-8 w-28 rounded-lg" style={{ background: `linear-gradient(90deg, ${primary}, ${mint})` }} aria-hidden />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => save()} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--a-accent, #0E5C4A)" }}>
          {saving ? "Opslaan…" : "Kleuren opslaan"}
        </button>
        <button type="button" onClick={reset} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}>
          Herstel standaard
        </button>
        {saved && (
          <button type="button" onClick={() => window.location.reload()} className="text-xs font-semibold hover:underline" style={{ color: "#34d399" }}>
            Opgeslagen — herlaad om de nieuwe kleuren overal te zien ↻
          </button>
        )}
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs" style={{ color: "var(--a-mute)" }}>{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded-lg px-2.5 py-1.5 font-mono text-sm uppercase"
          style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
        />
      </span>
    </label>
  );
}
