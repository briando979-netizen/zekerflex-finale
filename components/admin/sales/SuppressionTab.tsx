"use client";

import { useCallback, useState } from "react";
import { APanel, AButton } from "@/components/admin/ui";

export type SuppressionEntry = {
  email: string;
  domain: string | null;
  reason: string;
  createdAt: string;
};

const REASON_LABEL: Record<string, string> = {
  manual: "Handmatig",
  bounce: "Bounce",
  unsubscribe: "Afgemeld",
  "category-opt-out": "Afgemeld",
  complaint: "Klacht",
  "existing-customer": "Al klant",
};

export function SuppressionTab({ initial }: { initial: SuppressionEntry[] }) {
  const [entries, setEntries] = useState<SuppressionEntry[]>(initial);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/sales/suppression", { cache: "no-store" });
    const d = await r.json();
    if (Array.isArray(d.entries)) setEntries(d.entries);
  }, []);

  async function add() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMsg("Vul een geldig e-mailadres in.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/sales/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: "manual" }),
      });
      if (r.ok) {
        setEmail("");
        await reload();
      } else {
        setMsg("Toevoegen mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(addr: string) {
    await fetch("/api/admin/sales/suppression", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    await reload();
  }

  return (
    <div className="space-y-4">
      <APanel title="Onderdrukkingslijst" subtitle="Deze adressen krijgen nooit outreach — afmeldingen en bounces komen hier automatisch bij">
        <div className="flex flex-wrap gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adres@bedrijf.nl"
            className="min-w-[220px] flex-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
          />
          <AButton onClick={add} disabled={busy}>{busy ? "Bezig…" : "Toevoegen"}</AButton>
        </div>
        {msg && <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>{msg}</p>}
      </APanel>

      <APanel pad={false}>
        {entries.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: "var(--a-mute)" }}>Lijst is leeg.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {entries.map((e) => (
              <li key={e.email} className="flex items-center justify-between px-5 py-2.5 text-xs">
                <span style={{ color: "var(--a-dim)" }}>
                  {e.email}
                  <span className="ml-2" style={{ color: "var(--a-mute)" }}>
                    {REASON_LABEL[e.reason] ?? e.reason} · {new Date(e.createdAt).toLocaleDateString("nl-NL")}
                  </span>
                </span>
                <button type="button" onClick={() => remove(e.email)} className="text-[10px] underline" style={{ color: "var(--a-mute)" }}>
                  verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
      </APanel>
    </div>
  );
}
