"use client";

import { useCallback, useEffect, useState } from "react";

interface Sub {
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  source: string;
  createdAt: string;
  confirmedAt: string | null;
}
interface Campaign {
  id: string;
  at: string;
  subject: string;
  recipients: number;
  delivered: number;
  failed: number;
  sentByEmail: string;
}
interface Payload {
  stats: { total: number; confirmed: number; pending: number; unsubscribed: number };
  smtp: boolean;
  from: string;
  subscribers: Sub[];
  campaigns: Campaign[];
}

const STATUS_LABEL: Record<Sub["status"], string> = {
  pending: "wacht op bevestiging",
  confirmed: "bevestigd",
  unsubscribed: "afgemeld",
};

export function Newsletter() {
  const [data, setData] = useState<Payload | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Sub["status"]>("all");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nieuwsbrief", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(test: boolean) {
    if (busy) return;
    if (!test && !window.confirm(`Nieuwsbrief versturen naar ${data?.stats.confirmed ?? 0} bevestigde abonnees?`)) {
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/nieuwsbrief/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, test }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(d?.error?.message ?? "Versturen mislukt.");
      } else if (test) {
        setNote(`Testmail verstuurd naar jezelf (${d.delivered}/${d.recipients} afgeleverd).`);
      } else {
        setNote(`Verstuurd: ${d.delivered} afgeleverd, ${d.failed} mislukt van ${d.recipients}.`);
        setSubject("");
        setBody("");
        void refresh();
      }
    } catch {
      setNote("Versturen mislukt — geen verbinding.");
    } finally {
      setBusy(false);
    }
  }

  const s = data?.stats;
  const subs = (data?.subscribers ?? []).filter((x) => filter === "all" || x.status === filter);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Nieuwsbrief</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Inschrijvingen van de website (dubbele opt-in) en het versturen van een uitgave.
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Bevestigd", s?.confirmed ?? 0, "text-ok"],
          ["Wacht op bevestiging", s?.pending ?? 0, "text-warn"],
          ["Afgemeld", s?.unsubscribed ?? 0, "text-neutralx-400"],
          ["Totaal", s?.total ?? 0, "text-ink"],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="card p-4">
            <div className={`num text-2xl font-bold ${cls as string}`}>{val as number}</div>
            <div className="mt-1 text-xs text-neutralx-500">{label as string}</div>
          </div>
        ))}
      </div>

      {!data?.smtp && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-neutralx-700">
          Geen mailserver ingesteld — uitgaven worden alleen lokaal in de mailbox bewaard.
        </p>
      )}

      {/* compose */}
      <div className="card space-y-3 p-5">
        <div className="text-sm font-semibold">Nieuwe uitgave</div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Onderwerp"
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bericht. Lege regel = nieuwe alinea."
          rows={9}
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => send(false)}
            disabled={busy || subject.length < 3 || body.length < 10}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Bezig…" : `Versturen naar ${s?.confirmed ?? 0} abonnees`}
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            disabled={busy || subject.length < 3 || body.length < 10}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            Eerst naar mezelf testen
          </button>
          <span className="text-xs text-neutralx-500">Van: {data?.from ?? "…"}</span>
        </div>
        {note && <p className="text-sm text-neutralx-700">{note}</p>}
      </div>

      {/* campaign history */}
      {data && data.campaigns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Verstuurde uitgaven</div>
          <ul className="divide-y divide-hair text-sm">
            {data.campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.subject}</span>
                <span className="text-xs text-neutralx-500">
                  {new Date(c.at).toLocaleString("nl-NL")} · {c.delivered}/{c.recipients} afgeleverd
                  {c.failed > 0 ? ` · ${c.failed} mislukt` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* subscribers */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Abonnees</span>
          <div className="ml-auto flex gap-1">
            {(["all", "confirmed", "pending", "unsubscribed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  filter === f ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600"
                }`}
              >
                {f === "all" ? "alle" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        {subs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen inschrijvingen.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-hair overflow-y-auto text-sm">
            {subs.map((x) => (
              <li key={x.email} className="flex items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate">{x.email}</span>
                <span className="text-xs text-neutralx-400">{x.source}</span>
                <span
                  className={`text-xs ${
                    x.status === "confirmed"
                      ? "text-ok"
                      : x.status === "pending"
                        ? "text-warn"
                        : "text-neutralx-400"
                  }`}
                >
                  {STATUS_LABEL[x.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
