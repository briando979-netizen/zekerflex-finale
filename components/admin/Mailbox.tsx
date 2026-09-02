"use client";

import { useEffect, useState } from "react";

interface Msg {
  id: string;
  at: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  kind: string;
  delivered: boolean;
  transport: "smtp" | "mailbox";
  error?: string;
  suppressed?: string;
}
interface Payload {
  transport: {
    smtp: boolean;
    host: string | null;
    port: number;
    secure: boolean;
    auth: boolean;
    from: string;
    admin: string;
  };
  stats: { total: number; delivered: number; failed: number };
  messages: Msg[];
}

const KIND_LABEL: Record<string, string> = {
  verification: "Verificatie",
  welcome: "Welkom",
  test: "Test",
  generic: "Bericht",
  "nieuwsbrief-bevestiging": "Nieuwsbrief · opt-in",
  nieuwsbrief: "Nieuwsbrief",
};

export function Mailbox() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/mail", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/admin/mail/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (!res.ok) setTestMsg(d?.error?.message ?? "Testmail mislukt.");
      else
        setTestMsg(
          d.delivered
            ? `Afgeleverd bij ${d.to} via SMTP.`
            : d.transport === "smtp"
              ? `Opgeslagen in de mailbox, maar SMTP faalde: ${d.error ?? "onbekend"}`
              : `Opgeslagen in de mailbox (geen SMTP ingesteld).`,
        );
      void refresh();
    } catch {
      setTestMsg("Testmail mislukt.");
    } finally {
      setTesting(false);
    }
  }

  const t = data?.transport;
  const smtpOk = Boolean(t?.smtp);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Mailbox</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Elke uitgaande e-mail wordt hier vastgelegd — welkom, verificatie en meldingen.
        </p>
      </div>

      {/* transport status */}
      <div className={`card p-4 text-sm ${smtpOk ? "border-ok/30 bg-ok/5" : "border-warn/30 bg-warn/5"}`}>
        {!data ? (
          "Status ophalen…"
        ) : smtpOk ? (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium text-ok">
              <span className="h-2 w-2 rounded-full bg-ok" /> Mailserver actief
            </p>
            <p className="font-mono text-xs text-neutralx-600">
              {t!.host}:{t!.port} {t!.secure ? "(TLS)" : ""} {t!.auth ? "· auth" : ""} · van {t!.from}
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-neutralx-700">
            <p className="font-semibold text-ink">Nog geen mailserver — berichten worden alleen lokaal bewaard</p>
            <p>
              Registratie en verificatie lopen niet vast: alle mail staat hier en de verificatielink
              wordt op het bevestigingsscherm getoond. Wil je écht mail versturen:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Snelste test: start <span className="font-mono text-xs">Mailpit</span> (één binary) — SMTP op{" "}
                <span className="font-mono text-xs">:1025</span>, webview op{" "}
                <span className="font-mono text-xs">:8025</span>.
              </li>
              <li>
                Zet in <span className="font-mono text-xs">.env</span>:{" "}
                <span className="font-mono text-xs">SMTP_HOST=localhost</span>{" "}
                <span className="font-mono text-xs">SMTP_PORT=1025</span>. Herstart de app.
              </li>
              <li>
                Of wijs <span className="font-mono text-xs">SMTP_HOST/PORT/USER/PASS</span> naar een echte
                mailserver of relay. STARTTLS en TLS worden automatisch afgehandeld.
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* stats + test */}
      <div className="flex flex-wrap items-center gap-4">
        {data && (
          <div className="flex gap-4 text-sm">
            <span><span className="num font-semibold">{data.stats.total}</span> verstuurd</span>
            <span className="text-ok"><span className="num font-semibold">{data.stats.delivered}</span> afgeleverd</span>
            {data.stats.failed > 0 && (
              <span className="text-crit"><span className="num font-semibold">{data.stats.failed}</span> mislukt</span>
            )}
          </div>
        )}
        <button type="button" onClick={sendTest} disabled={testing} className="btn-ghost ml-auto text-xs">
          {testing ? "Bezig…" : "Testmail naar admin sturen"}
        </button>
      </div>
      {testMsg && <p className="text-sm text-neutralx-600">{testMsg}</p>}

      {/* messages */}
      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Verstuurde berichten</div>
        {!data || data.messages.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen berichten.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {data.messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === m.id ? null : m.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-paper-soft"
                >
                  <span className="pill-neutral flex-shrink-0">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.subject}</span>
                    <span className="block truncate text-xs text-neutralx-500">
                      aan {m.to.join(", ")} · {new Date(m.at).toLocaleString("nl-NL")}
                    </span>
                  </span>
                  <span
                    className={`flex-shrink-0 text-xs ${
                      m.suppressed
                        ? "text-warn"
                        : m.delivered
                          ? "text-ok"
                          : m.transport === "smtp"
                            ? "text-crit"
                            : "text-neutralx-400"
                    }`}
                  >
                    {m.suppressed ? "afgemeld" : m.delivered ? "afgeleverd" : m.transport === "smtp" ? "mislukt" : "lokaal"}
                  </span>
                </button>
                {open === m.id && (
                  <div className="border-t border-hair bg-paper-soft px-5 py-4">
                    <p className="mb-2 font-mono text-xs text-neutralx-500">
                      van {m.from} · aan {m.to.join(", ")}
                    </p>
                    {m.error && (
                      <p className="mb-2 rounded bg-crit/10 px-2 py-1 text-xs text-crit">SMTP-fout: {m.error}</p>
                    )}
                    {m.suppressed && (
                      <p className="mb-2 rounded bg-warn/10 px-2 py-1 text-xs text-warn">
                        Niet verzonden — ontvanger is {m.suppressed}.
                      </p>
                    )}
                    <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-white p-3 text-xs text-ink-soft">
                      {m.text}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
