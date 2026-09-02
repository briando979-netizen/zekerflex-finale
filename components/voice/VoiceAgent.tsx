"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Live voice agent. Connects to GET /api/voice/stream (SSE) and speaks every
// unspoken announcement - server-synthesised WAV when Piper is configured,
// otherwise the browser's built-in (local) speech synthesis in Dutch.
// ---------------------------------------------------------------------------

interface Announcement {
  id: string;
  text: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH";
}

const MUTE_KEY = "zekerflex.voice.muted";

function pickDutchVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith("nl")) ??
    voices.find((v) => /dutch|nederlands/i.test(v.name)) ??
    null
  );
}

export function VoiceAgent() {
  const [muted, setMuted] = useState(false);
  const [serverTts, setServerTts] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const queue = useRef<Announcement[]>([]);
  const speaking = useRef(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MUTE_KEY) === "1";
      setMuted(m);
      mutedRef.current = m;
    } catch {
      /* storage unavailable */
    }
  }, []);

  const speakBrowser = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "nl-NL";
      const v = pickDutchVoice();
      if (v) u.voice = v;
      u.rate = 1.02;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }, []);

  const drain = useCallback(async () => {
    if (speaking.current) return;
    speaking.current = true;
    try {
      while (queue.current.length > 0) {
        const next = queue.current.shift();
        if (!next) break;
        if (mutedRef.current) continue;
        setLast(next.text);

        let played = false;
        if (serverTts) {
          try {
            const res = await fetch(
              `/api/voice/announcements/${next.id}/audio`,
              { cache: "no-store" },
            );
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              await audio.play().then(
                () =>
                  new Promise<void>((r) => {
                    audio.onended = () => r();
                    audio.onerror = () => r();
                  }),
              );
              URL.revokeObjectURL(url);
              played = true;
            }
          } catch {
            /* fall through to browser synth */
          }
        }
        if (!played) await speakBrowser(next.text);
      }
    } finally {
      speaking.current = false;
    }
  }, [serverTts, speakBrowser]);

  useEffect(() => {
    const es = new EventSource("/api/voice/stream");
    es.addEventListener("ready", (e) => {
      try {
        const caps = JSON.parse((e as MessageEvent).data);
        setServerTts(Boolean(caps.serverTts));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("announcement", (e) => {
      try {
        const a = JSON.parse((e as MessageEvent).data) as Announcement;
        queue.current.push(a);
        void drain();
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    return () => es.close();
  }, [drain]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 84,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: "rgba(17,24,39,0.92)",
        color: "white",
        fontSize: 13,
        maxWidth: 360,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
      }}
    >
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Stem inschakelen" : "Stem dempen"}
        style={{
          border: "none",
          background: "transparent",
          color: "white",
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <span style={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {muted
          ? "Stem gedempt"
          : (last ?? `Jarvis luistert${serverTts ? " · Piper" : ""}`)}
      </span>
    </div>
  );
}
