"use client";

import { useEffect, useState } from "react";

interface Entry {
  host: string;
  tenantId: string;
  brand: { name: string; primaryColor: string; logoUrl: string };
}

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";
const emptyEntry = (): Entry => ({ host: "", tenantId: "", brand: { name: "", primaryColor: "#0E5C4A", logoUrl: "" } });

export function TenancyBoard() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testHost, setTestHost] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/tenancy", { cache: "no-store" });
      if (res.ok) setEntries(((await res.json()) as { entries: Entry[] }).entries);
      else setEntries([]);
    })();
  }, []);

  function patch(i: number, up: Partial<Entry> | { brand: Partial<Entry["brand"]> }) {
    setEntries((list) =>
      (list ?? []).map((e, j) => {
        if (j !== i) return e;
        if ("brand" in up && up.brand) return { ...e, brand: { ...e.brand, ...up.brand } };
        return { ...e, ...(up as Partial<Entry>) };
      }),
    );
  }

  async function save() {
    if (!entries) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tenancy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
      setMsg(res.ok ? "Opgeslagen." : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTestResult(null);
    const res = await fetch(`/api/tenancy/resolve?host=${encodeURIComponent(testHost)}`, { cache: "no-store" });
    const d = (await res.json().catch(() => ({}))) as { matched?: boolean; tenantId?: string; brand?: { name?: string } };
    setTestResult(d.matched ? `→ tenant ${d.tenantId} (${d.brand?.name ?? "—"})` : "→ geen klant gekoppeld (standaard ZekerFlex-merk)");
  }

  if (!entries) return <div className="h-40 animate-pulse rounded-2xl bg-paper-soft" />;

  return (
    <div className="space-y-6">
      <div className="card space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Klant-omgevingen (white-label)</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            Koppel een host (subdomein of eigen domein van de klant) aan hun tenant + merk. Gebruik <code>*.jouwplatform.nl</code> als
            wildcard voor alle subdomeinen. De tenant-id is een bestaande organisatie (child van jouw reseller-tenant).
          </p>
        </div>
        <div className="space-y-3">
          {entries.map((e, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-hairstrong p-3 sm:grid-cols-[1.3fr_1fr_1.3fr_0.8fr_1fr_auto]">
              <div><label className={lbl}>Host</label><input className={inp} value={e.host} onChange={(ev) => patch(i, { host: ev.target.value })} placeholder="klant1.jouwplatform.nl" /></div>
              <div><label className={lbl}>Tenant-id</label><input className={inp} value={e.tenantId} onChange={(ev) => patch(i, { tenantId: ev.target.value })} placeholder="cl_…" /></div>
              <div><label className={lbl}>Merknaam</label><input className={inp} value={e.brand.name} onChange={(ev) => patch(i, { brand: { name: ev.target.value } })} placeholder="Klant BV" /></div>
              <div><label className={lbl}>Kleur</label><input className={inp} type="color" value={e.brand.primaryColor} onChange={(ev) => patch(i, { brand: { primaryColor: ev.target.value } })} /></div>
              <div><label className={lbl}>Logo-URL</label><input className={inp} value={e.brand.logoUrl} onChange={(ev) => patch(i, { brand: { logoUrl: ev.target.value } })} placeholder="https://…/logo.svg" /></div>
              <button type="button" onClick={() => setEntries(entries.filter((_, j) => j !== i))} className="btn-ghost self-end text-xs text-crit">×</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setEntries([...entries, emptyEntry()])} className="btn-ghost text-xs">+ klant koppelen</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? "Opslaan…" : "Opslaan"}</button>
          {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
        </div>
      </div>

      <div className="card space-y-2 p-5">
        <p className="text-sm font-semibold text-ink">Test een host</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inp} max-w-xs`} value={testHost} onChange={(e) => setTestHost(e.target.value)} placeholder="klant1.jouwplatform.nl" />
          <button type="button" onClick={() => void test()} className="btn-ghost text-sm">Resolve</button>
          {testResult && <span className="text-sm text-neutralx-600">{testResult}</span>}
        </div>
      </div>
    </div>
  );
}
