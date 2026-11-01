"use client";

import { useEffect, useState } from "react";
import { count } from "@/lib/admin/format";
import { Empty, KpiStrip, Panel, Pill } from "@/components/admin/kit";

interface Entry {
  host: string;
  tenantId: string;
  brand: { name: string; primaryColor: string; logoUrl: string };
}

export interface TenantOption {
  id: string;
  name: string;
}

const emptyEntry = (): Entry => ({ host: "", tenantId: "", brand: { name: "", primaryColor: "#0E5C4A", logoUrl: "" } });

/** Hoe de omgeving van deze klant eruitziet: logo of naam op de eigen kleur. */
function BrandPreview({ brand, host }: { brand: Entry["brand"]; host: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--a-panel-2)" }}>
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-semibold text-white" style={{ background: brand.primaryColor || "#0E5C4A" }}>
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          (brand.name || "?").slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{brand.name || "Nog geen naam"}</span>
        <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{host || "Nog geen adres"}</span>
      </span>
    </div>
  );
}

export function TenancyBoard({ tenants }: { tenants: TenantOption[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
      setMsg(res.ok ? { ok: true, text: "Opgeslagen." } : { ok: false, text: "Opslaan mislukt. Controleer of elke klant een adres en tenant heeft." });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTestResult(null);
    const res = await fetch(`/api/tenancy/resolve?host=${encodeURIComponent(testHost)}`, { cache: "no-store" });
    const d = (await res.json().catch(() => ({}))) as { matched?: boolean; tenantId?: string; brand?: { name?: string } };
    setTestResult(d.matched ? `Hoort bij ${d.brand?.name ?? "—"} (${d.tenantId})` : "Geen klant gekoppeld: dit adres krijgt het standaard ZekerFlex-merk");
  }

  if (!entries) return <div className="a-panel h-40 animate-pulse" />;

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? null;
  const unknownTenants = entries.filter((e) => e.tenantId && !tenantName(e.tenantId)).length;

  return (
    <div className="space-y-4">
      <KpiStrip
        items={[
          { label: "Gekoppelde klanten", value: count(entries.length), hint: "adres gekoppeld aan een organisatie" },
          { label: "Met wildcard", value: count(entries.filter((e) => e.host.includes("*")).length), hint: "alle subdomeinen in één keer" },
          { label: "Met eigen logo", value: count(entries.filter((e) => e.brand.logoUrl).length), hint: "de rest toont de merknaam" },
          { label: "Onbekende organisatie", value: count(unknownTenants), hint: unknownTenants > 0 ? "controleer de tenant-id" : "alles klopt", ...(unknownTenants > 0 ? { tone: "warn" as const } : {}) },
        ]}
      />

      <Panel
        flush
        title="Klant-omgevingen"
        subtitle="Koppel een adres (subdomein of eigen domein van de klant) aan een organisatie en merk. Gebruik *.jouwplatform.nl voor alle subdomeinen."
        actions={<button type="button" onClick={() => setEntries([...entries, emptyEntry()])} className="a-button text-xs">Klant koppelen</button>}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="a-button a-button-primary">{saving ? "Opslaan…" : "Opslaan"}</button>
            {msg && <span role="status" className="text-xs" style={{ color: msg.ok ? "var(--a-ok)" : "var(--a-crit)" }}>{msg.text}</span>}
          </div>
        }
      >
        <datalist id="tenant-options">
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </datalist>
        {entries.length === 0 ? (
          <Empty title="Nog geen klanten gekoppeld" body="Host andere bureaus onder je platform met een eigen adres en merk." />
        ) : (
          <ul>
            {entries.map((e, i) => {
              const name = tenantName(e.tenantId);
              return (
                <li key={i} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_16rem]" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="a-label">Adres<input className="a-input" value={e.host} onChange={(ev) => patch(i, { host: ev.target.value })} placeholder="klant1.jouwplatform.nl" /></label>
                    <label className="a-label">
                      Organisatie (tenant-id)
                      <input className="a-input" list="tenant-options" value={e.tenantId} onChange={(ev) => patch(i, { tenantId: ev.target.value })} placeholder="Kies of plak een id" />
                      {e.tenantId && (
                        <span className="mt-1 block text-xs font-normal">
                          {name ? <Pill tone="ok">{name}</Pill> : <Pill tone="warn">Onbekende organisatie</Pill>}
                        </span>
                      )}
                    </label>
                    <label className="a-label">Merknaam<input className="a-input" value={e.brand.name} onChange={(ev) => patch(i, { brand: { name: ev.target.value } })} placeholder="Klant BV" /></label>
                    <label className="a-label">Logo-adres<input className="a-input" value={e.brand.logoUrl} onChange={(ev) => patch(i, { brand: { logoUrl: ev.target.value } })} placeholder="https://…/logo.svg" /></label>
                  </div>
                  <div className="space-y-2.5">
                    <BrandPreview brand={e.brand} host={e.host} />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--a-dim)" }}>
                        Kleur
                        <input type="color" aria-label="Merkkleur" value={e.brand.primaryColor} onChange={(ev) => patch(i, { brand: { primaryColor: ev.target.value } })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                      </label>
                      <button type="button" onClick={() => setEntries(entries.filter((_, j) => j !== i))} className="a-button text-xs" style={{ color: "var(--a-crit)" }}>Verwijderen</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Test een adres" subtitle="Zie welk merk en welke organisatie bij een adres hoort">
        <div className="flex flex-wrap items-center gap-2">
          <input className="a-input max-w-xs" value={testHost} onChange={(e) => setTestHost(e.target.value)} placeholder="klant1.jouwplatform.nl" aria-label="Adres om te testen" />
          <button type="button" onClick={() => void test()} disabled={!testHost.trim()} className="a-button">Testen</button>
          {testResult && <span role="status" className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>{testResult}</span>}
        </div>
      </Panel>
    </div>
  );
}
