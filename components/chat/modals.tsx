"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { Portal } from "./Portal";
import type { ChatUser } from "./shared";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-lg text-neutralx-400" aria-label="Sluiten">
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
        placeholder="Zoek op naam…"
        className="field-input mb-3"
      />
      {loading && <p className="text-sm text-neutralx-400">Zoeken…</p>}
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
          <p className="py-4 text-center text-sm text-neutralx-400">Niemand gevonden.</p>
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
    <Shell title="Nieuwe community" onClose={onClose}>
      <label className="field-label">Naam</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className="field-input mb-3" placeholder="Bijv. Horeca Amsterdam" autoFocus />
      <label className="field-label">Omschrijving</label>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="field-input mb-4" rows={3} placeholder="Waar gaat deze community over?" />
      <button type="button" onClick={create} disabled={busy || name.trim().length < 2} className="btn-primary w-full disabled:opacity-40">
        Community aanmaken
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
    members: { userId: string; role: string }[];
    invites: { token: string; toUserId?: string; toEmail?: string; acceptedAt?: string }[];
    myRole: string | null;
  };
  directory: Record<string, ChatUser>;
  avatars: Record<string, string>;
}

export function CommunityManageModal({
  communityId,
  onClose,
  onChanged,
}: {
  communityId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<CommunityDetail | null>(null);
  const [pick, setPick] = useState(false);

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

  const invite = async (userId: string) => {
    setPick(false);
    await fetch(`/api/communities/${communityId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await load();
    onChanged();
  };
  const remove = async (userId: string) => {
    await fetch(`/api/communities/${communityId}/members?userId=${userId}`, { method: "DELETE" });
    await load();
    onChanged();
  };

  if (pick) {
    return <PeoplePicker title="Uitnodigen" cta="Nodig uit" onClose={() => setPick(false)} onPick={invite} />;
  }

  return (
    <Shell title={c?.name ?? "Community"} onClose={onClose}>
      {c && (
        <>
          {c.description && <p className="mb-3 text-sm text-neutralx-600">{c.description}</p>}
          {canManage && (
            <button type="button" onClick={() => setPick(true)} className="btn-primary mb-4 w-full text-sm">
              + Leden uitnodigen
            </button>
          )}
          <p className="field-label">Leden ({c.members.length})</p>
          <ul className="mt-1 space-y-1">
            {c.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper-soft">
                <Avatar userId={m.userId} name={d.directory[m.userId]?.name ?? "…"} role={d.directory[m.userId]?.role ?? "employer"} avatars={d.avatars} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{d.directory[m.userId]?.name ?? "Onbekend"}</span>
                  <span className="block text-xs text-neutralx-400">{m.role === "owner" ? "eigenaar" : m.role}</span>
                </span>
                {canManage && m.userId !== c.ownerId && (
                  <button type="button" onClick={() => remove(m.userId)} className="text-xs text-neutralx-400 hover:text-crit">verwijder</button>
                )}
              </li>
            ))}
          </ul>
          {canManage && c.invites.filter((i) => !i.acceptedAt).length > 0 && (
            <>
              <p className="field-label mt-4">Openstaande uitnodigingen</p>
              <ul className="mt-1 space-y-1 text-sm text-neutralx-500">
                {c.invites.filter((i) => !i.acceptedAt).map((i) => (
                  <li key={i.token}>{i.toEmail ?? d.directory[i.toUserId ?? ""]?.name ?? "Uitnodiging"}</li>
                ))}
              </ul>
            </>
          )}
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

  if (!s) return <Shell title="Chat-instellingen" onClose={onClose}><p className="text-sm text-neutralx-400">Laden…</p></Shell>;

  return (
    <Shell title="Chat-instellingen" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="field-label">Statusbericht</label>
          <input
            value={s.statusNote}
            onChange={(e) => setS({ ...s, statusNote: e.target.value })}
            className="field-input"
            placeholder="Bijv. Alleen weekenddiensten"
            maxLength={140}
          />
        </div>

        <div>
          <p className="field-label">Snelle antwoorden</p>
          <ul className="mb-2 space-y-1">
            {s.quickReplies.map((q, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-paper-soft px-2.5 py-1.5 text-sm">
                <span className="flex-1">{q}</span>
                <button
                  type="button"
                  onClick={() => setS({ ...s, quickReplies: s.quickReplies.filter((_, j) => j !== i) })}
                  className="text-xs text-neutralx-400 hover:text-crit"
                >
                  verwijder
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input value={quick} onChange={(e) => setQuick(e.target.value)} className="field-input flex-1" placeholder="Nieuw snel antwoord" />
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
            Automatisch antwoord
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
            Alleen als ik offline / buiten mijn actieve uren ben
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutralx-700">
          <input
            type="checkbox"
            checked={s.showOnlineStatus}
            onChange={(e) => setS({ ...s, showOnlineStatus: e.target.checked })}
          />
          Toon mijn online-status en “laatst gezien”
        </label>
        <label className="flex items-center gap-2 text-sm text-neutralx-700">
          <input
            type="checkbox"
            checked={s.showReadReceipts}
            onChange={(e) => setS({ ...s, showReadReceipts: e.target.checked })}
          />
          Toon leesbevestigingen
        </label>

        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </Shell>
  );
}
