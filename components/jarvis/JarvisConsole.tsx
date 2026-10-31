"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/jarvis/Markdown";

// ---------------------------------------------------------------------------
// ZEKERFLEX AI — VS-Code / Claude-Code-style workbench for the local (or cloud)
// assistant. One editor pane with the conversation; the model's thinking and
// tool steps render INLINE as collapsible blocks (like Claude Code), a left
// rail holds the session history, and a brein badge shows which model is live.
//
// Reused in two shapes: standalone on /admin/zekerflex-ai (via the studio) and,
// historically, on its own page. Pass `embedded` to fill a parent flex box
// instead of breaking out of the admin padding, and `hideRail` to drop the
// session rail when the surrounding studio already provides one.
//
// All the working logic below (voice loop, streaming, turn polling, uploads)
// is unchanged from the previous console — only the presentation moved to an
// IDE layout.
//
// Speech in:  Web Speech API (Chrome/Edge) → falls back to MediaRecorder +
//             the local Whisper endpoint (/api/admin/voice/transcribe) so it
//             also works in Firefox/Safari and stays sovereign.
// Speech out: browser SpeechSynthesis (nl-NL), with the Chrome "resume" fix.
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
  events?: TurnEvent[];
}

const AGENT_LABEL: Record<string, string> = {
  jarvis: "ZekerFlex AI",
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

// Zwaarste open modellen om lokaal, token-vrij een brein "groter dan Claude" te
// draaien. Getoond als hint onder de kiezer; pull ze op je AI-node, kies ze
// daarna hierboven. Zie deploy/ai-node/README.md.
const HEAVY_MODELS: { name: string; params: string; needs: string }[] = [
  { name: "qwen2.5:72b", params: "72B", needs: "~48 GB VRAM — sterkste op één kaart" },
  { name: "llama3.1:405b", params: "405B", needs: "~240 GB VRAM — groter dan Claude" },
  { name: "deepseek-r1:671b", params: "671B", needs: "~420 GB VRAM óf ~512 GB RAM (MoE)" },
];

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

export function JarvisConsole({
  embedded = false,
  hideRail = false,
}: {
  embedded?: boolean;
  hideRail?: boolean;
} = {}) {
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
  const [micLevel, setMicLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  // VS-Code workbench state: session history, a read-only view of a past turn,
  // and which brain (local / cloud) is currently answering.
  const [history, setHistory] = useState<{ id: string; prompt: string; status: string; startedAt: string }[]>([]);
  const [viewTurn, setViewTurn] = useState<TurnState | null>(null);
  const [brain, setBrain] = useState<{
    ok: boolean;
    model: string;
    cloud: boolean;
    models: string[];
    fleet: Record<string, string>;
    roles: { role: string; label: string; model: string; recommended: string }[];
  } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<unknown>(null);
  const mediaRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const neuralAudioRef = useRef<HTMLAudioElement | null>(null);
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

  // ---- speak a reply (neural server-voice first, browser voice as fallback) ----
  const sayAloud = useCallback((text: string) => {
    const plain = stripMarkdown(text).slice(0, 1000);
    if (!plain) return;

    const afterNeural = () => {
      setSpeaking(false);
      if (handsFreeRef.current && !busyRef.current) setTimeout(() => startListeningRef.current(), 350);
    };

    // Terugval: de eigen stem van de browser (offline, maar robotachtiger).
    const browserTts = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setVoiceError("Voorlezen wordt niet ondersteund in deze browser.");
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(plain);
      u.lang = "nl-NL";
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 1.04;
      u.pitch = 1;
      u.onstart = () => {
        setSpeaking(true);
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
        if (handsFreeRef.current && !busyRef.current) setTimeout(() => startListeningRef.current(), 350);
      };
      u.onend = finish;
      u.onerror = (e) => {
        if (e.error && !["interrupted", "canceled"].includes(e.error)) {
          setVoiceError(`Voorlezen mislukte (${e.error}).`);
        }
        finish();
      };
      try {
        synth.resume();
      } catch {
        /* ignore */
      }
      synth.speak(u);
    };

    // Probeer eerst de natuurlijke neurale server-stem; bij elke fout → browserstem.
    void (async () => {
      try {
        const res = await fetch("/api/admin/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: plain }),
        });
        if (res.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
          try {
            neuralAudioRef.current?.pause();
          } catch {
            /* ignore */
          }
          try {
            window.speechSynthesis?.cancel();
          } catch {
            /* ignore */
          }
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          neuralAudioRef.current = audio;
          setSpeaking(true);
          const done = () => {
            URL.revokeObjectURL(url);
            afterNeural();
          };
          audio.onended = done;
          audio.onerror = done;
          await audio.play();
          return;
        }
      } catch {
        /* val terug op de browserstem */
      }
      browserTts();
    })();
  }, []);

  // ---- sessions + brein status ------------------------------------
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jarvis/turns", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { turns?: { id: string; prompt: string; status: string; startedAt: string }[] };
      setHistory(data.turns ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  const loadBrain = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jarvis/brain", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        model: string;
        cloud: boolean;
        models?: string[];
        fleet?: Record<string, string>;
        roles?: { role: string; label: string; model: string; recommended: string }[];
      };
      setBrain({
        ok: data.ok,
        model: data.model,
        cloud: data.cloud,
        models: data.models ?? [],
        fleet: data.fleet ?? {},
        roles: data.roles ?? [],
      });
    } catch {
      /* ignore */
    }
  }, []);
  const chooseModel = useCallback(
    async (role: string, model: string) => {
      try {
        await fetch("/api/admin/jarvis/brain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, model }),
        });
        await loadBrain();
      } catch {
        /* ignore */
      }
    },
    [loadBrain],
  );
  const openTurn = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/jarvis/turns/${id}?since=0`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as TurnState;
      setViewTurn(data);
    } catch {
      /* ignore */
    }
  }, []);
  const newChat = useCallback(() => {
    setViewTurn(null);
    setMessages([]);
    setTurn(null);
    setInput("");
  }, []);
  useEffect(() => {
    void loadHistory();
    void loadBrain();
  }, [loadHistory, loadBrain]);

  // ---- turn polling --------------------------------------------------
  const poll = useCallback(
    (turnId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      let since = 0;
      let inFlight = false;
      let acc: TurnEvent[] = [];
      pollRef.current = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const res = await fetch(`/api/admin/jarvis/turns/${turnId}?since=${since}`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as TurnState;
          const fresh = data.events.filter((e) => !acc.some((a) => a.seq === e.seq));
          acc = [...acc, ...fresh];
          for (const e of data.events) since = Math.max(since, e.seq);
          setTurn({ ...data, events: acc });
          if (data.status !== "RUNNING") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            if (data.status === "COMPLETED" && data.answer) {
              setMessages((m) => [...m, { role: "assistant", text: data.answer!, events: acc }]);
              if (speakRef.current) sayAloud(data.answer);
            } else if (data.error) {
              setMessages((m) => [...m, { role: "error", text: data.error!, events: acc }]);
            }
            setTurn(null);
            void loadHistory();
          }
        } catch {
          /* keep polling */
        } finally {
          inFlight = false;
        }
      }, 900);
    },
    [sayAloud, loadHistory],
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
      setViewTurn(null);
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
          throw new Error(data?.error?.message ?? "ZekerFlex AI kon niet antwoorden");
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
        void loadHistory();
        if (acc.trim() && speakRef.current) sayAloud(acc);
        else if (!acc.trim()) {
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "error", text: "ZekerFlex AI gaf geen antwoord — probeer het opnieuw." };
            return c;
          });
        }
      } catch (err) {
        setBusy(false);
        setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
      }
    },
    [input, uploads, runFullTurn, sayAloud, loadHistory],
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
  }, [messages.length, busy, turn?.events.length]);

  const persistToggle = (key: string, val: boolean) => {
    try {
      localStorage.setItem(key, val ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const statusLine = voiceError
    ? voiceError
    : listening
      ? interim || "Ik luister…"
      : transcribing
        ? "Spraak omzetten…"
        : speaking
          ? "Aan het woord…"
          : busy
            ? (turn?.events[turn.events.length - 1]?.title ?? "Bezig…")
            : "Klaar voor je vraag.";

  const viewing = viewTurn !== null;
  const micLevelPct = Math.round((listening ? micLevel : 0) * 100);

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-1 overflow-hidden bg-[#0b0e13] text-white"
          : "-m-4 flex h-[calc(100dvh-9.5rem)] min-h-0 overflow-hidden bg-[#0b0e13] text-white lg:-m-8"
      }
    >
      {/* sessions rail */}
      {!hideRail && (
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/10 bg-[#0e1116] md:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="font-display text-sm font-bold tracking-[0.18em]">ZEKERFLEX AI</span>
          <button
            type="button"
            onClick={newChat}
            className="ml-auto rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
          >
            + nieuw
          </button>
        </div>
        {/* brein badge */}
        <div className="border-b border-white/10 px-4 py-2.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${brain?.ok ? "bg-brand-mint" : "bg-[#F07C6B]"}`} />
            <span className="text-white/70">{brain ? (brain.cloud ? "cloud-brein" : "lokaal brein · €0") : "brein laden…"}</span>
          </div>
          {brain && brain.models.length > 0 ? (
            <div className="mt-1.5 space-y-1">
              {brain.roles.map((r) => (
                <label key={r.role} className="flex items-center gap-1.5 text-[10px] text-white/45">
                  <span className="w-16 flex-shrink-0">{r.label}</span>
                  <select
                    value={brain.fleet[r.role] ?? ""}
                    onChange={(e) => void chooseModel(r.role, e.target.value)}
                    aria-label={`Model voor ${r.label}`}
                    className="min-w-0 flex-1 rounded border border-white/15 bg-[#0b0e13] px-1.5 py-1 font-mono text-[10.5px] text-white/80 focus:outline-none"
                  >
                    <option value="">auto</option>
                    {brain.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : (
            <div className="truncate pl-4 pt-0.5 font-mono text-white/35">
              {brain ? (brain.model || "node offline") : "—"}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/40">
            <span className="text-brand-mint">⚡</span> slim schakelen: simpel → snel, complex → groot
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.14em] text-white/30 hover:text-white/50 [&::-webkit-details-marker]:hidden">
              groter dan Claude?
            </summary>
            <div className="mt-1 space-y-1.5">
              {HEAVY_MODELS.map((h) => (
                <div key={h.name} className="rounded-md bg-white/[0.03] px-2 py-1">
                  <code className="text-[10.5px] text-brand-mint">ollama pull {h.name}</code>
                  <div className="text-[10px] text-white/35">
                    {h.params} · {h.needs}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-white/30">
              Lokaal = €0 per vraag. Groter model = slimmer; kies het daarna hierboven. Werelds grootste
              (±1–2,8T, Kimi/DeepSeek) = cluster; haalbaar thuis: Mac Studio 512 GB → 671B. Zie{" "}
              <code>deploy/ai-node/README.md</code>.
            </p>
          </details>
        </div>
        <div className="border-b border-white/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/30">
          Sessies
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {history.length === 0 ? (
            <p className="px-2 py-3 text-xs text-white/30">Nog geen sessies.</p>
          ) : (
            history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => void openTurn(h.id)}
                title={h.prompt}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                  viewTurn?.id === h.id ? "bg-white/10 text-white" : "text-white/60"
                }`}
              >
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                    h.status === "FAILED" ? "bg-[#F07C6B]" : h.status === "RUNNING" ? "bg-[#FFC46B]" : "bg-white/25"
                  }`}
                />
                {h.prompt}
              </button>
            ))
          )}
        </div>
      </aside>
      )}

      {/* editor pane */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* top bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
          <button
            type="button"
            onClick={newChat}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10 md:hidden"
          >
            + nieuw
          </button>
          <span className="pill bg-[rgba(79,224,160,0.12)] text-brand-mint">
            {brain?.cloud ? "cloud · Claude-niveau" : "lokale inferentie · €0 per vraag"}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-white/40">{statusLine}</span>
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
            label="continu"
            on={handsFree}
            onChange={(v) => {
              setHandsFree(v);
              persistToggle("zekerflex.jarvis.handsfree", v);
              if (v && !listening && !busy && !speaking) startListening();
            }}
          />
        </div>

        {/* transcript */}
        <div ref={chatRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-3xl space-y-4 px-5 py-6">
            {viewing ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/40">Eerdere sessie</span>
                  <button type="button" onClick={newChat} className="text-xs text-brand-mint hover:underline">
                    ← terug naar gesprek
                  </button>
                </div>
                <div className="flex justify-end">
                  <span className="max-w-[85%] rounded-2xl bg-white/10 px-4 py-2 text-sm">{viewTurn!.prompt}</span>
                </div>
                <div>
                  <StepBlock events={viewTurn!.events} />
                  {viewTurn!.answer ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/85">
                      <Markdown text={viewTurn!.answer} />
                    </div>
                  ) : viewTurn!.error ? (
                    <div className="rounded-xl border border-[rgba(240,124,107,0.4)] bg-[rgba(240,124,107,0.12)] px-4 py-3 text-sm text-[#F5B9AE]">
                      {viewTurn!.error}
                    </div>
                  ) : null}
                </div>
              </>
            ) : messages.length === 0 && !busy ? (
              <div className="pt-10 text-center">
                <p className="text-white/50">Stel een vraag of geef een opdracht — typen of spreken.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {["Hallo", "Geef me een briefing", "Hoeveel flexwerkers zijn er?", "Controleer het platform"].map(
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
              <>
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <span className="max-w-[85%] rounded-2xl bg-white/10 px-4 py-2 text-sm">{m.text}</span>
                    </div>
                  ) : m.role === "error" ? (
                    <div
                      key={i}
                      className="rounded-xl border border-[rgba(240,124,107,0.4)] bg-[rgba(240,124,107,0.12)] px-4 py-3 text-sm text-[#F5B9AE]"
                    >
                      {m.text}
                    </div>
                  ) : (
                    <div key={i}>
                      {m.events && m.events.length > 0 && <StepBlock events={m.events} />}
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/85">
                        <Markdown text={m.text} />
                      </div>
                    </div>
                  ),
                )}
                {busy && turn && turn.events.length > 0 && <StepBlock events={turn.events} running />}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-mint" />
                    {turn ? "ZekerFlex AI werkt… (lokaal model kan even duren)" : "ZekerFlex AI denkt na…"}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="mx-auto max-w-3xl">
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
                  busy ? "ZekerFlex AI is aan het werk…" : listening ? "Aan het luisteren…" : "Typ of spreek je bericht…"
                }
                className="jarvis-input max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-base text-white placeholder:text-white/35 focus:outline-none disabled:opacity-60 sm:text-sm"
              />
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy || transcribing}
                title={listening ? "Stop met luisteren" : "Spreek tegen Jarvis"}
                aria-pressed={listening}
                style={listening ? { boxShadow: `0 0 0 ${2 + micLevelPct / 20}px rgba(255,196,107,0.18)` } : undefined}
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
              Microfoon: Chrome/Edge werkt direct. Andere browsers: zet{" "}
              <span className="font-mono">WHISPER_ENABLED=true</span> voor lokale spraakherkenning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A Claude-Code-style collapsible block of the model's thinking + tool steps.
 *  Stays open while the turn is running; tucks itself away once it's done. */
function StepBlock({ events, running }: { events: TurnEvent[]; running?: boolean }) {
  if (!events.length && !running) return null;
  const last = events[events.length - 1];
  return (
    <details
      {...(running ? { open: true } : {})}
      className="mb-2 rounded-lg border border-white/10 bg-white/[0.03]"
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-[11px] text-white/55 [&::-webkit-details-marker]:hidden">
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${running ? "animate-pulse bg-brand-mint" : "bg-white/30"}`} />
        <span className="font-medium">{running ? (last?.title ?? "Bezig…") : `${events.length} stappen`}</span>
        {!running && last && <span className="text-white/30">· {agentLabel(last.agent)}</span>}
      </summary>
      <div className="space-y-1 border-t border-white/5 px-3 py-2 font-mono text-[11px] text-white/70">
        {events.map((e) => (
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
                {" "}
                · {agentLabel(e.agent)}
                {e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : ""}
              </span>
            </div>
            {e.detail && (
              <div className="whitespace-pre-wrap pl-4 text-white/40">
                {e.detail.length > 500 ? `${e.detail.slice(0, 500)}…` : e.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
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
