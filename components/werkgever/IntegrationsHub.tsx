"use client";

import { copyText } from "@/lib/clipboard";

import { useEffect, useState } from "react";

interface ChatEvent {
  key: string;
  label: string;
}
interface Data {
  calendarUrl: string;
  chatHook: { kind: "slack" | "teams" | "other"; events: string[]; url: string } | null;
  chatEvents: ChatEvent[];
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/werkgever/integraties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error?.message ?? "Mislukt.");
  return d;
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col p-5">
      <p className="flex items-center gap-2 font-display text-base font-bold text-ink">
        <span className="text-xl">{icon}</span>
        {title}
      </p>
      <div className="mt-2 flex-1 space-y-3 text-sm text-neutralx-600">{children}</div>
    </div>
  );
}

/** Werkgever → Integraties: koppelingen zonder programmeur. */
export function IntegrationsHub() {
  const [d, setD] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);
  const [hookUrl, setHookUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["shift.matched", "freelancer.checked_in", "timesheet.approved"]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const month = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(month);

  const load = () =>
    fetch("/api/werkgever/integraties", { cache: "no-store" })
      .then((r) => r.json())
      .then((x: Data) => {
        setD(x);
        if (x.chatHook) setEvents(x.chatHook.events);
      })
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  if (!d?.calendarUrl) return null;
  const [y, m] = period.split("-").map(Number) as [number, number];
  const from = `${period}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const webcal = d.calendarUrl.replace(/^https?:/, "webcal:");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote(ok);
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card icon="📅" title="Agenda — Google, Outlook, Apple">
        <p>Al je diensten automatisch in je eigen agenda, met wie er komt. Werkt bij elke wijziging vanzelf bij.</p>
        <div className="flex gap-2">
          <input readOnly value={d.calendarUrl} className="field-input min-w-0 flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={async () => {
              await copyText(d.calendarUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Gekopieerd" : "Kopieer"}
          </button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>
            <strong>Google Agenda:</strong> Andere agenda&apos;s → + → <em>Via URL</em> → plak de link.
          </li>
          <li>
            <strong>Outlook:</strong> Agenda toevoegen → <em>Abonneren via internet</em> → plak de link.
          </li>
          <li>
            <strong>Apple / iPhone:</strong>{" "}
            <a href={webcal} className="font-semibold text-brand-600 underline">
              open hier direct
            </a>
            .
          </li>
        </ul>
        <button
          type="button"
          disabled={busy}
          className="text-xs text-neutralx-400 underline hover:text-crit"
          onClick={() => {
            if (window.confirm("Nieuwe link maken? De oude link stopt dan met werken in alle agenda's.")) void run(() => post({ action: "calendar-rotate" }), "Nieuwe agenda-link gemaakt.");
          }}
        >
          Link vernieuwen (als hij gedeeld is met iemand die hem niet mag hebben)
        </button>
      </Card>

      <Card icon="📊" title="Export voor boekhouding en salaris">
        <p>Download goedgekeurde uren en facturen als bestand dat Excel, Exact, Moneybird, Nmbrs en de meeste andere pakketten inlezen.</p>
        <label className="flex items-center gap-2 text-xs">
          Maand
          <input type="month" value={period} max={month} onChange={(e) => setPeriod(e.target.value || month)} className="field-input w-auto py-1 text-xs" />
        </label>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/werkgever/export/uren?from=${from}&to=${to}`} className="btn-ghost text-xs">
            ⬇ Uren (CSV)
          </a>
          <a href={`/api/werkgever/export/facturen?from=${from}&to=${to}`} className="btn-ghost text-xs">
            ⬇ Facturen (CSV)
          </a>
        </div>
      </Card>

      <Card icon="💬" title="Slack of Microsoft Teams">
        <p>Krijg een berichtje in je eigen teamkanaal als er iets gebeurt.</p>
        {d.chatHook ? (
          <p className="rounded-lg bg-ok/10 px-3 py-2 text-xs text-neutralx-700">
            ✓ Gekoppeld met {d.chatHook.kind === "slack" ? "Slack" : d.chatHook.kind === "teams" ? "Teams" : "je chatkanaal"} ({d.chatHook.url})
          </p>
        ) : (
          <>
            <input
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…  of je Teams-webhook-URL"
              className="field-input text-xs"
            />
            <p className="text-[11px] text-neutralx-400">
              Slack: Apps → <em>Incoming Webhooks</em> → kanaal kiezen → URL kopiëren. Teams: kanaal → ••• → <em>Workflows</em> → &ldquo;Berichten ontvangen
              via webhook&rdquo; → URL kopiëren.
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {d.chatEvents.map((e) => (
            <label key={e.key} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={events.includes(e.key)}
                onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e.key] : cur.filter((k) => k !== e.key)))}
                className="accent-brand-500"
              />
              {e.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {d.chatHook ? (
            <>
              <button type="button" disabled={busy} className="btn-ghost text-xs" onClick={() => void run(() => post({ action: "chat-test" }), "Testbericht verstuurd — kijk in je kanaal.")}>
                Stuur testbericht
              </button>
              <button type="button" disabled={busy} className="btn-ghost text-xs text-crit" onClick={() => void run(() => post({ action: "chat-remove" }), "Koppeling verwijderd.")}>
                Ontkoppelen
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || !hookUrl || events.length === 0}
              className="btn-primary text-xs disabled:opacity-50"
              onClick={() => void run(() => post({ action: "chat-set", url: hookUrl, events }), "Gekoppeld — er staat een testbericht in je kanaal.")}
            >
              Koppelen
            </button>
          )}
        </div>
      </Card>

      <Card icon="⚡" title="Zapier, Make & 5.000+ apps">
        <p>Koppel ZekerFlex zonder programmeren aan je planning, CRM, spreadsheets of HR-pakket.</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs">
          <li>
            Maak in Zapier of Make een scenario met trigger <em>Webhooks → Catch Hook</em> en kopieer de URL.
          </li>
          <li>
            Plak die URL hieronder bij <strong>Webhooks</strong> en kies de gebeurtenissen (ingepland, ingecheckt, uren goedgekeurd, factuur…).
          </li>
          <li>
            Wil je vanuit Zapier/Make ook diensten aanmaken of uren ophalen? Maak hieronder een <strong>API-sleutel</strong> en gebruik de
            HTTP-actie met <code>Authorization: Bearer &lt;sleutel&gt;</code>.
          </li>
        </ol>
        <p className="text-xs">
          Voorbeelden: elke goedgekeurde urenstaat als regel in Google Sheets · een melding in je planning bij een nieuwe toewijzing · facturen
          automatisch naar je boekhouding.
        </p>
      </Card>

      {note && <p className="text-sm text-neutralx-700 lg:col-span-2">{note}</p>}
    </div>
  );
}
