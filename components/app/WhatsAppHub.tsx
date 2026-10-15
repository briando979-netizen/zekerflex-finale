"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Dict = Record<
  | "title" | "subtitle" | "liveTitle" | "liveBody" | "importTitle" | "importChatHelp" | "importContactsHelp" | "chooseFile"
  | "uploading" | "importedChat" | "importedContacts" | "importFailed" | "tooBig" | "tabChats" | "tabContacts" | "noChats"
  | "noContacts" | "messages" | "selectChat" | "system" | "media" | "deleteChat" | "deleteChatConfirm" | "clearContacts"
  | "clearContactsConfirm" | "searchContacts" | "openWhatsApp" | "call" | "loading",
  string
>;

interface Chat {
  id: string;
  title: string;
  participants: string[];
  messageCount: number;
  firstAt: string | null;
  lastAt: string | null;
}
interface Message {
  at: string;
  author: string | null;
  text: string;
  media: boolean;
}
interface Contact {
  name: string;
  phones: string[];
  emails: string[];
  organization: string | null;
}

const MAX_BYTES = 4 * 1024 * 1024;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "");
const time = (d: string) => new Date(d).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function WhatsAppHub({ t }: { t: Dict }) {
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [active, setActive] = useState<{ chat: Chat; messages: Message[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/me/whatsapp", { cache: "no-store" }).catch(() => null);
    setChats(res?.ok ? (await res.json()).chats : []);
  }, []);
  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/me/whatsapp/contacts", { cache: "no-store" }).catch(() => null);
    setContacts(res?.ok ? (await res.json()).contacts : []);
  }, []);

  useEffect(() => {
    void loadChats();
    void loadContacts();
  }, [loadChats, loadContacts]);

  async function upload(file: File) {
    setNote(null);
    if (file.size > MAX_BYTES) return setNote({ ok: false, text: t.tooBig });
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/me/whatsapp/import", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setNote({ ok: false, text: d?.error?.message ?? t.importFailed });
      if (d.kind === "chat") {
        setNote({ ok: true, text: fill(t.importedChat, { title: d.chat.title, count: d.chat.messageCount }) });
        setTab("chats");
        await loadChats();
        await openChat(d.chat.id);
      } else {
        setNote({ ok: true, text: fill(t.importedContacts, { count: d.imported, total: d.total }) });
        setTab("contacts");
        await loadContacts();
      }
    } catch {
      setNote({ ok: false, text: t.importFailed });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openChat(id: string) {
    const res = await fetch(`/api/me/whatsapp/chats/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setActive(await res.json());
  }

  async function removeChat(chat: Chat) {
    if (!window.confirm(fill(t.deleteChatConfirm, { title: chat.title }))) return;
    await fetch(`/api/me/whatsapp/chats/${chat.id}`, { method: "DELETE" }).catch(() => undefined);
    setActive(null);
    await loadChats();
  }

  async function wipeContacts() {
    if (!window.confirm(t.clearContactsConfirm)) return;
    await fetch("/api/me/whatsapp/contacts", { method: "DELETE" }).catch(() => undefined);
    await loadContacts();
  }

  const q = query.trim().toLowerCase();
  const shownContacts = useMemo(
    () =>
      (contacts ?? []).filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.phones.some((p) => p.includes(q.replace(/[^\d+]/g, "") || "~")) || c.emails.some((e) => e.includes(q)),
      ),
    [contacts, q],
  );

  // The chat title comes from "WhatsApp-chat met <naam>", i.e. the other party:
  // their bubbles go left, the importer's right. Group chats: everyone left.
  const otherSide = active && active.chat.participants.includes(active.chat.title) ? active.chat.title : null;
  const onLeft = (author: string) => !otherSide || author === otherSide;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-neutralx-600">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-ink">{t.importTitle}</p>
          <p className="text-sm text-neutralx-600">{t.importChatHelp}</p>
          <p className="text-sm text-neutralx-600">{t.importContactsHelp}</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.zip,.vcf,text/plain,text/vcard,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
              {busy ? t.uploading : t.chooseFile}
            </button>
            {note && <span className={`text-sm ${note.ok ? "text-ok" : "text-crit"}`}>{note.text}</span>}
          </div>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">{t.liveTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-neutralx-500">{t.liveBody}</p>
        </div>
      </div>

      <div className="flex gap-1">
        {(["chats", "contacts"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600 hover:text-ink"}`}
          >
            {k === "chats" ? `${t.tabChats}${chats ? ` (${chats.length})` : ""}` : `${t.tabContacts}${contacts ? ` (${contacts.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "chats" ? (
        <div className="card grid overflow-hidden sm:grid-cols-[280px_1fr]" style={{ minHeight: 520 }}>
          <div className="border-b border-hair sm:border-b-0 sm:border-r">
            {chats === null ? (
              <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
            ) : chats.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.noChats}</p>
            ) : (
              <ul className="divide-y divide-hair">
                {chats.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void openChat(c.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-paper-soft ${active?.chat.id === c.id ? "bg-paper-soft" : ""}`}
                    >
                      <span className="block truncate text-sm font-semibold text-ink">{c.title}</span>
                      <span className="block text-xs text-neutralx-500">
                        {c.messageCount} {t.messages} · {day(c.firstAt)} – {day(c.lastAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex min-h-0 flex-col">
            {active ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-hair px-4 py-2.5">
                  <p className="truncate text-sm font-semibold text-ink">{active.chat.title}</p>
                  <button type="button" onClick={() => void removeChat(active.chat)} className="text-xs text-neutralx-500 underline hover:text-crit">
                    {t.deleteChat}
                  </button>
                </div>
                <div className="max-h-[560px] flex-1 space-y-1.5 overflow-y-auto bg-paper-soft px-4 py-3">
                  {active.messages.map((m, i) =>
                    !m.author ? (
                      <p key={i} className="py-1 text-center text-[11px] text-neutralx-400">
                        {m.text}
                      </p>
                    ) : (
                      <div key={i} className={`flex ${onLeft(m.author) ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${onLeft(m.author) ? "rounded-bl-sm bg-white" : "rounded-br-sm bg-[#DCF8C6]"}`}>
                          <p className="text-[11px] font-semibold text-brand-600">{m.author}</p>
                          <p className="whitespace-pre-wrap break-words text-ink">{m.media ? t.media : m.text}</p>
                          <p className="mt-0.5 text-right text-[10px] text-neutralx-400">{time(m.at)}</p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-neutralx-400">{t.selectChat}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-hair px-4 py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchContacts}
              className="min-w-0 flex-1 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm"
            />
            {(contacts?.length ?? 0) > 0 && (
              <button type="button" onClick={() => void wipeContacts()} className="text-xs text-neutralx-500 underline hover:text-crit">
                {t.clearContacts}
              </button>
            )}
          </div>
          {contacts === null ? (
            <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.loading}</p>
          ) : shownContacts.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutralx-400">{t.noContacts}</p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-hair overflow-y-auto">
              {shownContacts.map((c, i) => (
                <li key={`${c.name}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-xs text-neutralx-500">
                      {[c.organization, ...c.phones, ...c.emails].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 gap-2 text-xs font-semibold">
                    {c.phones[0] && (
                      <>
                        <a href={`https://wa.me/${c.phones[0].replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                          {t.openWhatsApp}
                        </a>
                        <a href={`tel:${c.phones[0]}`} className="text-brand-600 hover:underline">
                          {t.call}
                        </a>
                      </>
                    )}
                    {c.emails[0] && (
                      <a href={`mailto:${c.emails[0]}`} className="text-brand-600 hover:underline">
                        e-mail
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
