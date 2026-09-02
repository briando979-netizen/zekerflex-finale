"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDuration } from "./shared";
import { Portal } from "./Portal";

type Mode = "audio" | "video" | "screen";
type Role = "caller" | "callee";

interface Signal {
  seq: number;
  from: string;
  type: string;
  mode: Mode | null;
  data: unknown;
  at: string;
}

// Sovereign default: host/LAN candidates only. Set NEXT_PUBLIC_STUN_URL to add a
// STUN server if peers sit behind different NATs.
const ICE: RTCIceServer[] = process.env.NEXT_PUBLIC_STUN_URL
  ? [{ urls: process.env.NEXT_PUBLIC_STUN_URL }]
  : [];

export function CallOverlay({
  threadId,
  callId,
  mode,
  role,
  peerName,
  onEnd,
}: {
  threadId: string;
  callId: string;
  mode: Mode;
  role: Role;
  peerName: string;
  onEnd: () => void;
}) {
  const [state, setState] = useState<"ringing" | "connecting" | "live" | "ended">(
    role === "caller" ? "ringing" : "connecting",
  );
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(mode === "audio");
  const [sharing, setSharing] = useState(mode === "screen");
  const [secs, setSecs] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const since = useRef(0);
  const started = useRef(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const ended = useRef(false);

  const post = useCallback(
    (type: string, data?: unknown) =>
      fetch(`/api/inbox/${threadId}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, type, mode, data }),
      }).catch(() => undefined),
    [threadId, callId, mode],
  );

  const cleanup = useCallback(
    (notify: boolean) => {
      if (ended.current) return;
      ended.current = true;
      if (poll.current) clearInterval(poll.current);
      if (tick.current) clearInterval(tick.current);
      localStream.current?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
      if (notify) {
        const dur = started.current ? Math.round((Date.now() - started.current) / 1000) : 0;
        void post("end", { durationSec: dur });
      }
      setState("ended");
      onEnd();
    },
    [onEnd, post],
  );

  const getMedia = useCallback(async (): Promise<MediaStream> => {
    if (mode === "screen") {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // still grab a mic track so the other side hears you
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach((t) => s.addTrack(t));
      } catch {
        /* no mic — screen only */
      }
      return s;
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
  }, [mode]);

  const attachStream = (stream: MediaStream) => {
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
  };

  const makePc = useCallback(() => {
    const peer = new RTCPeerConnection({ iceServers: ICE });
    peer.onicecandidate = (e) => {
      if (e.candidate) void post("candidate", e.candidate.toJSON());
    };
    peer.ontrack = (e) => {
      if (remoteVideo.current && e.streams[0]) {
        remoteVideo.current.srcObject = e.streams[0];
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        started.current = started.current || Date.now();
        setState("live");
        if (!tick.current) tick.current = setInterval(() => setSecs((s) => s + 1), 1000);
      }
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) cleanup(false);
    };
    pc.current = peer;
    return peer;
  }, [post, cleanup]);

  const handleSignals = useCallback(
    async (signals: Signal[]) => {
      const peer = pc.current;
      if (!peer) return;
      for (const s of signals) {
        since.current = Math.max(since.current, s.seq + 1);
        try {
          if (s.type === "offer" && role === "callee") {
            await peer.setRemoteDescription(new RTCSessionDescription(s.data as RTCSessionDescriptionInit));
            const stream = localStream.current ?? (await getMedia());
            if (!localStream.current) {
              attachStream(stream);
              stream.getTracks().forEach((t) => peer.addTrack(t, stream));
            }
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await post("answer", answer);
            setState("connecting");
          } else if (s.type === "answer" && role === "caller") {
            await peer.setRemoteDescription(new RTCSessionDescription(s.data as RTCSessionDescriptionInit));
          } else if (s.type === "candidate") {
            await peer.addIceCandidate(new RTCIceCandidate(s.data as RTCIceCandidateInit));
          } else if (s.type === "end" || s.type === "decline") {
            cleanup(false);
          }
        } catch {
          /* tolerate out-of-order frames */
        }
      }
    },
    [role, getMedia, post, cleanup],
  );

  // start
  useEffect(() => {
    let alive = true;
    (async () => {
      const peer = makePc();
      if (role === "caller") {
        const stream = await getMedia().catch(() => null);
        if (!stream || !alive) return cleanup(false);
        attachStream(stream);
        stream.getTracks().forEach((t) => peer.addTrack(t, stream));
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: mode !== "audio" });
        await peer.setLocalDescription(offer);
        await post("ring");
        await post("offer", offer);
      }
      poll.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/inbox/${threadId}/call?callId=${callId}&since=${since.current}`, {
            cache: "no-store",
          });
          if (!r.ok) return;
          const d = await r.json();
          if (d.signals?.length) await handleSignals(d.signals as Signal[]);
        } catch {
          /* ignore */
        }
      }, 1200);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-hangup a never-answered call after 45s
  useEffect(() => {
    if (state !== "ringing") return;
    const t = setTimeout(() => cleanup(true), 45_000);
    return () => clearTimeout(t);
  }, [state, cleanup]);

  const toggleMute = () => {
    const on = !muted;
    setMuted(on);
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
  };
  const toggleCam = () => {
    const off = !camOff;
    setCamOff(off);
    localStream.current?.getVideoTracks().forEach((t) => (t.enabled = !off));
  };
  const toggleShare = async () => {
    const peer = pc.current;
    if (!peer) return;
    try {
      if (!sharing) {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = screen.getVideoTracks()[0];
        if (!track) return;
        const sender = peer.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
        else peer.addTrack(track, screen);
        if (localVideo.current) localVideo.current.srcObject = screen;
        track.onended = () => void toggleShare();
        setSharing(true);
      } else {
        const cam = await navigator.mediaDevices.getUserMedia({ video: mode === "video" });
        const track = cam.getVideoTracks()[0] ?? null;
        const sender = peer.getSenders().find((s) => s.track?.kind === "video");
        if (sender && track) await sender.replaceTrack(track);
        if (localVideo.current) localVideo.current.srcObject = localStream.current;
        setSharing(false);
      }
    } catch {
      /* user cancelled the picker */
    }
  };

  const showVideo = mode !== "audio" || sharing;

  return (
    <Portal>
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f0e] text-white">
      <div className="flex items-center gap-3 p-4">
        <span className="font-display text-lg font-semibold">{peerName}</span>
        <span className="text-sm text-white/60">
          {state === "ringing" && "Overgaan…"}
          {state === "connecting" && "Verbinden…"}
          {state === "live" && fmtDuration(secs)}
          {state === "ended" && "Beëindigd"}
        </span>
      </div>

      <div className="relative flex-1">
        {showVideo ? (
          <video ref={remoteVideo} autoPlay playsInline className="h-full w-full bg-black object-contain" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-white/10 text-4xl">🔊</div>
          </div>
        )}
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className={`absolute bottom-4 right-4 w-32 rounded-lg border border-white/20 bg-black object-cover ${
            showVideo ? "" : "hidden"
          }`}
        />
      </div>

      <div className="flex items-center justify-center gap-4 p-6">
        <button
          type="button"
          onClick={toggleMute}
          className={`grid h-12 w-12 place-items-center rounded-full text-xl ${muted ? "bg-white text-ink" : "bg-white/15"}`}
          aria-label="Microfoon"
        >
          {muted ? "🔇" : "🎙️"}
        </button>
        {mode !== "audio" && (
          <button
            type="button"
            onClick={toggleCam}
            className={`grid h-12 w-12 place-items-center rounded-full text-xl ${camOff ? "bg-white text-ink" : "bg-white/15"}`}
            aria-label="Camera"
          >
            {camOff ? "📵" : "📷"}
          </button>
        )}
        <button
          type="button"
          onClick={toggleShare}
          className={`grid h-12 w-12 place-items-center rounded-full text-xl ${sharing ? "bg-brand-mint text-ink" : "bg-white/15"}`}
          aria-label="Scherm delen"
        >
          🖥️
        </button>
        <button
          type="button"
          onClick={() => cleanup(true)}
          className="grid h-12 w-16 place-items-center rounded-full bg-crit text-xl"
          aria-label="Ophangen"
        >
          📵
        </button>
      </div>
    </div>
    </Portal>
  );
}
