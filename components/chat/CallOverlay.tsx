"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDuration } from "./shared";
import { Portal } from "./Portal";
import { Avatar } from "./Avatar";
import { makeRingback } from "./ringtone";

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

// Two peers are almost never on the same LAN, so host-only candidates fail to
// connect in practice — a STUN server is the minimum needed to discover each
// side's public IP:port (it never sees or relays media). NEXT_PUBLIC_STUN_URL
// can override/extend this. Symmetric NAT / strict corporate firewalls still
// need a TURN relay to actually forward media — fetched below, per call, from
// /api/calls/turn (self-hosted coturn; falls back to STUN-only if unset).
const STUN: RTCIceServer[] = [
  ...(process.env.NEXT_PUBLIC_STUN_URL ? [{ urls: process.env.NEXT_PUBLIC_STUN_URL }] : []),
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const r = await fetch("/api/calls/turn", { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return STUN;
    const d = (await r.json()) as { turn: { urls: string[]; username: string; credential: string } | null };
    if (!d.turn) return STUN;
    return [...STUN, { urls: d.turn.urls, username: d.turn.username, credential: d.turn.credential }];
  } catch {
    return STUN;
  }
}

// Only a video sender negotiated at call start can carry a screen without
// renegotiation. Found via its transceiver, since replaceTrack(null) clears sender.track.
function videoSenderOf(peer: RTCPeerConnection | null): RTCRtpSender | null {
  return peer?.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender ?? null;
}

export function CallOverlay({
  threadId,
  callId,
  mode,
  role,
  peerName,
  peerUserId,
  peerRole,
  avatars,
  onEnd,
}: {
  threadId: string;
  callId: string;
  mode: Mode;
  role: Role;
  peerName: string;
  peerUserId: string;
  peerRole: string;
  avatars: Record<string, string>;
  onEnd: () => void;
}) {
  const [state, setState] = useState<"ringing" | "connecting" | "live" | "ended" | "failed">(
    role === "caller" ? "ringing" : "connecting",
  );
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(mode === "audio");
  const [sharing, setSharing] = useState(mode === "screen" && role === "caller");
  const [secs, setSecs] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  // What the self-view shows: the camera stream, or the screen while sharing.
  const localPreview = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const localVideoEl = useRef<HTMLVideoElement | null>(null);
  const remoteVideoEl = useRef<HTMLVideoElement | null>(null);
  const remoteAudioEl = useRef<HTMLAudioElement | null>(null);
  const since = useRef(0);
  const started = useRef(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ended = useRef(false);

  // The media elements remount whenever the call is minimized/expanded or
  // video switches on, so each one picks up the current stream as it mounts.
  const bindLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localVideoEl.current = el;
    if (el && localPreview.current && el.srcObject !== localPreview.current) el.srcObject = localPreview.current;
  }, []);
  const bindRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoEl.current = el;
    if (el && remoteStream.current && el.srcObject !== remoteStream.current) el.srcObject = remoteStream.current;
  }, []);
  const bindRemoteAudio = useCallback((el: HTMLAudioElement | null) => {
    remoteAudioEl.current = el;
    if (el && remoteStream.current && el.srcObject !== remoteStream.current) {
      el.srcObject = remoteStream.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  const showLocal = useCallback((stream: MediaStream) => {
    localPreview.current = stream;
    if (localVideoEl.current) localVideoEl.current.srcObject = stream;
  }, []);

  const attachStream = useCallback(
    (stream: MediaStream) => {
      localStream.current = stream;
      showLocal(stream);
    },
    [showLocal],
  );

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
    (notify: boolean, failed = false) => {
      if (ended.current) return;
      ended.current = true;
      if (poll.current) clearInterval(poll.current);
      if (tick.current) clearInterval(tick.current);
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
      localStream.current?.getTracks().forEach((t) => t.stop());
      screenTrack.current?.stop();
      pc.current?.close();
      if (notify) {
        const dur = started.current ? Math.round((Date.now() - started.current) / 1000) : 0;
        void post("end", { durationSec: dur });
      }
      if (failed) {
        // Keep the overlay up with a clear error instead of silently
        // vanishing — a silent close looked exactly like "it just doesn't
        // connect" with no way to tell what happened.
        setMinimized(false);
        setState("failed");
      } else {
        setState("ended");
        onEnd();
      }
    },
    [onEnd, post],
  );

  // The callee of a screen-share call only talks; the caller is the one sharing.
  const getMedia = useCallback(async (): Promise<MediaStream> => {
    if (mode === "screen" && role === "caller") {
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
  }, [mode, role]);

  const stopShare = useCallback(async () => {
    const screen = screenTrack.current;
    if (!screen) return;
    screenTrack.current = null;
    screen.onended = null;
    screen.stop();
    setSharing(false);
    // back to the camera on a video call; a screen-share call just stops sending video
    const cam = mode === "video" ? localStream.current?.getVideoTracks()[0] ?? null : null;
    await videoSenderOf(pc.current)?.replaceTrack(cam).catch(() => undefined);
    if (localStream.current) showLocal(localStream.current);
  }, [mode, showLocal]);

  const startShare = useCallback(async () => {
    const sender = videoSenderOf(pc.current);
    if (!sender) return;
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      if (!track) return;
      await sender.replaceTrack(track);
      screenTrack.current = track;
      track.onended = () => void stopShare();
      showLocal(screen);
      setSharing(true);
    } catch {
      /* user cancelled the picker */
    }
  }, [showLocal, stopShare]);

  const makePc = useCallback((ice: RTCIceServer[]) => {
    const peer = new RTCPeerConnection({ iceServers: ice });
    peer.onicecandidate = (e) => {
      if (e.candidate) void post("candidate", e.candidate.toJSON());
    };
    peer.ontrack = (e) => {
      // Remote audio is only heard through a media element: the hidden
      // <audio> always has the stream, the <video> tiles are muted views.
      const stream = e.streams[0] ?? remoteStream.current ?? new MediaStream();
      if (!e.streams[0] && !stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      remoteStream.current = stream;
      const audio = remoteAudioEl.current;
      if (audio && audio.srcObject !== stream) {
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      }
      if (remoteVideoEl.current && remoteVideoEl.current.srcObject !== stream) remoteVideoEl.current.srcObject = stream;
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        if (disconnectTimer.current) {
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
        }
        started.current = started.current || Date.now();
        setState("live");
        if (!tick.current) tick.current = setInterval(() => setSecs((s) => s + 1), 1000);
      } else if (peer.connectionState === "disconnected") {
        // Often transient (a brief network blip) — ICE can recover back to
        // "connected" on its own. Give it a grace period instead of tearing
        // the call down on the first flicker.
        if (!disconnectTimer.current) {
          disconnectTimer.current = setTimeout(() => cleanup(started.current > 0, true), 8_000);
        }
      } else if (["failed", "closed"].includes(peer.connectionState)) {
        cleanup(started.current > 0, true);
      }
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
            // The other side has picked up — stop the ring-back immediately
            // rather than waiting for ICE to fully connect, which can take a
            // few more seconds and left the ringtone audibly playing well
            // after the callee had already answered.
            setState("connecting");
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
    [role, getMedia, post, cleanup, attachStream],
  );

  // start
  useEffect(() => {
    let alive = true;
    (async () => {
      const ice = await fetchIceServers();
      if (!alive) return;
      const peer = makePc(ice);
      if (role === "caller") {
        const stream = await getMedia().catch(() => null);
        if (!stream || !alive) return cleanup(false);
        attachStream(stream);
        if (mode === "screen") {
          const shared = stream.getVideoTracks()[0] ?? null;
          screenTrack.current = shared;
          if (shared) shared.onended = () => void stopShare();
        }
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

  // ring-back tone while the caller waits for the other side to pick up
  useEffect(() => {
    if (role !== "caller" || state !== "ringing") return;
    const ringer = makeRingback();
    ringer.start();
    return () => ringer.stop();
  }, [role, state]);

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
  const toggleShare = () => void (screenTrack.current ? stopShare() : startShare());

  const showVideo = mode !== "audio";
  const showSelfView = mode === "video" ? !camOff || sharing : sharing;
  const canShare = mode === "video" || (mode === "screen" && role === "caller");
  const status =
    state === "ringing"
      ? "Overgaan…"
      : state === "connecting"
        ? "Verbinden…"
        : state === "live"
          ? fmtDuration(secs)
          : state === "ended"
            ? "Beëindigd"
            : "Verbinding mislukt";

  const muteButton = (size: string) => (
    <button
      type="button"
      onClick={toggleMute}
      className={`grid ${size} place-items-center rounded-full ${muted ? "bg-white text-ink" : "bg-white/15"}`}
      aria-label={muted ? "Microfoon aan" : "Microfoon uit"}
    >
      {muted ? "🔇" : "🎙️"}
    </button>
  );
  const hangupButton = (size: string) => (
    <button
      type="button"
      onClick={() => cleanup(true)}
      className={`grid ${size} place-items-center rounded-full bg-crit`}
      aria-label="Ophangen"
    >
      📵
    </button>
  );

  return (
    <Portal>
      <audio ref={bindRemoteAudio} autoPlay className="hidden" />
      {minimized ? (
        // Compact bar so the chat underneath stays usable during the call.
        <div
          role="status"
          className="fixed left-1/2 top-3 z-[80] flex w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#0b0f0e] px-3 py-2 text-white shadow-lift"
        >
          {showVideo ? (
            <video ref={bindRemoteVideo} autoPlay playsInline muted className="h-12 w-16 flex-shrink-0 rounded-lg bg-black object-cover" />
          ) : (
            <Avatar userId={peerUserId} name={peerName} role={peerRole} avatars={avatars} size={36} />
          )}
          <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left leading-tight">
            <span className="block truncate text-sm font-semibold">{peerName}</span>
            <span className="block text-xs text-white/60">{status}</span>
          </button>
          {muteButton("h-9 w-9 text-base")}
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-base"
            aria-label="Groot scherm"
          >
            ⤢
          </button>
          {hangupButton("h-9 w-11 text-base")}
        </div>
      ) : (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f0e] text-white">
          <div className="flex items-center gap-3 p-4">
            <span className="font-display text-lg font-semibold">{peerName}</span>
            <span className="text-sm text-white/60">{status}</span>
            {state !== "failed" && (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
              >
                ↙ Verkleinen en verder chatten
              </button>
            )}
          </div>

          {state === "failed" ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-crit/20 text-3xl">⚠️</div>
                <p className="mt-4 text-base font-semibold">Kon niet verbinden met {peerName}</p>
                <p className="mt-1.5 max-w-sm text-sm text-white/60">
                  Dit gebeurt meestal als jullie netwerken geen directe verbinding kunnen opzetten. Probeer het
                  opnieuw, of vraag de ander om via wifi te bellen in plaats van mobiel internet.
                </p>
                <button type="button" onClick={() => { setState("ended"); onEnd(); }} className="btn-primary mt-5">
                  Sluiten
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex-1">
              {showVideo ? (
                <video ref={bindRemoteVideo} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <Avatar userId={peerUserId} name={peerName} role={peerRole} avatars={avatars} size={112} />
                </div>
              )}
              {showSelfView && (
                <video
                  ref={bindLocalVideo}
                  autoPlay
                  playsInline
                  muted
                  className="absolute bottom-4 right-4 w-32 rounded-lg border border-white/20 bg-black object-cover"
                />
              )}
            </div>
          )}

          {state !== "failed" && (
            <div className="flex items-center justify-center gap-4 p-6">
              {muteButton("h-12 w-12 text-xl")}
              {mode === "video" && (
                <button
                  type="button"
                  onClick={toggleCam}
                  className={`grid h-12 w-12 place-items-center rounded-full text-xl ${camOff ? "bg-white text-ink" : "bg-white/15"}`}
                  aria-label="Camera"
                >
                  {camOff ? "📵" : "📷"}
                </button>
              )}
              {canShare && (
                <button
                  type="button"
                  onClick={toggleShare}
                  className={`grid h-12 w-12 place-items-center rounded-full text-xl ${sharing ? "bg-brand-mint text-ink" : "bg-white/15"}`}
                  aria-label={sharing ? "Stop scherm delen" : "Scherm delen"}
                >
                  🖥️
                </button>
              )}
              {hangupButton("h-12 w-16 text-xl")}
            </div>
          )}
        </div>
      )}
    </Portal>
  );
}
