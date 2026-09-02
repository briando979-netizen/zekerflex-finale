"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/jarvis/Markdown";
import { HoloOrb, type OrbState } from "@/components/jarvis/HoloOrb";

// ---------------------------------------------------------------------------
// JARVIS — immersive local-assistant console with a full voice loop.
//
// Speech in:  Web Speech API (Chrome/Edge) → falls back to MediaRecorder +
//             the local Whisper endpoint (/api/admin/voice/transcribe) so it
//             also works in Firefox/Safari and stays sovereign.
// Speech out: browser SpeechSynthesis (nl-NL), with the Chrome "resume" fix
//             and proper async voice loading.
// The recognised text is handed straight to send() — no state race.
// ---------------------------------------------------------------------------

type EventKind = "THINKING" | "TOOL_CALL" | "TOOL_RESULT" | "AGENT_DELEGATION" | "MESSAGE" | "ERROR";

interface TurnEvent {
  seq: number;
  kind: EventKind;
  agent: string;
  title: string;
  detail: string | null;
  payload: Record<string, unknown> | null;
  durationMs: number | null;
}
interface TurnState {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  prompt: string;
  answer: string | null;
  error: string | null;
  events: TurnEvent[];
}
interface ChatMessage {
  role: "user" | "assistant" | "error";
  text: string;
}

const AGENT_LABEL: Record<string, string> = {
  jarvis: "Jarvis",
  analyst: "Analyst",
  "developer:tom": "Developer · Tom",
  sales: "Sales",
};
const agentLabel = (a: string) => AGENT_LABEL[a] ?? a;

const KIND_PREFIX: Record<EventKind, string> = {
  THINKING: "✻",
  TOOL_CALL: "$",
  TOOL_RESULT: "⤷",
  AGENT_DELEGATION: "➜",
  MESSAGE: "▌",
  ERROR: "✖",
};

function speechToText(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}
function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " codeblok ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>*_~-]+/g, " ")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function JarvisConsole() {
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [uploads, setUploads] = useState<{ id: string; filename: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<unknown>(null);
  const mediaRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRef = useRef<(t?: string) => void>(() => undefined);
  const startListeningRef = useRef<() => void>(() => undefined);
  const interimRef = useRef("");
  const forceLocalRef = useRef(false);
  const busyRef = useRef(false);
  const handsFreeRef = useRef(false);
  const speakRef = useRef(true);

  busyRef.current = busy;
  handsFreeRef.current = handsFree;
  speakRef.current = speak;

  // ---- persisted toggles -------------------------------------------------
  useEffect(() => {
    try {
      const s = localStorage.getItem("zekerflex.jarvis.speak");
      const h = localStorage.getItem("zekerflex.jarvis.handsfree");
      if (s !== null) setSpeak(s === "1");
      if (h !== null) setHandsFree(h === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // ---- load TTS voices (they arrive async in most browsers) -------------
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const all = window.speechSynthesis.getVoices();
      voiceRef.current =
        all.find((v) => v.lang?.toLowerCase() === "nl-nl") ??
        all.find((v) => v.lang?.toLowerCase().startsWith("nl")) ??
        all.find((v) => /google|microsoft/i.test(v.name) && v.lang?.startsWith("nl")) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
      if (analyserRef.current) {
        cancelAnimationFrame(analyserRef.current.raf);
        void analyserRef.current.ctx.close();
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // ---- speak a reply ---------------------------------------------------
  const sayAloud = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceError("Voorlezen wordt niet ondersteund in deze browser.");
      return;
    }
    const plain = stripMarkdown(text).slice(0, 1000);
    if (!plain) return;

    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = "nl-NL";
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.04;
    u.pitch = 1;
    u.onstart = () => {
      setSpeaking(true);
      // Chrome pauses long utterances after ~15s; nudge it.
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
      resumeTimerRef.current = setInterval(() => {
        try {
          if (synth.speaking) synth.resume();
        } catch {
          /* ignore */
        }
      }, 6000);
    };
    const finish = () => {
      setSpeaking(false);
      if (resumeTimerRef.current) {
        clearInterval(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      if (handsFreeRef.current && !busyRef.current) {
        setTimeout(() => startListeningRef.current(), 350);
      }
    };
    u.onend = finish;
    u.onerror = (e) => {
      // "interrupted"/"canceled" are normal when we cancel(); ignore those.
      if (e.error && !["interrupted", "canceled"].includes(e.error)) {
        setVoiceError(`Voorlezen mislukte (${e.error}).`);
      }
      finish();
    };
    // A user gesture already happened (mic/send click); resume unlocks Chrome.
    try {
      synth.resume();
    } catch {
      /* ignore */
    }
    synth.speak(u);
  }, []);

  // ---- turn polling --------------------------------------------------
  const poll = useCallback(
    (turnId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      let since = 0;
      let inFlight = false;
      pollRef.current = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const res = await fetch(`/api/admin/jarvis/turns/${turnId}?since=${since}`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as TurnState;
          for (const e of data.events) since = Math.max(since, e.seq);
          setTurn((prev) => {
            if (!prev || prev.id !== data.id) return data;
            const seen = new Set(prev.events.map((e) => e.seq));
            return { ...data, events: [...prev.events, ...data.events.filter((e) => !seen.has(e.seq))] };
          });
          if (data.status !== "RUNNING") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            if (data.status === "COMPLETED" && data.answer) {
              setMessages((m) => [...m, { role: "assistant", text: data.answer! }]);
              if (speakRef.current) sayAloud(data.answer);
            } else if (data.error) {
              setMessages((m) => [...m, { role: "error", text: data.error! }]);
            }
          }
        } catch {
          /* keep polling */
        } finally {
          inFlight = false;
        }
      }, 900);
    },
    [sayAloud],
  );

  // ---- full (audited) turn engine — for tool tasks -------------------
  const runFullTurn = useCallback(
    async (prompt: string, uploadIds: string[]) => {
      try {
        const res = await fetch("/api/admin/jarvis/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, ...(uploadIds.length ? { uploadIds } : {}) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "Turn kon niet starten");
        setTurn({ id: data.turnId, status: "RUNNING", prompt, answer: null, error: null, events: [] });
        poll(data.turnId);
      } catch (err) {
        setBusy(false);
        setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
      }
    },
    [poll],
  );

  // ---- send: try the fast streaming path first, fall through to a turn --
  const send = useCallback(
    async (explicit?: string) => {
      const prompt = (explicit ?? input).trim();
      if (!prompt || busyRef.current) return;
      setBusy(true);
      setInput("");
      setInterim("");
      setVoiceError(null);
      setMessages((m) => [...m, { role: "user", text: prompt }]);
      const uploadIds = uploads.map((u) => u.id);
      setUploads([]);

      if (uploadIds.length) {
        await runFullTurn(prompt, uploadIds);
        return;
      }

      try {
        const res = await fetch("/api/admin/jarvis/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          if (data?.needsFullTurn) {
            await runFullTurn(prompt, []);
            return;
          }
          throw new Error(data?.error?.message ?? "Jarvis kon niet antwoorden");
        }
        // streaming conversational reply
        if (!res.body) throw new Error("geen stroom");
        setMessages((m) => [...m, { role: "assistant", text: "" }]);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "assistant", text: acc };
            return c;
          });
        }
        setBusy(false);
        if (acc.trim() && speakRef.current) sayAloud(acc);
        else if (!acc.trim()) {
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "error", text: "Jarvis gaf geen antwoord — probeer het opnieuw." };
            return c;
          });
        }
      } catch (err) {
        setBusy(false);
        setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
      }
    },
    [input, uploads, runFullTurn, sayAloud],
  );
  useEffect(() => {
    sendRef.current = (t?: string) => void send(t);
  }, [send]);

  // ---- auto-run a query passed from the ⌘K command bar (?q=…) -------
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q && q.trim()) {
        window.history.replaceState({}, "", window.location.pathname);
        setTimeout(() => sendRef.current(q.trim()), 150);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- mic level meter (real amplitude) -----------------------------
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) * (v - 128);
        setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40));
        analyserRef.current = { ctx, raf: requestAnimationFrame(tick) };
      };
      analyserRef.current = { ctx, raf: requestAnimationFrame(tick) };
      tick();
    } catch {
      /* meter is cosmetic */
    }
  }, []);
  const stopMeter = useCallback(() => {
    if (analyserRef.current) {
      cancelAnimationFrame(analyserRef.current.raf);
      void analyserRef.current.ctx.close().catch(() => undefined);
      analyserRef.current = null;
    }
    setMicLevel(0);
  }, []);

  // ---- MediaRecorder → local Whisper fallback ---------------------
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startMeter(stream);
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stopMeter();
        setListening(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "speech.webm");
          const res = await fetch("/api/admin/voice/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) {
            setVoiceError(data?.error?.message ?? "Transcriberen mislukte.");
          } else if ((data.text ?? "").trim().length >= 2) {
            sendRef.current(data.text.trim());
          } else {
            setVoiceError("Niets verstaan — probeer het nog eens.");
          }
        } catch {
          setVoiceError("De transcriptiedienst is niet bereikbaar.");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRef.current = { recorder, stream, chunks };
      recorder.start();
      setListening(true);
      setVoiceError(null);
      // safety stop after 20s
      setTimeout(() => {
        if (mediaRef.current?.recorder.state === "recording") mediaRef.current.recorder.stop();
      }, 20_000);
    } catch (err) {
      stopMeter();
      const name = (err as Error).name;
      setVoiceError(
        name === "NotAllowedError"
          ? "Geef de microfoon toestemming in je browser en probeer opnieuw."
          : "Kon de microfoon niet openen.",
      );
    }
  }, [startMeter, stopMeter]);

  // ---- Web Speech API path --------------------------------------
  const startWebSpeech = useCallback(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => unknown)
      | undefined;
    if (!SR) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new (SR as any)();
    rec.lang = "nl-NL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onstart = () => {
      setListening(true);
      setVoiceError(null);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let live = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + " " + live).trim());
      setMicLevel(Math.min(1, 0.25 + (finalText.length + live.length) / 50));
    };
    rec.onerror = (ev: { error?: string }) => {
      setListening(false);
      setMicLevel(0);
      recRef.current = null;
      if (ev.error === "not-allowed") {
        setVoiceError("Geef de microfoon toestemming in je browser en probeer opnieuw.");
      } else if (ev.error === "no-speech") {
        setVoiceError("Niets gehoord — probeer het nog eens.");
      } else if (ev.error === "network" || ev.error === "service-not-allowed") {
        // The browser's speech service (Google) is unreachable. Switch to the
        // local, sovereign path for the rest of the session.
        forceLocalRef.current = true;
        if (canRecord()) {
          setVoiceError("Browserspraak had geen verbinding — ik schakel over op lokale spraakherkenning.");
          setTimeout(() => startListeningRef.current(), 400);
        } else {
          setVoiceError(
            "Browserspraak heeft internet nodig en dat lukt hier niet. Zet WHISPER_ENABLED=true voor lokale spraakherkenning, of typ je bericht.",
          );
        }
      } else if (ev.error && ev.error !== "aborted") {
        setVoiceError(`Spraakherkenning gaf een fout (${ev.error}).`);
      }
    };
    rec.onend = () => {
      setListening(false);
      setMicLevel(0);
      recRef.current = null;
      const text = finalText.trim() || interimRef.current.trim();
      setInterim("");
      if (text.length >= 2 && !busyRef.current) sendRef.current(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      return true;
    } catch {
      recRef.current = null;
      return false;
    }
  }, []);

  interimRef.current = interim; // keep latest interim available in recognition callbacks

  const startListening = useCallback(() => {
    if (busyRef.current || listening || transcribing) return;
    setVoiceError(null);
    // prime speech synthesis while we have a gesture
    try {
      window.speechSynthesis?.resume();
    } catch {
      /* ignore */
    }
    if (speechToText() && !forceLocalRef.current) {
      if (startWebSpeech()) return;
    }
    if (canRecord()) {
      void startRecording();
      return;
    }
    setVoiceError("Spraak wordt niet ondersteund in deze browser. Gebruik Chrome of Edge, of stel WHISPER_ENABLED in.");
  }, [listening, transcribing, startWebSpeech, startRecording]);
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (recRef.current as any)?.stop?.();
    if (mediaRef.current?.recorder.state === "recording") mediaRef.current.recorder.stop();
    setListening(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, stopListening, startListening]);

  // ---- uploads -----------------------------------------------------
  const upload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) setUploads((p) => [...p, { id: data.upload.id, filename: data.upload.filename }]);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // ---- view helpers ---------------------------------------------
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [turn?.events.length]);

  const persistToggle = (key: string, val: boolean) => {
    try {
      localStorage.setItem(key, val ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const orbState: OrbState = listening
    ? "listening"
    : turn?.status === "FAILED"
      ? "error"
      : speaking
        ? "speaking"
        : busy || transcribing
          ? "thinking"
          : "idle";

  const statusLine = voiceError
    ? voiceError
    : listening
      ? interim || "Ik luister…"
      : transcribing
        ? "Spraak omzetten…"
        : speaking
          ? "Aan het woord…"
          : busy
            ? (() => {
                const last = turn?.events[turn.events.length - 1];
                return last ? `${last.title} · ${agentLabel(last.agent)}` : "Bezig…";
              })()
            : turn?.status === "FAILED"
              ? "Er ging iets mis — probeer het opnieuw."
              : "Klaar voor je vraag.";

  const streamEvents = turn?.events.filter((e) => e.kind !== "MESSAGE") ?? [];

  return (
    <div className="hero-ink -m-4 flex min-h-[calc(100vh-4rem)] flex-col text-white lg:-m-8">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
        <span className="font-display text-sm font-bold tracking-[0.2em]">JARVIS</span>
        <span className="pill bg-[rgba(79,224,160,0.12)] text-brand-mint">lokale inferentie · geen tokenkosten</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Toggle
            label="voorlezen"
            on={speak}
            onChange={(v) => {
              setSpeak(v);
              persistToggle("zekerflex.jarvis.speak", v);
              if (!v) window.speechSynthesis?.cancel();
            }}
          />
          <Toggle
            label="continu gesprek"
            on={handsFree}
            onChange={(v) => {
              setHandsFree(v);
              persistToggle("zekerflex.jarvis.handsfree", v);
              if (v && !listening && !busy && !speaking) startListening();
            }}
          />
          <button
            type="button"
            onClick={() => setShowStream((v) => !v)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
          >
            {showStream ? "verberg activiteit" : "toon activiteit"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* stage */}
        <div className="flex min-h-0 flex-1 flex-col items-center">
          <div className="relative flex flex-shrink-0 items-center justify-center pt-6">
            <HoloOrb
              state={orbState}
              level={listening ? micLevel : busy || transcribing ? 0.5 : 0}
              size={300}
            />
          </div>
          <p
            className={`mt-1 min-h-[1.5rem] max-w-md text-center text-sm ${
              voiceError ? "text-[#F5B9AE]" : "text-white/60"
            }`}
          >
            {statusLine}
          </p>

          {/* conversation */}
          <div ref={chatRef} className="mt-4 w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-5 pb-4">
            {messages.length === 0 && !busy ? (
              <div className="mt-8 space-y-3 text-center">
                <p className="text-white/50">
                  Zeg &ldquo;hallo&rdquo;, vraag om een <em>briefing</em>, of geef een opdracht — typen of spreken.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Hallo Jarvis", "Geef me een briefing", "Hoeveel flexwerkers zijn er?", "Controleer het platform"].map(
                    (s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendRef.current(s)}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-brand-mint hover:text-brand-mint"
                      >
                        {s}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <span className="max-w-[85%] rounded-2xl bg-white/10 px-4 py-2 text-sm">{m.text}</span>
                  </div>
                ) : m.role === "error" ? (
                  <div key={i} className="rounded-xl border border-[rgba(240,124,107,0.4)] bg-[rgba(240,124,107,0.12)] px-4 py-3 text-sm text-[#F5B9AE]">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/85">
                    <Markdown text={m.text} />
                  </div>
                ),
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-mint" />
                Jarvis denkt na… (lokaal model, dit kan even duren)
              </div>
            )}
          </div>

          {/* composer */}
          <div className="w-full max-w-2xl px-5 pb-6">
            {uploads.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {uploads.map((u) => (
                  <span key={u.id} className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                    📎 {u.filename}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.06] p-2">
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Bestand toevoegen"
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-white/15 text-white/70 hover:bg-white/10"
              >
                +
              </button>
              <textarea
                value={listening ? interim : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                disabled={busy || listening}
                placeholder={
                  busy ? "Jarvis is aan het werk…" : listening ? "Aan het luisteren…" : "Typ of spreek je bericht…"
                }
                className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-white/35 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy || transcribing}
                title={listening ? "Stop met luisteren" : "Spreek tegen Jarvis"}
                aria-pressed={listening}
                className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border transition disabled:opacity-40 ${
                  listening
                    ? "animate-pulse border-[#FFC46B] bg-[rgba(255,196,107,0.18)] text-[#FFC46B]"
                    : "border-white/15 text-white/70 hover:bg-white/10"
                }`}
              >
                {listening ? (
                  <span className="h-3 w-3 rounded-sm bg-current" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim() || listening}
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-brand-mint text-ink disabled:opacity-40"
                title="Versturen"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-white/30">
              Microfoon: Chrome/Edge werkt direct. Andere browsers: zet <span className="font-mono">WHISPER_ENABLED=true</span> voor lokale spraakherkenning.
            </p>
          </div>
        </div>

        {/* activity drawer */}
        {showStream && (
          <aside className="flex min-h-0 w-full flex-shrink-0 flex-col border-t border-white/10 lg:w-[380px] lg:border-l lg:border-t-0">
            <div className="border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
              Activiteit
            </div>
            <div ref={streamRef} className="flex-1 space-y-2 overflow-y-auto p-4 font-mono text-[11.5px] text-white/70">
              {!turn ? (
                <p className="text-white/30">Alles wat de lokale AI doet verschijnt hier live.</p>
              ) : (
                <>
                  <div className="text-white/30">$ jarvis run &quot;{turn.prompt}&quot;</div>
                  {streamEvents.map((e) => (
                    <div key={e.seq} className="leading-relaxed">
                      <div
                        className={
                          e.kind === "ERROR"
                            ? "text-[#F5B9AE]"
                            : e.kind === "TOOL_CALL"
                              ? "text-brand-mint"
                              : e.kind === "AGENT_DELEGATION"
                                ? "text-[#7CC5FF]"
                                : "text-white/75"
                        }
                      >
                        <span className="text-white/25">{KIND_PREFIX[e.kind]} </span>
                        {e.title}
                        <span className="text-white/25">
                          {" "}· {agentLabel(e.agent)}
                          {e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : ""}
                        </span>
                      </div>
                      {e.detail && (
                        <div className="whitespace-pre-wrap pl-4 text-white/40">
                          {e.detail.length > 400 ? `${e.detail.slice(0, 400)}…` : e.detail}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="text-white/25">
                    {turn.status === "RUNNING" ? "▌" : turn.status === "COMPLETED" ? "── klaar ──" : "── afgebroken ──"}
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        on ? "border-brand-mint/50 bg-[rgba(79,224,160,0.14)] text-brand-mint" : "border-white/15 text-white/55 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
