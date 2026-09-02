"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDuration, type Msg } from "./shared";

export interface OutgoingMessage {
  text: string;
  kind: Msg["kind"];
  attachment?: { mediaId: string; filename: string; mimeType: string; sizeBytes: number; durationSec?: number };
  location?: { lat: number; lng: number; label?: string };
  replyToId?: string;
}

export function Composer({
  threadId,
  quickReplies,
  replyTo,
  onClearReply,
  onSend,
  onTyping,
}: {
  threadId: string;
  quickReplies: string[];
  replyTo: Msg | null;
  onClearReply: () => void;
  onSend: (msg: OutgoingMessage) => Promise<void>;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStart = useRef(0);

  useEffect(() => () => {
    if (recTimer.current) clearInterval(recTimer.current);
    mediaRec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function uploadMedia(file: Blob, filename: string, durationSec?: number) {
    const fd = new FormData();
    fd.append("file", file, filename);
    if (durationSec) fd.append("durationSec", String(durationSec));
    const r = await fetch(`/api/inbox/${threadId}/media`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("upload mislukt");
    return (await r.json()).attachment as OutgoingMessage["attachment"];
  }

  const sendText = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    try {
      await onSend({ text: t, kind: "text", ...(replyTo ? { replyToId: replyTo.id } : {}) });
      onClearReply();
    } finally {
      setBusy(false);
    }
  };

  const sendFile = async (file: File, kind: "file" | "image") => {
    setBusy(true);
    setMenuOpen(false);
    try {
      const att = await uploadMedia(file, file.name);
      if (att) await onSend({ text: "", kind, attachment: att, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      onClearReply();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const shareLocation = () => {
    setMenuOpen(false);
    if (!navigator.geolocation) return;
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
      () => alert("Locatie niet beschikbaar"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const startRecording = async () => {
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
        try {
          const att = await uploadMedia(blob, `spraak-${Date.now()}.webm`, secs);
          if (att) await onSend({ text: "", kind: "voice", attachment: att });
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
      alert("Microfoon niet beschikbaar");
    }
  };

  const stopRecording = (cancel = false) => {
    if (recTimer.current) clearInterval(recTimer.current);
    if (cancel) chunks.current = [];
    mediaRec.current?.stop();
  };

  return (
    <div className="border-t border-hair bg-white">
      {replyTo && (
        <div className="flex items-center gap-2 border-b border-hair px-3 py-1.5 text-xs">
          <span className="border-l-2 border-brand-400 pl-2 text-neutralx-500">
            Antwoord op: {replyTo.text || replyTo.kind}
          </span>
          <button type="button" onClick={onClearReply} className="ml-auto text-neutralx-400">
            ✕
          </button>
        </div>
      )}

      {showQuick && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-hair p-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setText((t) => (t ? `${t} ${q}` : q));
                setShowQuick(false);
              }}
              className="rounded-full border border-hairstrong px-2.5 py-1 text-xs text-neutralx-600 hover:bg-paper-soft"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 p-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-crit" />
          <span className="num font-mono text-sm">{fmtDuration(recSecs)}</span>
          <span className="text-sm text-neutralx-500">Opnemen…</span>
          <button type="button" onClick={() => stopRecording(true)} className="ml-auto text-sm text-neutralx-500">
            Annuleer
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white"
            aria-label="Verstuur spraak"
          >
            ➤
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendText();
          }}
          className="flex items-end gap-1.5 p-2"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full text-xl text-neutralx-500 hover:bg-paper-soft"
              aria-label="Bijlage"
            >
              +
            </button>
            {menuOpen && (
              <div className="absolute bottom-11 left-0 z-10 w-44 rounded-xl border border-hairstrong bg-white p-1 shadow-lift">
                <MenuItem icon="🖼️" label="Foto" onClick={() => imgRef.current?.click()} />
                <MenuItem icon="📄" label="Document" onClick={() => fileRef.current?.click()} />
                <MenuItem icon="📍" label="Locatie delen" onClick={shareLocation} />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowQuick((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft"
            aria-label="Snelle antwoorden"
          >
            ⚡
          </button>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            rows={1}
            placeholder="Typ een bericht…"
            className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
          />

          {text.trim() ? (
            <button
              type="submit"
              disabled={busy}
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white disabled:opacity-40"
              aria-label="Verstuur"
            >
              ➤
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white"
              aria-label="Spraakbericht opnemen"
            >
              🎤
            </button>
          )}

          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendFile(f, "image");
            }}
          />
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendFile(f, "file");
            }}
          />
        </form>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutralx-700 hover:bg-paper-soft"
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
