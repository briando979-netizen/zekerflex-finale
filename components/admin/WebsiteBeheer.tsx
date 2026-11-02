"use client";

import { useEffect, useState } from "react";
import { Empty, KpiStrip, Notice, PageHead, Pill, StackBar, type Tone } from "@/components/admin/kit";

// Admin-console voor "Website-beheer": alle opdrachtgevers die hun website door
// ZekerFlex laten beheren. Toont status/plan/domein; "Toon toegang" ontsleutelt
// de verzegelde SSH-/login-gegevens (server-side, geaudit) zodat het beheerteam
// het werk kan doen.

type Status = "PENDING_PAYMENT" | "ONBOARDING" | "SUBMITTED" | "ACTIVE" | "PAUSED" | "CANCELLED";

type Row = {
  id: string;
  tenantId: string;
  tenantName: string;
  status: Status;
  plan: string | null;
  domain: string | null;
  provider: string | null;
  notes: string | null;
  hasSecrets: boolean;
  subscribedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING_PAYMENT: "Wacht op betaling",
  ONBOARDING: "Betaald — wacht op gegevens",
  SUBMITTED: "Gegevens binnen",
  ACTIVE: "Actief beheerd",
  PAUSED: "Gepauzeerd",
  CANCELLED: "Opgezegd",
};
// Wacht op de klant = blauw, wacht op ons = amber, loopt = groen.
const STATUS_TONE: Record<Status, Tone> = {
  PENDING_PAYMENT: "plan",
  ONBOARDING: "plan",
  SUBMITTED: "warn",
  ACTIVE: "ok",
  PAUSED: "neutral",
  CANCELLED: "neutral",
};
const STATUS_ORDER: Status[] = ["PENDING_PAYMENT", "ONBOARDING", "SUBMITTED", "ACTIVE", "PAUSED", "CANCELLED"];
const SECRET_LABEL: Record<string, string> = {
  sshHost: "SSH-host", sshPort: "SSH-poort", sshUser: "SSH-gebruiker", sshPrivateKey: "SSH-privésleutel",
  hostingLoginUrl: "Login-URL", hostingUsername: "Gebruikersnaam", hostingPassword: "Wachtwoord", extra: "Extra info",
};

export function WebsiteBeheer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [secrets, setSecrets] = useState<Record<string, Record<string, string> | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/website", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setRows(data.sites ?? []);
    else setMessage(data?.error?.message ?? "Laden mislukt.");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const reveal = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reveal", id }) });
      const data = await res.json();
      if (!res.ok) { setMessage(data?.error?.message ?? "Onthullen mislukt."); return; }
      setSecrets((s) => ({ ...s, [id]: data.secrets ?? null }));
    } finally { setBusy(null); }
  };

  const setStatus = async (id: string, status: Status) => {
    const res = await fetch("/api/admin/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-status", id, status }) });
    if (res.ok) await load();
    else { const d = await res.json(); setMessage(d?.error?.message ?? "Status bijwerken mislukt."); }
  };

  const head = <PageHead title="Website-beheer" subtitle="Opdrachtgevers van wie wij de website beheren. Toegangsgegevens worden versleuteld bewaard en zijn alleen geaudit zichtbaar." />;
  if (loading) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }
  const countOf = (s: Status) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-4">
      {head}
      <KpiStrip
        items={[
          { label: "Actief beheerd", value: countOf("ACTIVE"), tone: "ok" },
          { label: "Gegevens binnen", value: countOf("SUBMITTED"), hint: "klaar om op te pakken", ...(countOf("SUBMITTED") > 0 ? { tone: "warn" as const } : {}) },
          { label: "Wacht op de klant", value: countOf("PENDING_PAYMENT") + countOf("ONBOARDING"), hint: "betaling of gegevens" },
          { label: "Opgezegd of gepauzeerd", value: countOf("CANCELLED") + countOf("PAUSED") },
        ]}
      />
      {rows.length > 0 && (
        <section className="a-panel p-4 sm:p-5">
          <StackBar segments={STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: countOf(s), tone: STATUS_TONE[s] }))} />
        </section>
      )}
      {message && <Notice>{message}</Notice>}
      {rows.length === 0 ? (
        <section className="a-panel"><Empty title="Nog geen aanvragen" body="Zodra een opdrachtgever een abonnement neemt, verschijnt het hier." /></section>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <section key={r.id} className="a-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold" style={{ color: "var(--a-text)" }}>{r.domain || r.tenantName}</p>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>{r.tenantName}{r.provider ? ` · ${r.provider}` : ""}{r.plan ? ` · plan: ${r.plan}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                  <select value={r.status} onChange={(e) => void setStatus(r.id, e.target.value as Status)} aria-label="Status wijzigen" className="a-input !w-auto !py-1 text-xs">
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              {r.notes && <p className="mt-2 text-sm" style={{ color: "var(--a-dim)" }}>{r.notes}</p>}
              <div className="mt-3">
                {r.hasSecrets ? (
                  secrets[r.id] ? (
                    <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--a-border)" }}>
                      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--a-mute)" }}>Toegangsgegevens, geopend en vastgelegd in het auditspoor</p>
                      <dl className="space-y-1.5">
                        {Object.entries(secrets[r.id] as Record<string, string>).map(([k, v]) => (
                          <div key={k} className="flex flex-col gap-0.5">
                            <dt className="text-xs" style={{ color: "var(--a-mute)" }}>{SECRET_LABEL[k] ?? k}</dt>
                            <dd className="whitespace-pre-wrap break-all font-mono text-xs" style={{ color: "var(--a-text)" }}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <button type="button" className="a-button mt-2 text-xs" onClick={() => setSecrets((s) => ({ ...s, [r.id]: null }))}>Verbergen</button>
                    </div>
                  ) : (
                    <button type="button" className="a-button text-xs" disabled={busy === r.id} onClick={() => void reveal(r.id)}>{busy === r.id ? "Ontsleutelen…" : "Toegangsgegevens tonen"}</button>
                  )
                ) : (
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>Nog geen toegangsgegevens ingevuld.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
