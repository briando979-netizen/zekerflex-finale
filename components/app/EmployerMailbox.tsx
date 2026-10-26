"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MailToolsBar } from "@/components/mail/MailToolsBar";
import { MAIL_PRESETS, OAUTH_ONLY_DOMAINS, OAUTH_ONLY_NOTE, domainOf, suggestServers, type ServerSettings } from "@/lib/mail/presets";

type Dict = Record<
  | "title" | "subtitle" | "tabInbox" | "tabZekerflex" | "tabSent" | "search" | "compose" | "refresh" | "loading" | "empty"
  | "nothingFound" | "selectMessage" | "noSubject" | "unknownSender" | "from" | "to" | "reply" | "unread" | "newMessage"
  | "toPlaceholder" | "subjectPlaceholder" | "bodyPlaceholder" | "send" | "sending" | "sentOk" | "sendFailed" | "sentFromNote"
  | "connectedAs" | "disconnect" | "disconnectConfirm" | "notConnectedTitle" | "notConnectedBody" | "connectInboxHint"
  | "provider" | "providerOther" | "email" | "password" | "displayName" | "advanced" | "username" | "imapServer" | "smtpServer"
  | "connect" | "connecting" | "connectFailed" | "securityNote" | "zekerflexEmpty" | "sentEmpty" | "sentNote",
  string
>;

interface Connection {
  email: string;
  displayName: string | null;
  username: string;
  imap: ServerSettings;
  smtp: ServerSettings;
  connectedAt: string;
}
interface InboxMsg {
  uid: number;
  date: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  replyToAddress: string | null;
  messageId: string | null;
  seen: boolean;
}
interface PlatformMsg {
  id: string;
  at: string;
  subject: string;
  text: string;
}
interface SentMsg {
  id: string;
  at: string;
  to: string;
  subject: string;
  text: string;
}
interface Attachment {
  index: number;
  filename: string;
  size: number;
}

type Tab = "inbox" | "zekerflex" | "sent";
type Selection = { tab: Tab; id: string } | { tab: "compose" } | null;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
const when = (d: string | null) => (d ? new Date(d).toLocaleString("nl-NL") : "");
const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

async function readError(res: Response, fallback: string): Promise<string> {
  const d = await res.json().catch(() => ({}));
  return d?.error?.message ?? fallback;
}

export function EmployerMailbox({ t, userEmail }: { t: Dict; userEmail: string }) {
  const [status, setStatus] = useState<{ connected: boolean; connection: Connection | null } | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState("");

  const [inbox, setInbox] = useState<InboxMsg[]>([]);
  const [inboxState, setInboxState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [bodies, setBodies] = useState<Record<number, { text: string; attachments: Attachment[] }>>({});
  const [bodyLoading, setBodyLoading] = useState<number | null>(null);
  const [platform, setPlatform] = useState<PlatformMsg[] | null>(null);
  const [sent, setSent] = useState<SentMsg[] | null>(null);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [inReplyTo, setInReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/me/mailbox/inbox", { cache: "no-store" });
      if (!res.ok) return setInboxState({ loading: false, error: await readError(res, "Postvak in kon niet worden geladen.") });
      const d = await res.json();
      setInbox(d.messages);
      setInboxState({ loading: false, error: null });
    } catch {
      setInboxState({ loading: false, error: "Postvak in kon niet worden geladen." });
    }
  }, []);

  const loadSent = useCallback(async () => {
    const res = await fetch("/api/me/mailbox/sent", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSent((await res.json()).messages);
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/me/mailbox", { cache: "no-store" }).catch(() => null);
    const d = res?.ok ? await res.json() : { connected: false, connection: null };
    setStatus(d);
    if (d.connected) {
      void loadInbox();
      void loadSent();
    } else {
      setTab((cur) => (cur === "inbox" ? "zekerflex" : cur));
    }
  }, [loadInbox, loadSent]);

  useEffect(() => {
    void loadStatus();
    fetch("/api/me/mailbox/zekerflex", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setPlatform(d.messages))
      .catch(() => setPlatform([]));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadInbox();
    }, 60_000);
    return () => clearInterval(id);
  }, [status?.connected, loadInbox]);

  async function openInbox(uid: number) {
    setSelection({ tab: "inbox", id: String(uid) });
    if (bodies[uid]) return;
    setBodyLoading(uid);
    try {
      const res = await fetch(`/api/me/mailbox/inbox/${uid}`, { cache: "no-store" });
      if (!res.ok) {
        const message = await readError(res, "Kon bericht niet laden.");
        setBodies((b) => ({ ...b, [uid]: { text: message, attachments: [] } }));
        return;
      }
      const d = await res.json();
      setBodies((b) => ({ ...b, [uid]: { text: d.text, attachments: Array.isArray(d.attachments) ? d.attachments : [] } }));
      setInbox((list) => list.map((m) => (m.uid === uid ? { ...m, seen: true } : m)));
    } finally {
      setBodyLoading(null);
    }
  }

  function startReply(m: InboxMsg) {
    setTo(m.replyToAddress ?? m.fromAddress ?? "");
    setSubject(m.subject && /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject ?? ""}`);
    setBody("");
    setInReplyTo(m.messageId);
    setSendNote(null);
    setSelection({ tab: "compose" });
  }

  function startNew() {
    setTo("");
    setSubject("");
    setBody("");
    setInReplyTo(null);
    setSendNote(null);
    setSelection({ tab: "compose" });
  }

  async function send() {
    setSending(true);
    setSendNote(null);
    try {
      const res = await fetch("/api/me/mailbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text: body, ...(inReplyTo ? { inReplyTo } : {}) }),
      });
      if (!res.ok) return setSendNote(await readError(res, t.sendFailed));
      setSendNote(fill(t.sentOk, { to }));
      setTo("");
      setSubject("");
      setBody("");
      setInReplyTo(null);
      void loadSent();
    } catch {
      setSendNote(t.sendFailed);
    } finally {
      setSending(false);
    }
  }

  async function disconnect() {
    if (!status?.connection || !window.confirm(fill(t.disconnectConfirm, { email: status.connection.email }))) return;
    await fetch("/api/me/mailbox", { method: "DELETE" }).catch(() => undefined);
    setInbox([]);
    setBodies({});
    setSelection(null);
    await loadStatus();
  }

  const q = query.trim().toLowerCase();
  const inboxShown = useMemo(
    () => inbox.filter((m) => !q || [m.subject, m.fromName, m.fromAddress].some((v) => (v ?? "").toLowerCase().includes(q))),
    [inbox, q],
  );
  const platformShown = useMemo(() => (platform ?? []).filter((m) => !q || m.subject.toLowerCase().includes(q)), [platform, q]);
  const sentShown = useMemo(
    () => (sent ?? []).filter((m) => !q || m.subject.toLowerCase().includes(q) || m.to.toLowerCase().includes(q)),
    [sent, q],
  );
  const unread = inbox.filter((m) => !m.seen).length;

  const selInbox = selection?.tab === "inbox" ? inbox.find((m) => String(m.uid) === selection.id) : null;
  const selPlatform = selection?.tab === "zekerflex" ? platform?.find((m) => m.id === selection.id) : null;
  const selSent = selection?.tab === "sent" ? sent?.find((m) => m.id === selection.id) : null;
  const connected = Boolean(status?.connected);

  const tabButton = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(key);
        setSelection(null);
      }}
      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold sm:text-sm ${tab === key ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}
    >
      {label}
    </button>
  );

  const listItem = (key: string, active: boolean, onClick: () => void, title: string, sub: string, at: string, bold = false) => (
    <li key={key}>
      <button type="button" onClick={onClick} className={`flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-paper-soft ${active ? "bg-paper-soft" : ""}`}>
        {bold && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" aria-label={t.unread} />}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${bold ? "font-semibold text-ink" : "text-ink-soft"}`}>{title}</span>
          <span className="block truncate text-xs text-neutralx-500">{sub}</span>
          <span className="block text-[11px] text-neutralx-400">{at}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t.title}</h1>
          <p className="mt-1 text-sm text-neutralx-600">{t.subtitle}</p>
        </div>
        {status?.connection && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-ok/10 px-3 py-1 font-semibold text-ok">{fill(t.connectedAs, { email: status.connection.email })}</span>
            <button type="button" onClick={disconnect} className="text-neutralx-500 underline hover:text-crit">
              {t.disconnect}
            </button>
          </div>
        )}
      </div>

      <div className="card grid overflow-hidden sm:grid-cols-[280px_1fr] md:grid-cols-[320px_1fr]" style={{ minHeight: 560 }}>
        <div className="flex flex-col border-b border-hair sm:border-b-0 sm:border-r">
          <div className="flex items-center gap-1 border-b border-hair p-2">
            {tabButton("inbox", `${t.tabInbox}${unread > 0 ? ` (${unread})` : ""}`)}
            {tabButton("zekerflex", t.tabZekerflex)}
            {tabButton("sent", t.tabSent)}
          </div>
          <div className="flex items-center gap-2 border-b border-hair px-3 py-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm outline-none placeholder:text-neutralx-400" />
            {connected && (
              <button type="button" onClick={startNew} className="flex-shrink-0 rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-white">
                {t.compose}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "inbox" ? (
              !status ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
              ) : !connected ? (
                <p className="px-4 py-8 text-center text-sm text-neutralx-500">{t.connectInboxHint}</p>
              ) : inboxState.error ? (
                <p className="px-4 py-6 text-sm text-crit">{inboxState.error}</p>
              ) : inboxState.loading && inbox.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
              ) : inboxShown.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{q ? t.nothingFound : t.empty}</p>
              ) : (
                <ul className="divide-y divide-hair">
                  {inboxShown.map((m) =>
                    listItem(
                      String(m.uid),
                      selection?.tab === "inbox" && selection.id === String(m.uid),
                      () => void openInbox(m.uid),
                      m.subject || t.noSubject,
                      m.fromName || m.fromAddress || t.unknownSender,
                      when(m.date),
                      !m.seen,
                    ),
                  )}
                </ul>
              )
            ) : tab === "zekerflex" ? (
              platform === null ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
              ) : platformShown.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutralx-400">{q ? t.nothingFound : fill(t.zekerflexEmpty, { email: userEmail })}</p>
              ) : (
                <ul className="divide-y divide-hair">
                  {platformShown.map((m) =>
                    listItem(m.id, selection?.tab === "zekerflex" && selection.id === m.id, () => setSelection({ tab: "zekerflex", id: m.id }), m.subject, "ZekerFlex", when(m.at)),
                  )}
                </ul>
              )
            ) : sentShown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutralx-400">{q ? t.nothingFound : t.sentEmpty}</p>
            ) : (
              <ul className="divide-y divide-hair">
                {sentShown.map((m) =>
                  listItem(m.id, selection?.tab === "sent" && selection.id === m.id, () => setSelection({ tab: "sent", id: m.id }), m.subject, `${t.to} ${m.to}`, when(m.at)),
                )}
              </ul>
            )}
          </div>

          {connected && tab === "inbox" && (
            <div className="flex justify-end border-t border-hair px-4 py-2 text-[11px] text-neutralx-500">
              <button type="button" onClick={() => void loadInbox()} className="font-semibold hover:text-ink">
                {inboxState.loading ? t.loading : t.refresh}
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-y-auto">
          {status && !connected && tab === "inbox" ? (
            <ConnectForm t={t} onConnected={() => void loadStatus().then(() => setTab("inbox"))} />
          ) : selection?.tab === "compose" ? (
            <div className="space-y-3 p-6">
              <h2 className="font-display text-lg font-bold">{t.newMessage}</h2>
              {status?.connection && <p className="text-xs text-neutralx-500">{fill(t.sentFromNote, { email: status.connection.email })}</p>}
              <MailToolsBar
                onInsert={(tpl) => {
                  if (tpl.subject && !subject.trim()) setSubject(tpl.subject);
                  setBody((cur) => (cur.trim() ? `${cur.trimEnd()}

${tpl.body}` : tpl.body));
                }}
              />
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t.toPlaceholder} className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPlaceholder} className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.bodyPlaceholder} rows={12} className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !to.includes("@") || !subject.trim() || !body.trim()}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {sending ? t.sending : t.send}
                </button>
                {sendNote && <span className="text-sm text-neutralx-700">{sendNote}</span>}
              </div>
            </div>
          ) : selInbox ? (
            <div className="space-y-3 p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-bold">{selInbox.subject || t.noSubject}</h2>
                {(selInbox.replyToAddress || selInbox.fromAddress) && (
                  <button type="button" onClick={() => startReply(selInbox)} className="btn-ghost flex-shrink-0 text-xs">
                    {t.reply}
                  </button>
                )}
              </div>
              <p className="text-xs text-neutralx-500">
                {t.from} {selInbox.fromName ? `${selInbox.fromName} ` : ""}
                {selInbox.fromAddress ? `<${selInbox.fromAddress}>` : ""}
                {selInbox.date ? ` · ${when(selInbox.date)}` : ""}
              </p>
              {bodyLoading === selInbox.uid ? (
                <p className="text-sm text-neutralx-500">{t.loading}</p>
              ) : (
                <>
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-paper-soft p-4 text-sm text-ink-soft">{bodies[selInbox.uid]?.text ?? ""}</pre>
                  {(bodies[selInbox.uid]?.attachments.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {bodies[selInbox.uid]!.attachments.map((a) => (
                        <a
                          key={a.index}
                          href={`/api/me/mailbox/inbox/${selInbox.uid}/attachment/${a.index}`}
                          className="flex items-center gap-1.5 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
                        >
                          📎 {a.filename} <span className="font-normal text-neutralx-400">({size(a.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : selPlatform ? (
            <div className="space-y-3 p-6">
              <span className="pill-neutral">ZekerFlex</span>
              <h2 className="font-display text-lg font-bold">{selPlatform.subject}</h2>
              <p className="text-xs text-neutralx-500">{when(selPlatform.at)}</p>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-paper-soft p-4 text-sm text-ink-soft">{selPlatform.text}</pre>
            </div>
          ) : selSent ? (
            <div className="space-y-3 p-6">
              <h2 className="font-display text-lg font-bold">{selSent.subject}</h2>
              <p className="text-xs text-neutralx-500">
                {t.to} {selSent.to} · {when(selSent.at)}
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-hair bg-paper-soft p-4 text-sm text-ink-soft">{selSent.text}</pre>
              <p className="text-xs text-neutralx-400">{t.sentNote}</p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutralx-400">{t.selectMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectForm({ t, onConnected }: { t: Dict; onConnected: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [presetId, setPresetId] = useState("other");
  const [advanced, setAdvanced] = useState(false);
  const [username, setUsername] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = MAIL_PRESETS.find((p) => p.id === presetId);
  const oauthOnly = OAUTH_ONLY_DOMAINS.includes(domainOf(email));

  function applyServers(imap: ServerSettings, smtp: ServerSettings) {
    setImapHost(imap.host);
    setSmtpHost(smtp.host);
    setSmtpPort(smtp.port);
  }

  function onEmailBlur() {
    if (!email.includes("@")) return;
    const s = suggestServers(email);
    setPresetId(s.presetId);
    applyServers(s.imap, s.smtp);
  }

  function onPreset(id: string) {
    setPresetId(id);
    const p = MAIL_PRESETS.find((x) => x.id === id);
    if (p) applyServers(p.imap, p.smtp);
    else if (email.includes("@")) {
      const s = suggestServers(email);
      applyServers(s.imap, s.smtp);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/mailbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(displayName.trim() ? { displayName } : {}),
          ...(username.trim() ? { username } : {}),
          imap: { host: imapHost, port: 993, secure: true },
          smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465 },
        }),
      });
      if (!res.ok) return setError(await readError(res, t.connectFailed));
      setPassword("");
      onConnected();
    } catch {
      setError(t.connectFailed);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{t.notConnectedTitle}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.notConnectedBody}</p>
      </div>
      <label className="block text-xs font-semibold text-neutralx-600">
        {t.email}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={onEmailBlur} autoComplete="email" className={`${field} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-neutralx-600">
        {t.provider}
        <select value={presetId} onChange={(e) => onPreset(e.target.value)} className={`${field} mt-1`}>
          {MAIL_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="other">{t.providerOther}</option>
        </select>
      </label>
      {oauthOnly ? (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink">{OAUTH_ONLY_NOTE}</p>
      ) : (
        preset?.note && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-neutralx-700">{preset.note}</p>
      )}
      <label className="block text-xs font-semibold text-neutralx-600">
        {t.password}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={`${field} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-neutralx-600">
        {t.displayName}
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={`${field} mt-1`} />
      </label>

      <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs font-semibold text-brand-600 hover:underline">
        {advanced ? "▾" : "▸"} {t.advanced}
      </button>
      {advanced && (
        <div className="space-y-3 rounded-lg border border-hair p-3">
          <label className="block text-xs font-semibold text-neutralx-600">
            {t.username}
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={email} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-neutralx-600">
            {t.imapServer}
            <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block text-xs font-semibold text-neutralx-600">
              {t.smtpServer}
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs font-semibold text-neutralx-600">
              &nbsp;
              <select value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className={`${field} mt-1`}>
                <option value={465}>465 · SSL/TLS</option>
                <option value={587}>587 · STARTTLS</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <p className="text-xs text-neutralx-500">{t.securityNote}</p>
      <button
        type="button"
        onClick={connect}
        disabled={busy || oauthOnly || !email.includes("@") || !password || !imapHost || !smtpHost}
        className="btn-primary w-full text-sm disabled:opacity-50"
      >
        {busy ? t.connecting : t.connect}
      </button>
      {error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
    </div>
  );
}
