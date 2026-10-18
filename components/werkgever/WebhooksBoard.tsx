"use client";

import { useCallback, useEffect, useState } from "react";

interface Hook {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}
interface Delivery {
  id: string;
  eventType: string;
  statusCode: number | null;
  attempts: number;
  deliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
  subscription: { url: string };
}

/** Werkgever: outgoing webhooks — add, choose events, test, rotate secret, delivery log. */
export function WebhooksBoard() {
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events, setEvents] = useState<{ key: string; label: string }[]>([]);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/werkgever/webhooks", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setHooks(d.webhooks);
    setDeliveries(d.deliveries);
    setEvents(d.events);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setNote(null);
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setNote({ ok: false, text: d?.error?.message ?? "Dat lukte niet." });
      return null;
    }
    await load();
    return d;
  }

  if (!hooks) return null;

  return (
    <div className="space-y-5">
      {secret && (
        <div className="rounded-xl border border-brand-mint/40 bg-mintwash p-4 text-sm">
          <p className="font-semibold text-ink">Ondertekeningsgeheim — bewaar het nu</p>
          <p className="mt-1 text-xs text-neutralx-600">
            Hiermee controleer je de header <code>x-zekerflex-signature</code> (HMAC-SHA256 van <code>{"<timestamp>.<body>"}</code>). Dit wordt maar één keer getoond.
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs">{secret}</code>
          <button type="button" onClick={() => setSecret(null)} className="mt-2 text-xs font-semibold text-brand-600">
            Ik heb het bewaard
          </button>
        </div>
      )}
      {note && <p className={`rounded-xl px-4 py-2 text-sm ${note.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>{note.text}</p>}

      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold text-ink">Webhook toevoegen</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jouw-systeem.nl/zekerflex-webhook" className="w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          {events.map((e) => {
            const on = picked.includes(e.key);
            return (
              <button key={e.key} type="button" onClick={() => setPicked(on ? picked.filter((x) => x !== e.key) : [...picked, e.key])} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}>
                {e.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={busy || !url || picked.length === 0}
          onClick={async () => {
            const d = await call("/api/werkgever/webhooks", "POST", { url, eventTypes: picked });
            if (d?.secret) {
              setSecret(d.secret);
              setUrl("");
              setPicked([]);
            }
          }}
          className="btn-primary text-sm disabled:opacity-50"
        >
          Toevoegen
        </button>
        <p className="text-xs text-neutralx-400">Alleen https-adressen. We proberen elke melding tot 5 keer opnieuw bij een fout.</p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Je webhooks</div>
        {hooks.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen webhooks.</p>
        ) : (
          <ul className="divide-y divide-hair text-sm">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-ink">{h.url}</span>
                  <span className="block text-xs text-neutralx-500">{h.eventTypes.map((k) => events.find((e) => e.key === k)?.label ?? k).join(" · ")}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${h.active ? "bg-ok/10 text-ok" : "bg-paper-soft text-neutralx-500"}`}>{h.active ? "actief" : "gepauzeerd"}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const d = await call(`/api/werkgever/webhooks/${h.id}`, "POST", { action: "test" });
                    if (d) setNote(d.ok ? { ok: true, text: `Test aangekomen (HTTP ${d.status}).` } : { ok: false, text: `Test mislukt${d.status ? ` (HTTP ${d.status})` : ""}${d.error ? `: ${d.error}` : ""}.` });
                  }}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Test
                </button>
                <button type="button" disabled={busy} onClick={() => call(`/api/werkgever/webhooks/${h.id}`, "PATCH", { active: !h.active })} className="text-xs hover:underline">
                  {h.active ? "Pauzeren" : "Hervatten"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Nieuw geheim maken? Het oude werkt direct niet meer — pas het daarna meteen aan in je eigen systeem.")) return;
                    const d = await call(`/api/werkgever/webhooks/${h.id}`, "POST", { action: "rotate" });
                    if (d?.secret) setSecret(d.secret);
                  }}
                  className="text-xs hover:underline"
                >
                  Geheim vernieuwen
                </button>
                <button type="button" disabled={busy} onClick={() => window.confirm("Webhook verwijderen?") && call(`/api/werkgever/webhooks/${h.id}`, "DELETE")} className="text-xs text-crit hover:underline">
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deliveries.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Laatste meldingen</div>
          <ul className="divide-y divide-hair text-xs">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
                <span className={`h-2 w-2 rounded-full ${d.deliveredAt ? "bg-ok" : "bg-crit"}`} />
                <span className="font-medium text-ink">{d.eventType}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-neutralx-500">{d.subscription.url}</span>
                <span className="text-neutralx-500">{d.deliveredAt ? `HTTP ${d.statusCode}` : d.lastError ?? "mislukt"} · {d.attempts}×</span>
                <span className="text-neutralx-400">{new Date(d.createdAt).toLocaleString("nl-NL")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
