"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { Portal } from "./Portal";
import type { ChatUser } from "./shared";
import { PushToggle } from "@/components/app/PushToggle";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";
import { opvolgerVan } from "./groep-opvolger";

export function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const chat = useChatTeksten();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="chat-surface max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-lg text-neutralx-400" aria-label={chat.modals.sluiten}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
    </Portal>
  );
}

export function PeoplePicker({
  title,
  cta,
  onClose,
  onPick,
}: {
  title: string;
  cta: string;
  onClose: () => void;
  onPick: (userId: string) => void;
}) {
  const chat = useChatTeksten();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<ChatUser[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/people/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setPeople(d.people ?? []);
          setAvatars(d.avatars ?? {});
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Shell title={title} onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={chat.modals.zoekPlaceholder}
        aria-label={chat.modals.zoekLabel}
        className="field-input mb-3"
      />
      {loading && <p className="text-sm text-neutralx-400">{chat.modals.zoeken}</p>}
      <ul className="space-y-1">
        {people.map((u) => (
          <li key={u.userId}>
            <button
              type="button"
              onClick={() => onPick(u.userId)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-paper-soft"
            >
              <Avatar userId={u.userId} name={u.name} role={u.role} avatars={avatars} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                <span className="block truncate text-xs text-neutralx-500">{u.meta}</span>
              </span>
              <span className="ml-auto text-xs font-medium text-brand-600">{cta}</span>
            </button>
          </li>
        ))}
        {!loading && people.length === 0 && (
          <p className="py-4 text-center text-sm text-neutralx-400">{chat.modals.niemandGevonden}</p>
        )}
      </ul>
    </Shell>
  );
}

export function CommunityCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string, threadId: string | null) => void;
}) {
  const chat = useChatTeksten();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        onCreated(d.community.id, d.community.threadId ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={chat.modals.nieuweCommunity} onClose={onClose}>
      <label className="field-label">{chat.modals.naam}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className="field-input mb-3" placeholder={chat.modals.naamPlaceholder} autoFocus />
      <label className="field-label">{chat.modals.omschrijving}</label>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="field-input mb-4" rows={3} placeholder={chat.modals.omschrijvingPlaceholder} />
      <button type="button" onClick={create} disabled={busy || name.trim().length < 2} className="btn-primary w-full disabled:opacity-40">
        {chat.modals.communityAanmaken}
      </button>
    </Shell>
  );
}

interface CommunityDetail {
  community: {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    members: { userId: string; role: string; joinedAt?: string }[];
    invites: { token: string; toUserId?: string; toEmail?: string; acceptedAt?: string }[];
    myRole: string | null;
    myUserId?: string;
  };
  directory: Record<string, ChatUser>;
  avatars: Record<string, string>;
}

export function CommunityManageModal({
  communityId,
  onClose,
  onChanged,
  onLeft,
}: {
  communityId: string;
  onClose: () => void;
  onChanged: () => void;
  /** je hebt de groep verlaten: het venster en het gesprek sluiten */
  onLeft?: () => void;
}) {
  const chat = useChatTeksten();
  const t = chat.modals;
  const [d, setD] = useState<CommunityDetail | null>(null);
  const [pick, setPick] = useState(false);
  const [bewerk, setBewerk] = useState<{ naam: string; omschrijving: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/communities/${communityId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  const c = d?.community;
  const canManage = c?.myRole === "owner" || c?.myRole === "admin";
  const naamVan = (id: string) => d?.directory[id]?.name ?? t.onbekend;
  const rol = (r: string) => (r === "owner" ? t.eigenaar : r === "admin" ? t.beheerder : t.lid);

  // elke wijziging: de serverversie opnieuw ophalen (AGENTS.md), en een fout in gewone taal
  const doe = async (pad: string, init: RequestInit) => {
    setFout(null);
    const r = await fetch(pad, init).catch(() => null);
    if (!r?.ok) {
      const body = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(body?.error?.message ?? t.datLukteNiet);
      return false;
    }
    await load();
    onChanged();
    return true;
  };

  const invite = async (userId: string) => {
    setPick(false);
    await doe(`/api/communities/${communityId}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
  };
  const remove = (userId: string) => doe(`/api/communities/${communityId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
  const zetRol = (userId: string, role: "admin" | "member") =>
    doe(`/api/communities/${communityId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
  const bewaar = async () => {
    if (!bewerk) return;
    const ok = await doe(`/api/communities/${communityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bewerk.naam.trim(), description: bewerk.omschrijving }),
    });
    if (ok) setBewerk(null);
  };
  const verlaat = async () => {
    if (!c) return;
    const opvolger = c.myRole === "owner" ? opvolgerVan(c.members, c.ownerId) : null;
    const vraag = opvolger ? vulIn(t.verlatenEigenaarConfirm, { naam: naamVan(opvolger) }) : t.verlatenConfirm;
    if (!window.confirm(vraag)) return;
    setFout(null);
    const r = await fetch(`/api/communities/${communityId}/members`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      const body = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(body?.error?.message ?? t.datLukteNiet);
      return;
    }
    onChanged();
    onLeft?.();
    onClose();
  };

  if (pick) {
    return <PeoplePicker title={t.uitnodigen} cta={t.nodigUit} onClose={() => setPick(false)} onPick={invite} />;
  }

  const alleenIk = Boolean(c && c.members.length <= 1);
  return (
    <Shell title={c?.name ?? t.community} onClose={onClose}>
      {c && (
        <>
          {bewerk ? (
            <div className="mb-4 space-y-2">
              <label className="block">
                <span className="field-label">{t.groepsnaam}</span>
                <input value={bewerk.naam} maxLength={80} onChange={(e) => setBewerk({ ...bewerk, naam: e.target.value })} className="field-input mt-1 w-full" />
              </label>
              <label className="block">
                <span className="field-label">{t.omschrijving}</span>
                <textarea value={bewerk.omschrijving} maxLength={400} rows={3} onChange={(e) => setBewerk({ ...bewerk, omschrijving: e.target.value })} className="field-input mt-1 w-full" />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={bewerk.naam.trim().length < 2} onClick={() => void bewaar()} className="btn-primary flex-1 text-sm disabled:opacity-50">
                  {t.opslaan}
                </button>
                <button type="button" onClick={() => setBewerk(null)} className="rounded-lg px-3 text-sm text-neutralx-500 hover:bg-paper-soft">
                  {t.annuleren}
                </button>
              </div>
            </div>
          ) : (
            <>
              {c.description && <p className="mb-3 text-sm text-neutralx-600">{c.description}</p>}
              {canManage && (
                <button type="button" onClick={() => setBewerk({ naam: c.name, omschrijving: c.description ?? "" })} className="mb-2 text-xs font-semibold text-brand-600 hover:underline">
                  {t.naamWijzigen}
                </button>
              )}
            </>
          )}
          {canManage && (
            <button type="button" onClick={() => setPick(true)} className="btn-primary mb-4 w-full text-sm">
              {t.ledenUitnodigen}
            </button>
          )}
          {fout && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
              {fout}
            </p>
          )}
          <p className="field-label">{vulIn(t.leden, { aantal: c.members.length })}</p>
          <ul className="mt-1 space-y-1">
            {c.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper-soft">
                <Avatar userId={m.userId} name={d.directory[m.userId]?.name ?? "…"} role={d.directory[m.userId]?.role ?? "employer"} avatars={d.avatars} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{naamVan(m.userId)}</span>
                  <span className="block text-xs text-neutralx-400">{rol(m.role)}</span>
                </span>
                {canManage && m.userId !== c.ownerId && m.userId !== c.myUserId && (
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <button type="button" onClick={() => void zetRol(m.userId, m.role === "admin" ? "member" : "admin")} className="text-xs text-brand-600 hover:underline">
                      {m.role === "admin" ? t.geenBeheerder : t.maakBeheerder}
                    </button>
                    <button type="button" onClick={() => void remove(m.userId)} className="text-xs text-neutralx-400 hover:text-crit">
                      {t.verwijder}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canManage && c.invites.filter((i) => !i.acceptedAt).length > 0 && (
            <>
              <p className="field-label mt-4">{t.openstaandeUitnodigingen}</p>
              <ul className="mt-1 space-y-1 text-sm text-neutralx-500">
                {c.invites.filter((i) => !i.acceptedAt).map((i) => (
                  <li key={i.token}>{i.toEmail ?? d.directory[i.toUserId ?? ""]?.name ?? t.uitnodiging}</li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-5 border-t border-hair pt-3">
            <button
              type="button"
              disabled={alleenIk}
              onClick={() => void verlaat()}
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-crit hover:bg-paper-soft disabled:opacity-50"
            >
              {t.groepVerlaten}
            </button>
            {alleenIk && <p className="mt-1 text-center text-xs text-neutralx-500">{t.verlatenAlleen}</p>}
          </div>
        </>
      )}
    </Shell>
  );
}

export interface ChatSettings {
  quickReplies: string[];
  autoReply: { enabled: boolean; text: string; onlyWhenAway: boolean };
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  statusNote: string;
}

export function ChatSettingsModal({ onClose }: { onClose: () => void }) {
  const chat = useChatTeksten();
  const [s, setS] = useState<ChatSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [quick, setQuick] = useState("");

  useEffect(() => {
    fetch("/api/chat/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setS(d.settings))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await fetch("/api/chat/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!s) return <Shell title={chat.modals.chatInstellingen} onClose={onClose}><p className="text-sm text-neutralx-400">{chat.modals.laden}</p></Shell>;

  return (
    <Shell title={chat.modals.chatInstellingen} onClose={onClose}>
      <div className="space-y-5">
        <PushToggle cardTexts={chat.instellingen.pushKaart} />
        <div>
          <label className="field-label">{chat.modals.statusbericht}</label>
          <input
            value={s.statusNote}
            onChange={(e) => setS({ ...s, statusNote: e.target.value })}
            className="field-input"
            placeholder={chat.modals.statusPlaceholder}
            maxLength={140}
          />
        </div>

        <div>
          <p className="field-label">{chat.modals.snelleAntwoorden}</p>
          <ul className="mb-2 space-y-1">
            {s.quickReplies.map((q, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-paper-soft px-2.5 py-1.5 text-sm">
                <span className="flex-1">{q}</span>
                <button
                  type="button"
                  onClick={() => setS({ ...s, quickReplies: s.quickReplies.filter((_, j) => j !== i) })}
                  className="text-xs text-neutralx-400 hover:text-crit"
                >
                  {chat.modals.verwijder}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input value={quick} onChange={(e) => setQuick(e.target.value)} className="field-input flex-1" placeholder={chat.modals.nieuwSnelAntwoord} />
            <button
              type="button"
              onClick={() => {
                if (quick.trim()) {
                  setS({ ...s, quickReplies: [...s.quickReplies, quick.trim()] });
                  setQuick("");
                }
              }}
              className="btn-ghost"
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-hair p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={s.autoReply.enabled}
              onChange={(e) => setS({ ...s, autoReply: { ...s.autoReply, enabled: e.target.checked } })}
            />
            {chat.modals.automatischAntwoord}
          </label>
          <textarea
            value={s.autoReply.text}
            onChange={(e) => setS({ ...s, autoReply: { ...s.autoReply, text: e.target.value } })}
            className="field-input mt-2"
            rows={2}
            disabled={!s.autoReply.enabled}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-neutralx-600">
            <input
              type="checkbox"
              checked={s.autoReply.onlyWhenAway}
              onChange={(e) => setS({ ...s, autoReply: { ...s.autoReply, onlyWhenAway: e.target.checked } })}
              disabled={!s.autoReply.enabled}
            />
            {chat.modals.alleenOffline}
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutralx-700">
          <input
            type="checkbox"
            checked={s.showOnlineStatus}
            onChange={(e) => setS({ ...s, showOnlineStatus: e.target.checked })}
          />
          {chat.modals.toonOnline}
        </label>
        <label className="flex items-center gap-2 text-sm text-neutralx-700">
          <input
            type="checkbox"
            checked={s.showReadReceipts}
            onChange={(e) => setS({ ...s, showReadReceipts: e.target.checked })}
          />
          {chat.modals.toonLeesbevestigingen}
        </label>

        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? chat.modals.opslaanBezig : chat.modals.opslaan}
        </button>
      </div>
    </Shell>
  );
}
