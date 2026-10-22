"use client";

import { useRef, useState, type ReactNode } from "react";
import { Portal } from "./Portal";

export interface ThreadFlags {
  archived?: boolean;
  muted?: boolean;
  locked?: boolean;
  favorite?: boolean;
  lists?: string[];
}

/* ───────────────────────── swipe-to-reveal row ───────────────────────── */

const REVEAL = 148;

/**
 * A conversation row you can swipe to the LEFT (touch) to reveal
 * "Meer" and "Archiveer", WhatsApp-style. On a mouse device the ⋯ button
 * inside the row opens the same menu.
 */
export function SwipeRow({
  children,
  archived,
  onArchive,
  onMore,
}: {
  children: ReactNode;
  archived: boolean;
  onArchive: () => void;
  onMore: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const horizontal = useRef<boolean | null>(null);

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }} aria-hidden={dx === 0}>
        <button type="button" onClick={() => { setDx(0); onMore(); }} className="flex-1 bg-neutralx-400 text-xs font-semibold text-white">
          ⋯<br />Meer
        </button>
        <button type="button" onClick={() => { setDx(0); onArchive(); }} className="flex-1 bg-brand-600 text-xs font-semibold text-white">
          🗄<br />{archived ? "Terugzetten" : "Archiveer"}
        </button>
      </div>
      <div
        className="relative bg-white transition-transform duration-200"
        style={{ transform: `translateX(${dx}px)`, transitionDuration: start.current ? "0ms" : undefined }}
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          start.current = { x: t.clientX, y: t.clientY, base: dx };
          horizontal.current = null;
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const t = e.touches[0]!;
          const mx = t.clientX - start.current.x;
          const my = t.clientY - start.current.y;
          if (horizontal.current === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal.current = Math.abs(mx) > Math.abs(my);
          if (!horizontal.current) return;
          setDx(Math.max(-REVEAL, Math.min(0, start.current.base + mx)));
        }}
        onTouchEnd={() => {
          if (start.current && horizontal.current) setDx((v) => (v < -REVEAL / 2 ? -REVEAL : 0));
          start.current = null;
        }}
        onClickCapture={(e) => {
          // a tap on an opened row closes it instead of opening the chat
          if (dx !== 0) {
            e.stopPropagation();
            e.preventDefault();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────────── "Meer" menu ───────────────────────────── */

export type MenuAction =
  | { action: "archive" | "unarchive" | "lock" | "unlock" | "favorite" | "unfavorite" | "unmute" | "clear" | "delete" | "block" | "unblock" }
  | { action: "mute"; hours: number | null }
  | { action: "list-add" | "list-remove"; list: string }
  | { action: "disappear"; days: 0 | 1 | 7 | 90 };

export function ThreadMenuSheet({
  name,
  flags,
  direct,
  blocked,
  lists,
  onAction,
  onClose,
}: {
  name: string;
  flags: ThreadFlags;
  direct: boolean;
  blocked: boolean;
  lists: string[];
  onAction: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const [sub, setSub] = useState<null | "mute" | "list" | "disappear">(null);
  const [newList, setNewList] = useState("");
  const Item = ({ icon, label, danger, onClick }: { icon: string; label: string; danger?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-paper-soft ${danger ? "text-crit" : "text-ink"}`}>
      <span className="w-5 text-center">{icon}</span>
      {label}
    </button>
  );
  const done = (a: MenuAction) => {
    onAction(a);
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-3 shadow-lift sm:max-w-sm sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="truncate border-b border-hair px-5 py-3 font-display text-sm font-bold text-ink">{name}</p>

          {sub === "mute" ? (
            <>
              <Item icon="🔕" label="8 uur" onClick={() => done({ action: "mute", hours: 8 })} />
              <Item icon="🔕" label="1 week" onClick={() => done({ action: "mute", hours: 24 * 7 })} />
              <Item icon="🔕" label="Altijd" onClick={() => done({ action: "mute", hours: null })} />
              <Item icon="←" label="Terug" onClick={() => setSub(null)} />
            </>
          ) : sub === "disappear" ? (
            <>
              <p className="px-5 pt-3 text-xs text-neutralx-500">Nieuwe en oude berichten verdwijnen na de gekozen tijd — voor iedereen in deze chat.</p>
              <Item icon="⏱" label="24 uur" onClick={() => done({ action: "disappear", days: 1 })} />
              <Item icon="⏱" label="7 dagen" onClick={() => done({ action: "disappear", days: 7 })} />
              <Item icon="⏱" label="90 dagen" onClick={() => done({ action: "disappear", days: 90 })} />
              <Item icon="✕" label="Uit" onClick={() => done({ action: "disappear", days: 0 })} />
              <Item icon="←" label="Terug" onClick={() => setSub(null)} />
            </>
          ) : sub === "list" ? (
            <>
              {lists.map((l) =>
                flags.lists?.includes(l) ? (
                  <Item key={l} icon="✓" label={`${l} (verwijder uit lijst)`} onClick={() => done({ action: "list-remove", list: l })} />
                ) : (
                  <Item key={l} icon="＋" label={l} onClick={() => done({ action: "list-add", list: l })} />
                ),
              )}
              <div className="flex gap-2 px-5 py-2">
                <input value={newList} onChange={(e) => setNewList(e.target.value)} maxLength={30} placeholder="Nieuwe lijst, bijv. Werk" className="field-input flex-1 py-1.5 text-sm" />
                <button type="button" disabled={!newList.trim()} onClick={() => done({ action: "list-add", list: newList.trim() })} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                  Maak
                </button>
              </div>
              <Item icon="←" label="Terug" onClick={() => setSub(null)} />
            </>
          ) : (
            <>
              {flags.muted ? <Item icon="🔔" label="Dempen opheffen" onClick={() => done({ action: "unmute" })} /> : <Item icon="🔕" label="Dempen" onClick={() => setSub("mute")} />}
              {flags.locked ? <Item icon="🔓" label="Ontgrendel chat" onClick={() => done({ action: "unlock" })} /> : <Item icon="🔒" label="Vergrendel chat" onClick={() => done({ action: "lock" })} />}
              {flags.favorite ? <Item icon="☆" label="Verwijder uit favorieten" onClick={() => done({ action: "unfavorite" })} /> : <Item icon="★" label="Voeg toe aan favorieten" onClick={() => done({ action: "favorite" })} />}
              <Item icon="☰" label="Voeg toe aan lijst" onClick={() => setSub("list")} />
              <Item icon="⏱" label="Verdwijnende berichten" onClick={() => setSub("disappear")} />
              {flags.archived ? <Item icon="🗄" label="Uit archief halen" onClick={() => done({ action: "unarchive" })} /> : <Item icon="🗄" label="Archiveer chat" onClick={() => done({ action: "archive" })} />}
              <Item
                icon="🧹"
                label="Wis chat"
                onClick={() => {
                  if (window.confirm("Alle berichten in deze chat wissen? Alleen voor jou — de ander houdt ze.")) done({ action: "clear" });
                }}
              />
              {direct &&
                (blocked ? (
                  <Item icon="✋" label="Deblokkeer" onClick={() => done({ action: "unblock" })} />
                ) : (
                  <Item
                    icon="⛔"
                    label="Blokkeer"
                    danger
                    onClick={() => {
                      if (window.confirm(`${name} blokkeren? Jullie kunnen elkaar dan geen berichten meer sturen.`)) done({ action: "block" });
                    }}
                  />
                ))}
              <Item
                icon="🗑"
                label="Verwijder chat"
                danger
                onClick={() => {
                  if (window.confirm("Chat verwijderen? Hij verdwijnt uit je lijst tot er een nieuw bericht komt.")) done({ action: "delete" });
                }}
              />
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* ─────────────────────────────── PIN modal ─────────────────────────────── */

export function PinModal({ mode, onDone, onClose }: { mode: "set" | "unlock"; onDone: (pin: string) => Promise<string | null>; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4,6}$/.test(pin) && (mode === "unlock" || pin === pin2);
  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
        <form
          className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-lift"
          onClick={(e) => e.stopPropagation()}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(await onDone(pin));
            setBusy(false);
          }}
        >
          <p className="font-display text-base font-bold text-ink">{mode === "set" ? "Kies een chat-pincode" : "Vergrendelde chats"}</p>
          <p className="mt-1 text-xs text-neutralx-500">{mode === "set" ? "4 tot 6 cijfers. Je hebt hem nodig om vergrendelde chats te openen." : "Vul je chat-pincode in."}</p>
          <input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="field-input mt-3 text-center text-lg tracking-[0.5em]" />
          {mode === "set" && (
            <input type="password" inputMode="numeric" maxLength={6} placeholder="Herhaal" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className="field-input mt-2 text-center text-lg tracking-[0.5em]" />
          )}
          {err && <p className="mt-2 text-xs text-crit">{err}</p>}
          <button type="submit" disabled={!valid || busy} className="btn-primary mt-4 w-full disabled:opacity-50">
            {busy ? "…" : mode === "set" ? "Pincode instellen" : "Openen"}
          </button>
        </form>
      </div>
    </Portal>
  );
}
