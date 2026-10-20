"use client";

import { useEffect, useMemo, useState } from "react";
import { MailToolsBar } from "@/components/mail/MailToolsBar";

interface SentMsg {
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
interface SentPayload {
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
  messages: SentMsg[];
}

const KIND_LABEL: Record<string, string> = {
  verification: "Verificatie",
  welcome: "Welkom",
  test: "Test",
  generic: "Bericht",
  "nieuwsbrief-bevestiging": "Nieuwsbrief · opt-in",
  nieuwsbrief: "Nieuwsbrief",
};

interface InboxMsg {
  uid: number;
  date: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  seen: boolean;
}
interface InboxPayload {
  configured: boolean;
  host?: string;
  messages: InboxMsg[];
}
interface Attachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Tab = "inbox" | "sent";
type Selection = { tab: Tab; id: string } | { tab: "compose" } | null;

const money = (n: number) => n.toLocaleString("nl-NL");

export function Mailbox() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);

  const [sent, setSent] = useState<SentPayload | null>(null);
  const [inbox, setInbox] = useState<InboxPayload | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);

  const [inboxBody, setInboxBody] = useState<Record<number, string>>({});
  const [inboxAttachments, setInboxAttachments] = useState<Record<number, Attachment[]>>({});
  const [bodyLoading, setBodyLoading] = useState<number | null>(null);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  async function resend(payload: { id: string } | { allFailed: true }) {
    if (resending) return;
    setResending(true);
    setResendMsg("allFailed" in payload ? "Mislukte mails worden opnieuw verstuurd…" : "Opnieuw versturen…");
    try {
      const res = await fetch("/api/admin/mail/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setResendMsg(d?.error?.message ?? "Opnieuw versturen mislukt.");
      else if (d.count === 0) setResendMsg("Geen mislukte mails om opnieuw te versturen.");
      else setResendMsg(`${d.delivered} van ${d.count} alsnog afgeleverd${d.failed ? ` · ${d.failed} nog steeds mislukt${d.error ? ` (${d.error})` : ""}` : ""}.`);
      await refreshSent();
    } catch {
      setResendMsg("Opnieuw versturen mislukt — geen verbinding.");
    } finally {
      setResending(false);
    }
  }

  async function refreshSent() {
    try {
      const res = await fetch("/api/admin/mail", { cache: "no-store" });
      if (res.ok) setSent(await res.json());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void refreshSent();
    const t = setInterval(refreshSent, 8000);
    return () => clearInterval(t);
  }, []);

  async function refreshInbox() {
    try {
      const res = await fetch("/api/admin/mail/inbox", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) {
        setInbox(null);
        setInboxError(d?.error?.message ?? "Postvak in kon niet worden geladen.");
      } else {
        setInbox(d);
        setInboxError(null);
      }
    } catch {
      setInboxError("Postvak in kon niet worden geladen.");
    } finally {
      setInboxLoading(false);
    }
  }
  useEffect(() => {
    void refreshInbox();
    const t = setInterval(refreshInbox, 30000);
    return () => clearInterval(t);
  }, []);

  async function openInboxMessage(uid: number) {
    setSelection({ tab: "inbox", id: String(uid) });
    if (inboxBody[uid] !== undefined) return;
    setBodyLoading(uid);
    try {
      const res = await fetch(`/api/admin/mail/inbox/${uid}`, { cache: "no-store" });
      const d = await res.json();
      setInboxBody((cur) => ({ ...cur, [uid]: res.ok ? d.text : (d?.error?.message ?? "Kon bericht niet laden.") }));
      setInboxAttachments((cur) => ({ ...cur, [uid]: res.ok && Array.isArray(d.attachments) ? d.attachments : [] }));
      // De server markeert \Seen als bijwerking van het ophalen van de body —
      // dit houdt de ongelezen-stip in de lijst meteen in sync, zonder op de
      // volgende poll te wachten.
      if (res.ok) setInbox((cur) => (cur ? { ...cur, messages: cur.messages.map((m) => (m.uid === uid ? { ...m, seen: true } : m)) } : cur));
    } catch {
      setInboxBody((cur) => ({ ...cur, [uid]: "Kon bericht niet laden." }));
    } finally {
      setBodyLoading(null);
    }
  }

  function replyTo(m: InboxMsg) {
    setTo(m.fromAddress ?? "");
    setSubject(m.subject && /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject ?? ""}`);
    setComposeBody("");
    setSendMsg(null);
    setSelection({ tab: "compose" });
  }

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
      void refreshSent();
    } catch {
      setTestMsg("Testmail mislukt.");
    } finally {
      setTesting(false);
    }
  }

  async function sendCustom() {
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/admin/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text: composeBody }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendMsg(d?.error?.message ?? "Versturen mislukt.");
        return;
      }
      setSendMsg(
        d.delivered
          ? `Verstuurd naar ${to} via SMTP.`
          : d.transport === "smtp"
            ? `Opgeslagen in de mailbox, maar SMTP faalde: ${d.error ?? "onbekend"}`
            : `Opgeslagen in de mailbox (geen SMTP ingesteld).`,
      );
      setTo("");
      setSubject("");
      setComposeBody("");
      void refreshSent();
    } catch {
      setSendMsg("Versturen mislukt.");
    } finally {
      setSending(false);
    }
  }

  const t = sent?.transport;
  const smtpOk = Boolean(t?.smtp);
  const unreadCount = inbox?.messages.filter((m) => !m.seen).length ?? 0;

  const q = query.trim().toLowerCase();
  const inboxShown = useMemo(
    () =>
      (inbox?.messages ?? []).filter(
        (m) => !q || (m.subject ?? "").toLowerCase().includes(q) || (m.fromName ?? "").toLowerCase().includes(q) || (m.fromAddress ?? "").toLowerCase().includes(q),
      ),
    [inbox, q],
  );
  const sentShown = useMemo(
    () =>
      (sent?.messages ?? []).filter(
        (m) => !q || m.subject.toLowerCase().includes(q) || m.to.join(" ").toLowerCase().includes(q),
      ),
    [sent, q],
  );

  const selectedInbox = selection?.tab === "inbox" ? inbox?.messages.find((m) => String(m.uid) === selection.id) : null;
  const selectedSent = selection?.tab === "sent" ? sent?.messages.find((m) => m.id === selection.id) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Mailbox</h1>
          <p className="mt-1 text-sm text-neutralx-600">
            {t?.admin ? `Echt postvak in van ${t.admin}` : "Inkomende en uitgaande e-mail van ZekerFlex"}
            {inbox?.host ? ` (${inbox.host})` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${smtpOk ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          {!sent ? "Status…" : smtpOk ? "Mailserver actief" : "Geen mailserver ingesteld"}
        </span>
      </div>

      {sent && !smtpOk && (
        <div className="card space-y-2 p-4 text-sm text-neutralx-700">
          <p className="font-semibold text-ink">Berichten worden alleen lokaal bewaard — nog geen mailserver ingesteld</p>
          <p>Registratie en verificatie lopen niet vast: alles staat hier en de verificatielink staat op het bevestigingsscherm.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Snelste test: start <span className="font-mono text-xs">Mailpit</span> (SMTP op <span className="font-mono text-xs">:1025</span>, webview op <span className="font-mono text-xs">:8025</span>).</li>
            <li>Zet in <span className="font-mono text-xs">.env</span>: <span className="font-mono text-xs">SMTP_HOST=localhost</span> <span className="font-mono text-xs">SMTP_PORT=1025</span>. Herstart de app.</li>
            <li>Of wijs <span className="font-mono text-xs">SMTP_HOST/PORT/USER/PASS</span> naar een echte mailserver of relay.</li>
          </ol>
        </div>
      )}

      <div className="card grid overflow-hidden sm:grid-cols-[280px_1fr] md:grid-cols-[320px_1fr]" style={{ minHeight: 560 }}>
        {/* lijst-paneel */}
        <div className="flex flex-col border-b border-hair sm:border-b-0 sm:border-r">
          <div className="flex items-center gap-1 border-b border-hair p-2">
            <button
              type="button"
              onClick={() => { setTab("inbox"); setSelection(null); }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === "inbox" ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}
            >
              Postvak in{unreadCount > 0 ? ` (${money(unreadCount)})` : ""}
            </button>
            <button
              type="button"
              onClick={() => { setTab("sent"); setSelection(null); }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === "sent" ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}
            >
              Verstuurd
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-hair px-3 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoeken…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-neutralx-400"
            />
            <button
              type="button"
              onClick={() => { setSelection({ tab: "compose" }); }}
              className="flex-shrink-0 rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-white"
            >
              + Nieuw
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "inbox" ? (
              inboxLoading ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">Laden…</p>
              ) : inboxError ? (
                <p className="px-4 py-6 text-sm text-neutralx-600">{inboxError}</p>
              ) : inboxShown.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{q ? "Niets gevonden." : "Geen berichten."}</p>
              ) : (
                <ul className="divide-y divide-hair">
                  {inboxShown.map((m) => (
                    <li key={m.uid}>
                      <button
                        type="button"
                        onClick={() => void openInboxMessage(m.uid)}
                        className={`flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-paper-soft ${selection?.tab === "inbox" && selection.id === String(m.uid) ? "bg-paper-soft" : ""}`}
                      >
                        {!m.seen && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" aria-label="Ongelezen" />}
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${m.seen ? "text-ink-soft" : "font-semibold text-ink"}`}>{m.subject || "(geen onderwerp)"}</span>
                          <span className="block truncate text-xs text-neutralx-500">{m.fromName || m.fromAddress || "onbekend"}</span>
                          <span className="block text-[11px] text-neutralx-400">{m.date ? new Date(m.date).toLocaleString("nl-NL") : ""}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : sentShown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutralx-400">{q ? "Niets gevonden." : "Nog geen berichten verstuurd."}</p>
            ) : (
              <ul className="divide-y divide-hair">
                {sentShown.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelection({ tab: "sent", id: m.id })}
                      className={`flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-paper-soft ${selection?.tab === "sent" && selection.id === m.id ? "bg-paper-soft" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{m.subject}</span>
                        <span className="block truncate text-xs text-neutralx-500">aan {m.to.join(", ")}</span>
                        <span className="block text-[11px] text-neutralx-400">{new Date(m.at).toLocaleString("nl-NL")}</span>
                      </span>
                      <span className={`flex-shrink-0 text-[11px] ${m.suppressed ? "text-warn" : m.delivered ? "text-ok" : m.transport === "smtp" ? "text-crit" : "text-neutralx-400"}`}>
                        {m.suppressed ? "afgemeld" : m.delivered ? "afgeleverd" : m.transport === "smtp" ? "mislukt" : "lokaal"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-hair px-4 py-2 text-[11px] text-neutralx-500">
            {sent ? (
              <span>
                {money(sent.stats.total)} verstuurd · <span className="text-ok">{money(sent.stats.delivered)} afgeleverd</span>
                {sent.stats.failed > 0 && (
                  <>
                    <span className="text-crit"> · {money(sent.stats.failed)} mislukt</span>{" "}
                    <button
                      type="button"
                      disabled={resending}
                      onClick={() => void resend({ allFailed: true })}
                      className="font-semibold text-crit underline hover:text-ink disabled:opacity-50"
                    >
                      {resending ? "bezig…" : "opnieuw versturen"}
                    </button>
                  </>
                )}
                {resendMsg && <span className="block text-neutralx-600">{resendMsg}</span>}
              </span>
            ) : <span />}
            <button type="button" onClick={() => void refreshInbox()} className="font-semibold hover:text-ink">Ververs</button>
          </div>
        </div>

        {/* lees/opstel-paneel */}
        <div className="flex min-h-0 flex-col overflow-y-auto">
          {selection?.tab === "compose" ? (
            <div className="space-y-3 p-6">
              <h2 className="font-display text-lg font-bold">Nieuw bericht</h2>
              <p className="text-xs text-neutralx-500">Naar een freelancer, werkgever of ander bedrijf — los van automatische systeemmails.</p>
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="naar@voorbeeld.nl" className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Onderwerp" className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
              <MailToolsBar
                onInsert={(tpl) => {
                  if (tpl.subject) setSubject((cur) => cur || tpl.subject);
                  setComposeBody((cur) => (cur.trim() ? `${cur.trimEnd()}

${tpl.body}` : tpl.body));
                }}
                company="ZekerFlex"
              />
              <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Bericht. Lege regel = nieuwe alinea." rows={10} className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={sendCustom}
                  disabled={sending || !to.includes("@") || subject.trim().length < 2 || composeBody.trim().length < 2}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {sending ? "Bezig…" : "Versturen"}
                </button>
                <button type="button" onClick={sendTest} disabled={testing} className="btn-ghost text-xs">
                  {testing ? "Bezig…" : "Testmail naar admin"}
                </button>
                <span className="text-xs text-neutralx-500">Antwoorden gaan naar jouw eigen e-mailadres.</span>
              </div>
              {sendMsg && <p className="text-sm text-neutralx-700">{sendMsg}</p>}
              {testMsg && <p className="text-sm text-neutralx-700">{testMsg}</p>}
            </div>
          ) : selectedInbox ? (
            <div className="space-y-3 p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-bold">{selectedInbox.subject || "(geen onderwerp)"}</h2>
                {selectedInbox.fromAddress && (
                  <button type="button" onClick={() => replyTo(selectedInbox)} className="btn-ghost flex-shrink-0 text-xs">
                    Beantwoorden
                  </button>
                )}
              </div>
              <p className="text-xs text-neutralx-500">
                van {selectedInbox.fromName ? `${selectedInbox.fromName} ` : ""}
                {selectedInbox.fromAddress ? `<${selectedInbox.fromAddress}>` : ""}
                {selectedInbox.date ? ` · ${new Date(selectedInbox.date).toLocaleString("nl-NL")}` : ""}
              </p>
              {bodyLoading === selectedInbox.uid ? (
                <p className="text-sm text-neutralx-500">Laden…</p>
              ) : (
                <>
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-paper-soft p-4 text-sm text-ink-soft">
                    {inboxBody[selectedInbox.uid] ?? ""}
                  </pre>
                  {(inboxAttachments[selectedInbox.uid]?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {inboxAttachments[selectedInbox.uid]!.map((a) => (
                        <a
                          key={a.index}
                          href={`/api/admin/mail/inbox/${selectedInbox.uid}/attachment/${a.index}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
                        >
                          📎 {a.filename} <span className="font-normal text-neutralx-400">({formatSize(a.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : selectedSent ? (
            <div className="space-y-3 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill-neutral">{KIND_LABEL[selectedSent.kind] ?? selectedSent.kind}</span>
                <span className={`text-xs ${selectedSent.suppressed ? "text-warn" : selectedSent.delivered ? "text-ok" : selectedSent.transport === "smtp" ? "text-crit" : "text-neutralx-400"}`}>
                  {selectedSent.suppressed ? "afgemeld" : selectedSent.delivered ? "afgeleverd" : selectedSent.transport === "smtp" ? "mislukt" : "lokaal"}
                </span>
              </div>
              <h2 className="font-display text-lg font-bold">{selectedSent.subject}</h2>
              <p className="text-xs text-neutralx-500">
                van {selectedSent.from} · aan {selectedSent.to.join(", ")} · {new Date(selectedSent.at).toLocaleString("nl-NL")}
              </p>
              {selectedSent.error && !selectedSent.delivered && (
                <div className="flex flex-wrap items-center gap-2 rounded bg-crit/10 px-2 py-1 text-xs text-crit">
                  <span className="min-w-0 flex-1">SMTP-fout: {selectedSent.error}</span>
                  <button
                    type="button"
                    disabled={resending}
                    onClick={() => void resend({ id: selectedSent.id })}
                    className="rounded bg-crit px-2 py-0.5 font-semibold text-white disabled:opacity-50"
                  >
                    {resending ? "Bezig…" : "Opnieuw versturen"}
                  </button>
                </div>
              )}
              {selectedSent.suppressed && <p className="rounded bg-warn/10 px-2 py-1 text-xs text-warn">Niet verzonden — ontvanger is {selectedSent.suppressed}.</p>}
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-paper-soft p-4 text-sm text-ink-soft">{selectedSent.text}</pre>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutralx-400">
              <p>Selecteer een bericht om te lezen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
