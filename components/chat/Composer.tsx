"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { fmtBytes, fmtDuration, type Msg } from "./shared";
import { readDraft, writeDraft } from "./drafts";
import { Portal } from "./Portal";
import { PollMaker } from "./PollMaker";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";
import { IconPaperclip, IconMic, IconSend, IconBolt, IconSparkle, IconSmiley, IconClose, IconReply, IconPencil } from "./icons";
import { isFotoType } from "@/lib/messaging/bijlage";
import { BERICHT_MAX, isTeLang, tekstAlsBestand, tekstBestandNaam, voorproef } from "@/lib/chat/lange-tekst";
import { kandidaten, vermeldingenIn, vermeldingVraag, vulVermeldingIn, type Lid } from "@/lib/messaging/vermelding";

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
  /** @vermeldingen in een groep (userIds) */
  mentions?: string[];
  /** kind "image": maar één keer te bekijken */
  eenmalig?: boolean;
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
  onSend: (caption: string, eenmalig: boolean) => void;
  onCancel: () => void;
}) {
  const chat = useChatTeksten();
  const [caption, setCaption] = useState("");
  const [eenmalig, setEenmalig] = useState(false);
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
          aria-label={kind === "image" ? chat.composer.fotoVersturen : chat.composer.bestandVersturen}
          className="chat-surface flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:max-w-md sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            onSend(caption.trim(), eenmalig);
          }}
        >
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <p className="font-display text-sm font-bold text-ink">{kind === "image" ? chat.composer.fotoVersturen : chat.composer.bestandVersturen}</p>
            <button type="button" onClick={onCancel} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label={chat.composer.annuleren}>
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center bg-[#EFEAE2] p-3">
            {kind === "image" && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={chat.composer.voorbeeldFoto} className="max-h-[55vh] max-w-full rounded-lg object-contain shadow" />
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
            {kind === "image" && (
              // eenmalig bekijken (zoals WhatsApp): de ontvanger kan de foto één keer openen
              <button
                type="button"
                onClick={() => setEenmalig((v) => !v)}
                aria-pressed={eenmalig}
                aria-label={eenmalig ? chat.composer.eenmaligAan : chat.composer.eenmaligUit}
                title={eenmalig ? chat.composer.eenmaligAan : chat.composer.eenmaligUit}
                className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-xs font-bold shadow-sm ${eenmalig ? "bg-[#008069] text-white" : "bg-white text-neutralx-600"}`}
              >
                1×
              </button>
            )}
            <textarea
              autoFocus
              rows={1}
              value={caption}
              maxLength={BERICHT_MAX}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(caption.trim(), eenmalig);
                }
              }}
              placeholder={chat.composer.onderschriftPlaceholder}
              aria-label={chat.composer.onderschrift}
              className="max-h-28 min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-2 text-base shadow-sm outline-none md:text-sm"
            />
            <button type="submit" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#008069] text-white" aria-label={chat.composer.verstuur}>
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
  members = [],
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
  /** in een groep: de andere leden, voor @vermeldingen (leeg = geen lijst) */
  members?: Lid[];
}) {
  const chat = useChatTeksten();
  // what you typed stays as a draft per conversation (drafts.ts)
  const [text, setText] = useState(() => (editing ? editing.text : readDraft(threadId)));
  const taRef = useRef<HTMLTextAreaElement>(null);
  // @vermeldingen (groep): wat je na @ typt, en wie je al koos (lib/messaging/vermelding.ts)
  const [noem, setNoem] = useState<{ start: number; vraag: string; actief: number } | null>(null);
  const gekozen = useRef<Lid[]>([]);
  const kijkNoem = (waarde: string, cursor: number) => {
    const v = members.length ? vermeldingVraag(waarde, cursor) : null;
    setNoem((oud) => (v ? { ...v, actief: oud && oud.start === v.start ? oud.actief : 0 } : null));
  };
  const noemLijst = noem ? kandidaten(members, noem.vraag) : [];
  const kies = (lid: Lid) => {
    if (!noem) return;
    const ta = taRef.current;
    const r = vulVermeldingIn(text, noem.start, ta?.selectionStart ?? text.length, lid.name);
    setText(r.tekst);
    gekozen.current = [...gekozen.current.filter((x) => x.userId !== lid.userId), lid];
    setNoem(null);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(r.cursor, r.cursor);
    });
  };
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
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
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
    const r = await fetch("/api/me/chat-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggest", lastIncoming: lastIncoming.slice(0, 2000) }) }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setAiSuggestions(d?.suggestions ?? []);
    if (!d?.suggestions?.length) setAiNote(lastIncoming ? chat.composer.geenVoorstellen : chat.composer.nogGeenBericht);
    setAiBusy(false);
  }

  async function aiRewrite(style: string) {
    if (!text.trim()) return;
    // de AI-hulp leest hooguit 2000 tekens (app/api/me/chat-assist): zeg dat, in plaats van een onduidelijke fout
    if (text.trim().length > 2000) {
      setAiNote(chat.composer.teLangVoorAi);
      return;
    }
    setAiBusy(true);
    setAiNote(null);
    const r = await fetch("/api/me/chat-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "rewrite", text, style }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setAiBusy(false);
    if (d?.text) setText(d.text);
    else setAiNote(d?.error?.message ?? (typeof d?.error === "string" ? d.error : null) ?? chat.composer.herschrijvenMislukt);
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
    if (!r) throw new Error(chat.composer.geenVerbinding);
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      throw new Error(d?.error?.message ?? chat.composer.uploadenMislukt);
    }
    return (await r.json()).attachment as OutgoingMessage["attachment"];
  }

  const sendText = async () => {
    const t = text.trim();
    if (!t || busy) return;
    // langer dan één bericht mag zijn: als tekstbestand (lib/chat/lange-tekst.ts), zodat er niets wegvalt; de tekst blijft
    // in het veld staan tot het bestand echt verstuurd is
    if (isTeLang(t)) {
      if (editing) {
        setSendError(vulIn(chat.composer.teLangOmTeBewerken, { max: String(BERICHT_MAX) }));
        return;
      }
      setEmojiOpen(false);
      const bestand = tekstAlsBestand(t, tekstBestandNaam(chat.composer.langeTekstNaam, new Date()));
      if (await sendFile(bestand, "file", voorproef(t))) {
        setText("");
        writeDraft(threadId, "");
      }
      taRef.current?.focus();
      return;
    }
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
      const genoemd = vermeldingenIn(t, gekozen.current);
      gekozen.current = [];
      setNoem(null);
      await onSend({ text: t, kind: "text", ...(replyTo ? { replyToId: replyTo.id } : {}), ...(genoemd.length ? { mentions: genoemd } : {}) });
      onClearReply();
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  /** true als het bestand verstuurd is (een lange tekst blijft anders in het veld staan) */
  const sendFile = async (file: File, kind: "file" | "image", caption = "", eenmalig = false): Promise<boolean> => {
    setBusy(true);
    setMenuOpen(false);
    setSendError(null);
    try {
      const att = await uploadMedia(file, file.name || (kind === "image" ? "foto.png" : "bestand"));
      if (att) await onSend({ text: caption, kind, attachment: att, ...(replyTo ? { replyToId: replyTo.id } : {}), ...(eenmalig && kind === "image" ? { eenmalig: true } : {}) });
      onClearReply();
      return Boolean(att);
    } catch (e) {
      // silently swallowing this made photos look broken ("werkte niet") without any hint why
      setSendError(vulIn(kind === "image" ? chat.composer.fotoNietVerstuurd : chat.composer.bestandNietVerstuurd, { fout: (e as Error).message }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pick = (_kind: "file" | "image") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // cleared, so picking the same photo again fires onChange again
    e.target.value = "";
    setMenuOpen(false);
    // alleen echte foto's als foto (geen SVG); elk ander bestand mag, als bestand
    if (f) setPreview({ file: f, kind: isFotoType(f.type) ? "image" : "file" });
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
      setSendError(chat.composer.locatieNietOndersteund);
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
            ? chat.composer.locatieGeweigerd
            : err.code === err.TIMEOUT
              ? chat.composer.locatieTimeout
              : chat.composer.locatieOnbekend,
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
          setSendError(vulIn(chat.composer.spraakNietVerstuurd, { fout: (e as Error).message }));
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
      setSendError(chat.composer.geenMicrofoon);
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
            <span className="block font-semibold text-brand-700">{chat.composer.berichtBewerken}</span>
            <span className="block truncate text-neutralx-600">{editing.text}</span>
          </span>
          <button type="button" onClick={onCancelEdit} aria-label={chat.composer.bewerkenStoppen} title={chat.composer.stoppenEsc} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-black/5">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      {!editing && replyTo && (
        <div className="flex items-center gap-2 border-b border-hair bg-paper-soft/60 px-3 py-2 text-xs">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center text-brand-600" aria-hidden><IconReply className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 border-l-4 border-brand-500 pl-2">
            <span className="block font-semibold text-brand-700">{replyName ? vulIn(chat.composer.antwoordAan, { naam: replyName }) : chat.composer.antwoord}</span>
            <span className="block truncate text-neutralx-600">
              {replyTo.text || (replyTo.kind === "image" ? chat.composer.previewFoto : replyTo.kind === "voice" ? chat.composer.previewSpraak : replyTo.kind === "file" ? chat.composer.previewBestand : replyTo.kind === "location" ? chat.composer.previewLocatie : chat.composer.previewBericht)}
            </span>
          </span>
          <button type="button" onClick={onClearReply} aria-label={chat.composer.antwoordAnnuleren} title={chat.composer.annulerenEsc} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-neutralx-500 hover:bg-black/5">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {aiOpen && (
        <div className="space-y-2 border-b border-hair bg-brand-50/40 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-brand-700">✨ {chat.composer.aiHulp}</span>
            {aiBusy && <span className="text-neutralx-500">{chat.composer.bezig}</span>}
            {aiSuggestions.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-brand-500/40 bg-white px-2.5 py-1 text-neutralx-700 hover:border-brand-500">
                {s}
              </button>
            ))}
            <button type="button" onClick={() => setAiOpen(false)} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-neutralx-500 hover:bg-black/5" aria-label={chat.composer.aiHulpSluiten}>
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
          {text.trim() && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-neutralx-500">{chat.composer.mijnTekst}</span>
              {(
                [
                  ["vriendelijk", chat.composer.stijlVriendelijk],
                  ["kort", chat.composer.stijlKort],
                  ["zakelijk", chat.composer.stijlZakelijk],
                  ["en", chat.composer.stijlEngels],
                  ["pl", chat.composer.stijlPools],
                  ["de", chat.composer.stijlDuits],
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

      {isTeLang(text) && (
        // geen stille afkapping meer (het veld had maxLength 4000): zeg wat er met een lange tekst gebeurt
        <p role="status" className="border-b border-hair bg-paper-soft px-3 py-1.5 text-xs text-neutralx-600">
          {editing
            ? vulIn(chat.composer.teLangOmTeBewerken, { max: String(BERICHT_MAX) })
            : vulIn(chat.composer.langeTekstAlsBestand, { aantal: String(text.trim().length) })}
        </p>
      )}

      {sendError && (
        <div role="alert" className="flex items-center gap-2 border-b border-hair bg-crit/10 px-3 py-1.5 text-xs text-crit">
          <span className="min-w-0 flex-1">{sendError}</span>
          <button type="button" onClick={() => setSendError(null)} className="grid h-6 w-6 place-items-center rounded-full text-neutralx-500 hover:bg-black/5" aria-label={chat.composer.meldingSluiten}>
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showQuick && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-hair p-2">
          {quickReplies.length === 0 && <span className="px-1 text-xs text-neutralx-500">{chat.composer.geenSnelleAntwoorden}</span>}
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
          <span className="text-sm text-neutralx-500">{chat.composer.opnemen}</span>
          <button type="button" onClick={() => stopRecording(true)} className="ml-auto rounded-full px-3 py-1.5 text-sm text-crit hover:bg-crit/10">
            {chat.composer.annuleer}
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#008069] text-white"
            aria-label={chat.composer.verstuurSpraak}
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
              <MenuItem icon="🖼️" label={chat.composer.menuFoto} onClick={() => imgRef.current?.click()} />
              <MenuItem icon="📷" label={chat.composer.menuCamera} onClick={() => camRef.current?.click()} />
              <MenuItem icon="📄" label={chat.composer.menuDocument} onClick={() => fileRef.current?.click()} />
              <MenuItem icon="📍" label={chat.composer.menuLocatie} onClick={shareLocation} />
              <MenuItem
                icon="📊"
                label={chat.composer.menuPeiling}
                onClick={() => {
                  setMenuOpen(false);
                  setPollOpen(true);
                }}
              />
            </div>
          )}
          {emojiOpen && (
            <div className="absolute bottom-full left-2 z-10 mb-2 grid w-[min(20rem,calc(100%-1rem))] grid-cols-8 gap-0.5 rounded-xl border border-hairstrong bg-white p-2 shadow-lift" role="menu" aria-label={chat.composer.emoji}>
              {EMOJI.map((e) => (
                <button key={e} type="button" role="menuitem" onClick={() => insertEmoji(e)} className="grid h-9 place-items-center rounded-lg text-xl hover:bg-paper-soft" aria-label={vulIn(chat.composer.emojiN, { emoji: e })}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {noem && noemLijst.length > 0 && (
            <div className="absolute bottom-full left-2 z-10 mb-2 w-[min(18rem,calc(100%-1rem))] rounded-xl border border-hairstrong bg-white p-1 shadow-lift" role="listbox" aria-label={chat.composer.noemIemand}>
              {noemLijst.map((l, i) => (
                <button
                  key={l.userId}
                  type="button"
                  role="option"
                  aria-selected={i === noem.actief}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => kies(l)}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink ${i === noem.actief ? "bg-paper-soft" : "hover:bg-paper-soft"}`}
                >
                  <span className="truncate font-medium">@{l.name}</span>
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
                aria-label={chat.composer.emoji}
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
                kijkNoem(e.target.value, e.target.selectionStart ?? e.target.value.length);
                onTyping();
              }}
              onSelect={(e) => kijkNoem(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                // de @-lijst staat open: pijltjes kiezen, Enter of Tab zet de naam erin, Esc sluit
                if (noem && noemLijst.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const stap = e.key === "ArrowDown" ? 1 : -1;
                    setNoem({ ...noem, actief: (noem.actief + stap + noemLijst.length) % noemLijst.length });
                    return;
                  }
                  if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    const lid = noemLijst[noem.actief] ?? noemLijst[0];
                    if (lid) kies(lid);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setNoem(null);
                    return;
                  }
                }
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
              placeholder={editing ? chat.composer.placeholderBewerk : chat.composer.placeholderTyp}
              aria-label={chat.composer.bericht}
              className="max-h-60 min-h-[2.5rem] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-base leading-snug outline-none md:text-sm"
            />

            {!editing && (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuick((v) => !v)}
                  className={`${roundBtn} ${showQuick ? "text-brand-600" : ""}`}
                  aria-label={chat.composer.snelleAntwoorden}
                  aria-expanded={showQuick}
                  title={chat.composer.snelleAntwoorden}
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
                  aria-label={chat.composer.aiHulp}
                  aria-expanded={aiOpen}
                  title={chat.composer.aiHulpTitel}
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
                  aria-label={chat.composer.bijlage}
                  aria-expanded={menuOpen}
                  title={chat.composer.bijlageTitel}
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
              aria-label={editing ? chat.composer.bewerkingOpslaan : chat.composer.verstuur}
            >
              {editing ? <span className="text-lg leading-none" aria-hidden>✓</span> : <IconSend className="h-5 w-5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#008069] text-white transition-transform active:scale-95"
              aria-label={chat.composer.spraakOpnemen}
            >
              <IconMic className="h-5 w-5" />
            </button>
          )}

          <input ref={imgRef} type="file" accept="image/*,video/*" hidden onChange={pick("image")} />
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
          onSend={(caption, eenmalig) => {
            const p = preview;
            setPreview(null);
            void sendFile(p.file, p.kind, caption, eenmalig);
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
