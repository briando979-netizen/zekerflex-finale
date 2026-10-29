"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Alert {
  key: string;
  title: string;
  detail: string;
  severity: "critical" | "warning";
  url: string;
  at: string;
  sent: { push: number; mail: boolean; webhook?: boolean };
}

/** Recent owner alerts + a test button to check that push and mail actually arrive. */
export function OpsAlerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/alerts", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setAlerts((await r.json()).alerts);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function test() {
    setBusy(true);
    const r = await fetch("/api/admin/alerts", { method: "POST" }).catch(() => null);
    setBusy(false);
    const d = r ? await r.json().catch(() => ({})) : {};
    setNote(
      r?.ok
        ? d.alert?.sent?.push > 0
          ? `Testmelding verstuurd naar ${d.alert.sent.push} apparaat/apparaten${d.alert.sent.mail ? " en per e-mail" : ""}.`
          : `Testmelding verstuurd${d.alert?.sent?.mail ? " per e-mail" : ""}, maar er staat nog geen telefoon aan voor pushmeldingen. Zet meldingen aan via het belletje bovenin (op je telefoon).`
        : "Versturen lukte niet.",
    );
    void load();
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-hair px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Storingsmeldingen</p>
          <p className="text-xs text-neutralx-500">Mislukte taken, uitbetalingen, Stripe-fouten en bank-risico&apos;s gaan direct als pushmelding naar je telefoon en per e-mail naar het beheeradres.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void test()} className="btn-ghost text-sm disabled:opacity-50">
          {busy ? "Versturen…" : "Testmelding sturen"}
        </button>
      </div>
      {note && <p className="border-b border-hair px-5 py-2.5 text-sm text-neutralx-600">{note}</p>}
      {alerts === null ? (
        <p className="px-5 py-6 text-sm text-neutralx-400">Laden…</p>
      ) : alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutralx-500">Geen storingen gemeld. 👍</p>
      ) : (
        <ul className="divide-y divide-hair">
          {alerts.map((a) => (
            <li key={a.key + a.at} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
              <span aria-hidden>{a.severity === "critical" ? "🚨" : "⚠️"}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{a.title}</span>
                <span className="block text-xs text-neutralx-500">{a.detail}</span>
                <span className="block text-[11px] text-neutralx-400">
                  {new Date(a.at).toLocaleString("nl-NL")} · push naar {a.sent.push} apparaat{a.sent.push === 1 ? "" : "en"} · e-mail {a.sent.mail ? "verstuurd" : "niet verstuurd"}{a.sent.webhook ? " · webhook verstuurd" : ""}
                </span>
              </span>
              <Link href={a.url} className="text-xs font-semibold text-brand-600 hover:underline">
                Bekijken
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
