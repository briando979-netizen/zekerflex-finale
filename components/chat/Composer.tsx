"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { fmtBytes, fmtDuration, type Msg } from "./shared";
import { readDraft, writeDraft } from "./drafts";
import { Portal } from "./Portal";
import { PollMaker } from "./PollMaker";
import { IconPaperclip, IconMic, IconSend, IconBolt, IconSparkle, IconSmiley, IconClose, IconReply, IconPencil } from "./icons";

export interface OutgoingMessage {
  text: string;
  kind: Msg["kind"];
  attachment?: { mediaId: string; filename: string; mimeType: string; sizeBytes: number; durationSec?: number };
  location?: { lat: number; lng: number; label?: string };
  replyToId?: string;
  /** set: this rewrites your own message instead of sending a new one */
  editId?: string;
  /** kind "poll": de vraag is `text` */
  poll?: { options: string[]; multi: boolean };
}

// Veelgebruikte emoji voor op een computer (een telefoon heeft ze op het toetsenbord).
const EMOJI = [
  "😀", "😂", "😊", "😍", "🙂", "😉", "😅", "🤔", "😮", "😢", "😡", "🙏",
  "👍", "👎", "👌", "👏", "💪", "🤝", "👋", "✌️", "❤️", "🔥", "🎉", "✅",
  "❌", "⏰", "📅", "📍", "🚗", "☕", "🍕", "💶", "📞", "✉️", "⭐", "💯",
];

const HOVER = "(hover: hover)";

/** Voorbeeld van een foto of bestand vóór het versturen, met een onderschrift (zoals WhatsApp). */
function AttachPreview({
  file,
  kind,
  onSend,
  onCancel,
}: {
  file: File;
  kind: "image" | "file";
  onSend: (caption: string) => void;
  onCancel: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "image") return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <form
          role="dialog"
          aria-modal="true"
          aria-label={kind === "image" ? "Foto versturen" : "Bestand versturen"}
          className="chat-surface flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:max-w-md sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            onSend(caption.trim());
          }}
        >
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <p className="font-display text-sm font-bold text-ink">{kind === "image" ? "Foto versturen" : "Bestand versturen"}</p>
            <button type="button" onClick={onCancel} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Annuleren">
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center bg-[#EFEAE2] p-3">
            {kind === "image" && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Voorbeeld van de foto" className="max-h-[55vh] max-w-full rounded-lg object-contain shadow" />
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500 text-white" aria-hidden>📄</span>
                <span className="min-w-0">
                  <span className="block max-w-[16rem] truncate text-sm font-medium text-ink">{file.name}</span>
                  <span className="block text-xs text-neutralx-500">{fmtBytes(file.size)}</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 border-t border-hair bg-[#F0F2F5] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <textarea
              autoFocus
              rows={1}
              value={caption}
              maxLength={4000}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(caption.trim());
                }
              }}
              placeholder="Onderschrift toevoegen…"
              aria-label="Onderschrift"
              className="max-h-28 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-2 text-base shadow-sm outline-none md:text-sm"
            />
            <button type="submit" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#008069] text-white" aria-label="Verstuur">
              <IconSend className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

export function Composer({
  threadId,
  quickReplies,
  replyTo,
  onClearReply,
  onSend,
  onTyping,
  lastIncoming = "",
  editing = null,
  onCancelEdit,
  replyName,
  onEditLast,
  droppedFile = null,
  onDropHandled,
}: {
  /** text of the last message from the other side — for ✨ reply suggestions */
  lastIncoming?: string;
  threadId: string;
  quickReplies: string[];
  replyTo: Msg | null;
  onClearReply: () => void;
  onSend: (msg: OutgoingMessage) => Promise<void>;
  onTyping: () => void;
  /** your own message being edited (its text fills the field) */
  editing?: Msg | null;
  onCancelEdit?: () => void;
  /** naam van wie je beantwoordt ("Jezelf" bij je eigen bericht) */
  replyName?: string;
  /** ↑ in een leeg veld: je laatste eigen bericht bewerken */
  onEditLast?: () => void;
  /** een bestand dat op het gesprek is losgelaten (slepen) */
  droppedFile?: File | null;
  onDropHandled?: () => void;
}) {
  // what you typed stays as a draft per conversation (drafts.ts)
  const [text, setText] = useState(() => (editing ? editing.text : readDraft(threadId)));
  const taRef = useRef<HTMLTextAreaElement>(null);
  // editing starts: the field gets the message's text; editing stops: back to the draft
  const firstEdit = useRef(true);
  useEffect(() => {
    if (firstEdit.current) {
      firstEdit.current = false;
      if (!editing) return;
    }
    setText(editing ? editing.text : readDraft(threadId));
  }, [editing, threadId]);
  // the draft follows the field (not while editing an existing message)
  useEffect(() => {
    if (!editing) writeDraft(threadId, text);
  }, [text, editing, threadId]);
  // the field grows with the text, up to a limit
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);
  // choosing reply or edit puts the cursor in the field
  useEffect(() => {
    if (!replyTo && !editing) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [replyTo, editing]);

  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; kind: "image" | "file" } | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [hoverDevice, setHoverDevice] = useState(false);
  useEffect(() => {
    void setHoverDevice(window.matchMedia(HOVER).matches);
  }, []);

  async function aiSuggest() {
    setAiBusy(true);
    setAiNote(null);
    const r = await fetch("/api/me/chat-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggest", lastIncoming }) }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setAiSuggestions(d?.suggestions ?? []);
    if (!d?.suggestions?.length) setAiNote(lastIncoming ? "Geen voorstellen gevonden." : "Nog geen bericht om op te antwoorden.");
    setAiBusy(false);
  }

  async function aiRewrite(style: string) {
    if (!text.trim()) return;
    setAiBusy(true);
    setAiNote(null);
    const r = await fetch("/api/me/chat-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "rewrite", text, style }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setAiBusy(false);
    if (d?.text) setText(d.text);
    else setAiNote(d?.error?.message ?? (typeof d?.error === "string" ? d.error : null) ?? "Herschrijven lukte niet.");
  }
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStart = useRef(0);

  useEffect(() => () => {
    if (recTimer.current) clearInterval(recTimer.current);
    mediaRec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  // a file dropped on the conversation: same preview as picking one
  useEffect(() => {
    if (!droppedFile) return;
    setPreview({ file: droppedFile, kind: droppedFile.type.startsWith("image/") ? "image" : "file" });
    onDropHandled?.();
  }, [droppedFile, onDropHandled]);

  async function uploadMedia(file: Blob, filename: string, durationSec?: number) {
    const fd = new FormData();
    fd.append("file", file, filename);
    if (durationSec) fd.append("durationSec", String(durationSec));
    const r = await fetch(`/api/inbox/${threadId}/media`, { method: "POST", body: fd }).catch(() => null);
    if (!r) throw new Error("geen verbinding");
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      throw new Error(d?.error?.message ?? "uploaden is mislukt");
    }
    return (await r.json()).attachment as OutgoingMessage["attachment"];
  }

  const sendText = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    setEmojiOpen(false);
    try {
      if (editing) {
        await onSend({ text: t, kind: "text", editId: editing.id });
        onCancelEdit?.();
        return;
      }
      writeDraft(threadId, "");
      await onSend({ text: t, kind: "text", ...(replyTo ? { replyToId: replyTo.id } : {}) });
      onClearReply();
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  const sendFile = async (file: File, kind: "file" | "image", caption = "") => {
    setBusy(true);
    setMenuOpen(false);
    setSendError(null);
    try {
      const att = await uploadMedia(file, file.name || (kind === "image" ? "foto.png" : "bestand"));
      if (att) await onSend({ text: caption, kind, attachment: att, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      onClearReply();
    } catch (e) {
      // silently swallowing this made photos look broken ("werkte niet") without any hint why
      setSendError(`${kind === "image" ? "Foto" : "Bestand"} niet verstuurd: ${(e as Error).message}.`);
    } finally {
      setBusy(false);
    }
  };

  const pick = (kind: "file" | "image") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // cleared, so picking the same photo again fires onChange again
    e.target.value = "";
    setMenuOpen(false);
    if (f) setPreview({ file: f, kind: kind === "file" && f.type.startsWith("image/") ? "image" : kind });
  };

  // a screenshot pasted into the field goes to the preview, like in WhatsApp Web
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    setPreview({ file: f, kind: "image" });
  };

  const shareLocation = () => {
    setMenuOpen(false);
    setSendError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSendError("Je toestel of browser ondersteunt het delen van locatie niet.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setBusy(true);
        try {
          await onSend({
            text: "",
            kind: "location",
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Mijn locatie" },
          });
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setSendError(
          err.code === err.PERMISSION_DENIED
            ? "Geef deze site toegang tot je locatie (tik op het slotje in de adresbalk → Locatie toestaan) en probeer opnieuw."
            : err.code === err.TIMEOUT
              ? "Het bepalen van je locatie duurde te lang. Probeer het opnieuw."
              : "Je locatie kon niet worden bepaald. Zet locatie/GPS aan en probeer opnieuw.",
        );
      },
      // lagere nauwkeurigheid + een recente gecachete positie is prima voor delen
      // en lukt veel vaker/sneller dan high-accuracy GPS.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const startRecording = async () => {
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.max(1, Math.round((Date.now() - recStart.current) / 1000));
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setRecording(false);
        setRecSecs(0);
        if (blob.size < 800) return; // discarded / too short
        setBusy(true);
        setSendError(null);
        try {
          const att = await uploadMedia(blob, `spraak-${Date.now()}.webm`, secs);
          if (att) await onSend({ text: "", kind: "voice", attachment: att });
        } catch (e) {
          setSendError(`Spraakbericht niet verstuurd: ${(e as Error).message}.`);
        } finally {
          setBusy(false);
        }
      };
      mediaRec.current = rec;
      recStart.current = Date.now();
      rec.start();
      setRecording(true);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setSendError("Geen toegang tot je microfoon. Sta de microfoon toe in je browser en probeer opnieuw.");
    }
  };

  const stopRecording = (cancel = false) => {
    if (recTimer.current) clearInterval(recTimer.current);
    if (cancel) chunks.current = [];
    mediaRec.current?.stop();
  };

  const insertEmoji = (e: string) => {
    const ta = taRef.current;
    if (!ta) return setText((t) => t + e);
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + e.length, start + e.length);
    });
  };

  const anyPopover = menuOpen || emojiOpen;
  const roundBtn = "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft hover:text-ink";

  return (
    <div className="border-t border-hair bg-white">
      {editing && (
        <div className="flex items-center gap-2 border-b border-hair bg-paper-soft/60 px-3 py-2 text-xs">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center text-brand-600" aria-hidden><IconPencil className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 border-l-4 border-brand-500 pl-2">
            <span className="block font-semibold text-brand-700">Bericht bewerken</span>
            <span className="block truncate text-neutralx-600">{editing.text}</span>
          </span>
          <button type="button" onClick={onCancelEdit} aria-label="Bewerken stoppen" title="Stoppen (Esc)" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-black/5">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      {!editing && replyTo && (
        <div className="flex items-center gap-2 border-b border-hair bg-paper-soft/60 px-3 py-2 text-xs">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center text-brand-600" aria-hidden><IconReply className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 border-l-4 border-brand-500 pl-2">
            <span className="block font-semibold text-brand-700">{replyName ? `Antwoord aan ${replyName}` : "Antwoord"}</span>
            <span className="block truncate text-neutralx-600">
              {replyTo.text || (replyTo.kind === "image" ? "📷 Foto" : replyTo.kind === "voice" ? "🎤 Spraakbericht" : replyTo.kind === "file" ? "📎 Bestand" : replyTo.kind === "location" ? "📍 Locatie" : "bericht")}
            </span>
          </span>
          <button type="button" onClick={onClearReply} aria-label="Antwoord annuleren" title="Annuleren (Esc)" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-black/5">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {aiOpen && (
        <div className="space-y-2 border-b border-hair bg-brand-50/40 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-brand-700">✨ AI-hulp</span>
            {aiBusy && <span className="text-neutralx-500">bezig…</span>}
            {aiSuggestions.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-brand-500/40 bg-white px-2.5 py-1 text-neutralx-700 hover:border-brand-500">
                {s}
              </button>
            ))}
            <button type="button" onClick={() => setAiOpen(false)} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-neutralx-500 hover:bg-black/5" aria-label="AI-hulp sluiten">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
          {text.trim() && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-neutralx-500">Mijn tekst:</span>
              {(
                [
                  ["vriendelijk", "Vriendelijker"],
                  ["kort", "Korter"],
                  ["zakelijk", "Zakelijker"],
                  ["en", "→ Engels"],
                  ["pl", "→ Pools"],
                  ["de", "→ Duits"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" disabled={aiBusy} onClick={() => aiRewrite(k)} className="rounded-full border border-hairstrong bg-white px-2.5 py-1 hover:bg-paper-soft disabled:opacity-50">
                  {l}
                </button>
              ))}
            </div>
          )}
          {aiNote && <p className="text-neutralx-500">{aiNote}</p>}
        </div>
      )}

      {sendError && (
        <div role="alert" className="flex items-center gap-2 border-b border-hair bg-crit/10 px-3 py-1.5 text-xs text-crit">
          <span className="min-w-0 flex-1">{sendError}</span>
          <button type="button" onClick={() => setSendError(null)} className="grid h-6 w-6 place-items-center rounded-full text-neutralx-500 hover:bg-black/5" aria-label="Melding sluiten">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showQuick && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-hair p-2">
          {quickReplies.length === 0 && <span className="px-1 text-xs text-neutralx-500">Nog geen snelle antwoorden. Maak ze in Tools → Snelle antwoorden.</span>}
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setText((t) => (t ? `${t} ${q}` : q));
                setShowQuick(false);
                taRef.current?.focus();
              }}
              className="rounded-full border border-hairstrong px-2.5 py-1 text-xs text-neutralx-600 hover:bg-paper-soft"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 bg-[#F0F2F5] p-3" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-crit" aria-hidden />
          <span className="num font-mono text-sm">{fmtDuration(recSecs)}</span>
          <span className="text-sm text-neutralx-500">Opnemen…</span>
          <button type="button" onClick={() => stopRecording(true)} className="ml-auto rounded-full px-3 py-1.5 text-sm text-crit hover:bg-crit/10">
            Annuleer
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#008069] text-white"
            aria-label="Verstuur spraakbericht"
          >
            <IconSend className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendText();
          }}
          className="relative flex items-end gap-1.5 bg-[#F0F2F5] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {/* klik naast een open menu sluit het */}
          {anyPopover && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="fixed inset-0 z-[9] cursor-default"
              onClick={() => {
                setMenuOpen(false);
                setEmojiOpen(false);
              }}
            />
          )}
          {menuOpen && (
            <div className="absolute bottom-full left-2 z-10 mb-2 w-52 rounded-xl border border-hairstrong bg-white p-1 shadow-lift" role="menu">
              <MenuItem icon="🖼️" label="Foto" onClick={() => imgRef.current?.click()} />
              <MenuItem icon="📷" label="Camera" onClick={() => camRef.current?.click()} />
              <MenuItem icon="📄" label="Document" onClick={() => fileRef.current?.click()} />
              <MenuItem icon="📍" label="Locatie delen" onClick={shareLocation} />
              <MenuItem
                icon="📊"
                label="Peiling"
                onClick={() => {
                  setMenuOpen(false);
                  setPollOpen(true);
                }}
              />
            </div>
          )}
          {emojiOpen && (
            <div className="absolute bottom-full left-2 z-10 mb-2 grid w-[min(20rem,calc(100%-1rem))] grid-cols-8 gap-0.5 rounded-xl border border-hairstrong bg-white p-2 shadow-lift" role="menu" aria-label="Emoji">
              {EMOJI.map((e) => (
                <button key={e} type="button" role="menuitem" onClick={() => insertEmoji(e)} className="grid h-9 place-items-center rounded-lg text-xl hover:bg-paper-soft" aria-label={`Emoji ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          )}

          <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-[1.4rem] bg-white px-1 py-0.5 shadow-sm">
            {hoverDevice && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEmojiOpen((v) => !v);
                }}
                className={`${roundBtn} relative z-10 ${emojiOpen ? "text-brand-600" : ""}`}
                aria-label="Emoji"
                aria-expanded={emojiOpen}
              >
                <IconSmiley className="h-5 w-5" />
              </button>
            )}

            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onTyping();
              }}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendText();
                  return;
                }
                if (e.key === "Escape") {
                  if (anyPopover) {
                    setMenuOpen(false);
                    setEmojiOpen(false);
                  } else if (editing) onCancelEdit?.();
                  else if (replyTo) onClearReply();
                  return;
                }
                // ↑ in an empty field: edit your last message (like WhatsApp Web)
                if (e.key === "ArrowUp" && !text && !editing && onEditLast) {
                  e.preventDefault();
                  onEditLast();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={editing ? "Bewerk je bericht…" : "Typ een bericht"}
              aria-label="Bericht"
              className="max-h-40 min-h-[2.5rem] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-base leading-snug outline-none md:text-sm"
            />

            {!editing && (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuick((v) => !v)}
                  className={`${roundBtn} ${showQuick ? "text-brand-600" : ""}`}
                  aria-label="Snelle antwoorden"
                  aria-expanded={showQuick}
                  title="Snelle antwoorden"
                >
                  <IconBolt className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !aiOpen;
                    setAiOpen(next);
                    if (next) void aiSuggest();
                  }}
                  className={`${roundBtn} ${aiOpen ? "bg-brand-50 text-brand-600" : ""}`}
                  aria-label="AI-hulp"
                  aria-expanded={aiOpen}
                  title="AI-hulp: voorstellen en herschrijven"
                >
                  <IconSparkle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen(false);
                    setMenuOpen((v) => !v);
                  }}
                  className={`${roundBtn} relative z-10 ${menuOpen ? "text-brand-600" : ""}`}
                  aria-label="Bijlage"
                  aria-expanded={menuOpen}
                  title="Foto, camera, document of locatie"
                >
                  <IconPaperclip className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {text.trim() || editing ? (
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#008069] text-white transition-transform active:scale-95 disabled:opacity-40"
              aria-label={editing ? "Bewerking opslaan" : "Verstuur"}
            >
              {editing ? <span className="text-lg leading-none" aria-hidden>✓</span> : <IconSend className="h-5 w-5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#008069] text-white transition-transform active:scale-95"
              aria-label="Spraakbericht opnemen"
            >
              <IconMic className="h-5 w-5" />
            </button>
          )}

          <input ref={imgRef} type="file" accept="image/*" hidden onChange={pick("image")} />
          {/* on a phone this opens the camera straight away; a computer shows the file picker */}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick("image")} />
          <input ref={fileRef} type="file" hidden onChange={pick("file")} />
        </form>
      )}

      {preview && (
        <AttachPreview
          file={preview.file}
          kind={preview.kind}
          onCancel={() => setPreview(null)}
          onSend={(caption) => {
            const p = preview;
            setPreview(null);
            void sendFile(p.file, p.kind, caption);
          }}
        />
      )}

      {pollOpen && (
        <PollMaker
          onCancel={() => setPollOpen(false)}
          onSend={(p) => {
            setPollOpen(false);
            void onSend({ text: p.question, kind: "poll", poll: { options: p.options, multi: p.multi } });
          }}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutralx-700 hover:bg-paper-soft"
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
