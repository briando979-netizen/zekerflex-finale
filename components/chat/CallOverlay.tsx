"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { canShareScreen, fmtDuration } from "./shared";
import { Portal } from "./Portal";
import { Avatar } from "./Avatar";
import { makeRingback } from "./ringtone";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";
import { IconCameraFlip, IconChevronDown, IconMic, IconMicOff, IconPhoneDown, IconScreenShare, IconVideo, IconVideoOff } from "./icons";

type Mode = "audio" | "video" | "screen";
type Role = "caller" | "callee";
type Hoek = "lt" | "rt" | "lb" | "rb";

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

// Only a video sender negotiated at call start can carry a camera or screen without
// renegotiation. Found via its transceiver, since replaceTrack(null) clears sender.track.
// Since 15 nov 2026 a voice call negotiates one too (empty), so you can switch to video mid-call, like WhatsApp.
function videoSenderOf(peer: RTCPeerConnection | null): RTCRtpSender | null {
  return peer?.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender ?? null;
}

// Each side posts its candidates while the offer/answer is still on its way, so
// they can arrive first. Adding one before the remote description fails, and a
// lost candidate can be the only route that works, so they wait in a queue.
async function addQueued(peer: RTCPeerConnection, queue: RTCIceCandidateInit[]): Promise<void> {
  for (const c of queue.splice(0)) await peer.addIceCandidate(c).catch(() => undefined);
}

/** Waar het eigen kleine beeld staat; na het slepen springt het naar de dichtstbijzijnde hoek. */
const HOEK_KLASSE: Record<Hoek, string> = {
  lt: "left-3 top-[calc(4.5rem+env(safe-area-inset-top))]",
  rt: "right-3 top-[calc(4.5rem+env(safe-area-inset-top))]",
  lb: "left-3 bottom-[calc(7.5rem+env(safe-area-inset-bottom))]",
  rb: "right-3 bottom-[calc(7.5rem+env(safe-area-inset-bottom))]",
};

/** Een ronde knop van het belscherm. `aan` = de omgekeerde stand (wit, zoals bij WhatsApp: gedempt, camera uit). */
function BelKnop({ label, onClick, aan = false, children }: { label: string; onClick: () => void; aan?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={aan}
      title={label}
      className={`grid h-14 w-14 flex-shrink-0 place-items-center rounded-full focus-visible:rounded-full text-2xl transition active:scale-95 ${aan ? "bg-white text-ink" : "bg-white/15 text-white hover:bg-white/25"}`}
    >
      {children}
    </button>
  );
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
  const chat = useChatTeksten();
  const [state, setState] = useState<"ringing" | "connecting" | "live" | "ended" | "failed">(
    role === "caller" ? "ringing" : "connecting",
  );
  const [muted, setMuted] = useState(false);
  // de eigen camera stuurt beeld (een spraakoproep kan midden in het gesprek naar video)
  const [camOn, setCamOn] = useState(mode === "video");
  // de ander stuurt beeld (camera of scherm); een oude versie van de app meldt dat niet, dan geldt de soort oproep
  const [anderBeeld, setAnderBeeld] = useState(mode === "video" || (mode === "screen" && role === "callee"));
  const [kanVideo, setKanVideo] = useState(false);
  const [kanWisselen, setKanWisselen] = useState(false);
  const [voorCamera, setVoorCamera] = useState(true);
  const [grootIk, setGrootIk] = useState(false);
  const [knoppen, setKnoppen] = useState(true);
  const [tik, setTik] = useState(0);
  const [melding, setMelding] = useState("");
  const [hoek, setHoek] = useState<Hoek>("rt");
  const [sleep, setSleep] = useState<{ x: number; y: number } | null>(null);
  const [failReason, setFailReason] = useState<"network" | "media">("network");
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
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const pipDrag = useRef<{ id: number; x0: number; y0: number; moved: boolean } | null>(null);

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

  // laat de ander weten of er beeld komt: dan toont die je foto in plaats van een zwart vlak
  const meldBeeld = useCallback(
    (camera: boolean) => void post("media", { camera, scherm: Boolean(screenTrack.current) }),
    [post],
  );

  const telCameras = useCallback(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setKanWisselen(d.filter((x) => x.kind === "videoinput").length > 1))
      .catch(() => undefined);
  }, []);

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

  // No microphone (or no permission): say so, instead of a call that just vanishes.
  const mediaFailed = useCallback(() => {
    setFailReason("media");
    cleanup(role === "callee", true);
  }, [cleanup, role]);

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
    if (mode === "video") {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
      } catch {
        // no camera (a desktop without webcam): carry on as a voice call, the other side's video still shows
        setCamOn(false);
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }, [mode, role]);

  // Na het ophalen van microfoon (en camera): in een video-oproep zonder camera meteen melden, en tellen hoeveel camera's er zijn.
  const naMedia = useCallback(
    (stream: MediaStream) => {
      if (mode !== "video") return;
      if (stream.getVideoTracks().length === 0) meldBeeld(false);
      else telCameras();
    },
    [mode, meldBeeld, telCameras],
  );

  /** Camera aan (of de andere camera): de oude stopt eerst (een telefoon geeft er vaak maar één tegelijk). */
  const camAan = useCallback(
    async (voor: boolean): Promise<boolean> => {
      const sender = videoSenderOf(pc.current);
      if (!sender) return false;
      const stream = localStream.current ?? new MediaStream();
      localStream.current = stream;
      for (const t of stream.getVideoTracks()) {
        t.stop();
        stream.removeTrack(t);
      }
      const nieuw = await navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: voor ? "user" : "environment" } } })
        .catch(() => null);
      const track = nieuw?.getVideoTracks()[0];
      if (!track) {
        if (!screenTrack.current) await sender.replaceTrack(null).catch(() => undefined);
        setMelding(chat.bel.cameraGeenToegang);
        return false;
      }
      stream.addTrack(track);
      if (!screenTrack.current) {
        await sender.replaceTrack(track).catch(() => undefined);
        showLocal(new MediaStream([track]));
      }
      telCameras();
      return true;
    },
    [chat.bel.cameraGeenToegang, showLocal, telCameras],
  );

  const camUit = useCallback(async () => {
    if (!screenTrack.current) await videoSenderOf(pc.current)?.replaceTrack(null).catch(() => undefined);
    const stream = localStream.current;
    for (const t of stream?.getVideoTracks() ?? []) {
      t.stop();
      stream?.removeTrack(t);
    }
  }, []);

  const stopShare = useCallback(async () => {
    const screen = screenTrack.current;
    if (!screen) return;
    screenTrack.current = null;
    screen.onended = null;
    screen.stop();
    setSharing(false);
    // back to the camera if it is on; otherwise the call just stops sending video
    const cam = localStream.current?.getVideoTracks()[0] ?? null;
    await videoSenderOf(pc.current)?.replaceTrack(cam).catch(() => undefined);
    if (cam) showLocal(new MediaStream([cam]));
    meldBeeld(Boolean(cam));
  }, [showLocal, meldBeeld]);

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
      meldBeeld(Boolean(localStream.current?.getVideoTracks().length));
    } catch {
      /* user cancelled the picker */
    }
  }, [showLocal, stopShare, meldBeeld]);

  const makePc = useCallback((ice: RTCIceServer[]) => {
    const peer = new RTCPeerConnection({ iceServers: ice });
    peer.onicecandidate = (e) => {
      if (e.candidate) void post("candidate", e.candidate.toJSON());
    };
    peer.ontrack = (e) => {
      // Remote audio is only heard through a media element: the hidden
      // <audio> always has the stream, the <video> tiles are muted views.
      const stream = e.streams[0] ?? remoteStream.current ?? new MediaStream();
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
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
        setKanVideo(Boolean(videoSenderOf(peer)));
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
            await addQueued(peer, pendingCandidates.current);
            if (!localStream.current) {
              const stream = await getMedia().catch(() => null);
              if (!stream) return mediaFailed();
              attachStream(stream);
              stream.getTracks().forEach((t) => peer.addTrack(t, stream));
              naMedia(stream);
            }
            // ook zonder camera beeld kunnen sturen: later video aan is dan alleen replaceTrack, geen nieuwe onderhandeling
            for (const t of peer.getTransceivers()) {
              if (t.receiver.track?.kind === "video" && t.direction === "recvonly") t.direction = "sendrecv";
            }
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await post("answer", answer);
            setKanVideo(Boolean(videoSenderOf(peer)));
            setState("connecting");
          } else if (s.type === "answer" && role === "caller") {
            await peer.setRemoteDescription(new RTCSessionDescription(s.data as RTCSessionDescriptionInit));
            await addQueued(peer, pendingCandidates.current);
            // The other side has picked up — stop the ring-back immediately
            // rather than waiting for ICE to fully connect, which can take a
            // few more seconds and left the ringtone audibly playing well
            // after the callee had already answered.
            setState("connecting");
          } else if (s.type === "candidate") {
            const candidate = s.data as RTCIceCandidateInit;
            if (peer.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(candidate));
            else pendingCandidates.current.push(candidate);
          } else if (s.type === "media") {
            const d = (s.data ?? {}) as { camera?: unknown; scherm?: unknown };
            setAnderBeeld(d.camera === true || d.scherm === true);
          } else if (s.type === "end" || s.type === "decline") {
            cleanup(false);
          }
        } catch {
          /* tolerate out-of-order frames */
        }
      }
    },
    [role, getMedia, post, cleanup, attachStream, mediaFailed, naMedia],
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
        if (!alive) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        // a cancelled screen picker is a choice, not an error
        if (!stream) return mode === "screen" ? cleanup(false) : mediaFailed();
        attachStream(stream);
        if (mode === "screen") {
          const shared = stream.getVideoTracks()[0] ?? null;
          screenTrack.current = shared;
          if (shared) shared.onended = () => void stopShare();
        }
        stream.getTracks().forEach((t) => peer.addTrack(t, stream));
        // een spraakoproep (of video zonder camera) krijgt toch een lege videolijn: video aan kan dan midden in het gesprek
        if (!stream.getVideoTracks().length) peer.addTransceiver("video", { direction: "sendrecv", streams: [stream] });
        // scherm delen zonder microfoon: toch de ander kunnen horen (wat offerToReceiveAudio vroeger deed)
        if (!stream.getAudioTracks().length) peer.addTransceiver("audio", { direction: "recvonly" });
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await post("ring");
        await post("offer", offer);
        setKanVideo(Boolean(videoSenderOf(peer)));
        naMedia(stream);
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

  // Tabblad dicht of weg tijdens een oproep: toch "end" sturen (sendBeacon komt ook bij het sluiten nog aan). Anders bleef het
  // bij de ander tot 90 s overgaan en gaf opnemen "kon niet verbinden" (belproef 15 nov 2026). WhatsApp stopt meteen.
  useEffect(() => {
    const weg = () => {
      if (ended.current) return;
      ended.current = true;
      const dur = started.current ? Math.round((Date.now() - started.current) / 1000) : 0;
      const body = new Blob([JSON.stringify({ callId, type: "end", mode, data: { durationSec: dur } })], { type: "text/plain" }); // tekst: altijd toegestaan voor sendBeacon; de route leest het als JSON
      navigator.sendBeacon?.(`/api/inbox/${threadId}/call`, body);
    };
    window.addEventListener("pagehide", weg);
    return () => window.removeEventListener("pagehide", weg);
  }, [threadId, callId, mode]);

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

  // een melding (geen camera) verdwijnt vanzelf
  useEffect(() => {
    if (!melding) return;
    const t = setTimeout(() => setMelding(""), 4500);
    return () => clearTimeout(t);
  }, [melding]);

  const beeld = anderBeeld || camOn || sharing;

  // bij video verdwijnen de knoppen na een paar seconden, zoals bij WhatsApp; tikken haalt ze terug
  useEffect(() => {
    if (!beeld || state !== "live" || !knoppen || minimized) return;
    const t = setTimeout(() => setKnoppen(false), 5000);
    return () => clearTimeout(t);
  }, [beeld, state, knoppen, minimized, tik]);

  const toonKnoppen = () => {
    setKnoppen(true);
    setTik((n) => n + 1);
  };

  const toggleMute = () => {
    const on = !muted;
    setMuted(on);
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
    toonKnoppen();
  };
  const toggleVideo = async () => {
    toonKnoppen();
    if (camOn) {
      await camUit();
      setCamOn(false);
      setGrootIk(false);
      meldBeeld(false);
    } else if (await camAan(voorCamera)) {
      setCamOn(true);
      meldBeeld(true);
    }
  };
  const wisselCamera = async () => {
    toonKnoppen();
    const voor = !voorCamera;
    if (await camAan(voor)) {
      setVoorCamera(voor);
    } else {
      // de andere camera lukte niet: dan helemaal uit, zodat de ander geen bevroren beeld ziet
      setCamOn(false);
      meldBeeld(false);
    }
  };
  const toggleShare = () => {
    toonKnoppen();
    void (screenTrack.current ? stopShare() : startShare());
  };

  // het kleine beeld: tikken wisselt groot en klein, slepen zet het in een andere hoek
  const pipDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pipDrag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
  };
  const pipMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = pipDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    setSleep({ x: dx, y: dy });
  };
  const pipUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = pipDrag.current;
    pipDrag.current = null;
    if (!d) return;
    if (!d.moved) {
      setGrootIk((g) => !g);
      toonKnoppen();
      return;
    }
    setSleep(null);
    setHoek(`${e.clientX < window.innerWidth / 2 ? "l" : "r"}${e.clientY < window.innerHeight / 2 ? "t" : "b"}` as Hoek);
  };

  // phones have no screen capture; the overlay only renders in the browser, so this is hydration-safe
  const canShare = canShareScreen() && (mode === "video" || mode === "audio" || (mode === "screen" && role === "caller"));
  const videoKnop = kanVideo && mode !== "screen";
  // vóór het opnemen zie je jezelf groot (zoals bij WhatsApp); daarna de ander, tenzij je wisselt
  const eigenGroot = (camOn || sharing) && (grootIk || state !== "live");
  const kleinBeeld = eigenGroot ? state === "live" : camOn || sharing;
  const spiegel = camOn && voorCamera && !sharing;
  const knoppenZichtbaar = knoppen || !beeld || state !== "live";
  const status =
    state === "ringing"
      ? chat.bel.statusOvergaan
      : state === "connecting"
        ? chat.bel.statusVerbinden
        : state === "live"
          ? fmtDuration(secs)
          : state === "ended"
            ? chat.bel.statusBeeindigd
            : failReason === "media"
              ? chat.bel.statusGeenMicrofoon
              : chat.bel.statusMislukt;

  const anderAvatar = (size: number) => <Avatar userId={peerUserId} name={peerName} role={peerRole} avatars={avatars} size={size} />;
  const eigenVideo = (klasse: string) => (
    <video ref={bindLocalVideo} autoPlay playsInline muted className={`${klasse} bg-black object-cover ${spiegel ? "-scale-x-100" : ""}`} />
  );
  const anderVideo = (klasse: string) => <video ref={bindRemoteVideo} autoPlay playsInline muted className={`${klasse} bg-black`} />;

  return (
    <Portal>
      <audio ref={bindRemoteAudio} autoPlay className="hidden" />
      {minimized ? (
        // Compact bar so the chat underneath stays usable during the call.
        <div
          role="status"
          className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[2100] mx-auto flex max-w-[26rem] items-center gap-2 rounded-2xl bg-[#0b0f0e] px-3 py-2 text-white shadow-lift"
        >
          {anderBeeld ? anderVideo("h-12 w-16 flex-shrink-0 rounded-lg object-cover") : anderAvatar(36)}
          <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left leading-tight">
            <span className="block truncate text-sm font-semibold">{peerName}</span>
            <span className="block text-xs text-white/60">{status}</span>
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? chat.bel.microfoonAan : chat.bel.microfoonUit}
            aria-pressed={muted}
            className={`grid h-9 w-9 place-items-center rounded-full focus-visible:rounded-full text-lg ${muted ? "bg-white text-ink" : "bg-white/15"}`}
          >
            {muted ? <IconMicOff /> : <IconMic />}
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="grid h-9 w-9 place-items-center rounded-full focus-visible:rounded-full bg-white/15 text-lg"
            aria-label={chat.bel.grootScherm}
          >
            <IconChevronDown className="rotate-180" />
          </button>
          <button type="button" onClick={() => cleanup(true)} className="grid h-9 w-11 place-items-center rounded-full focus-visible:rounded-full bg-crit text-lg" aria-label={chat.bel.ophangen}>
            <IconPhoneDown />
          </button>
        </div>
      ) : (
        <div
          className={`fixed inset-0 z-[2100] overflow-hidden text-white ${beeld ? "bg-black" : "bg-[#0b0f0e]"}`}
          onPointerMove={beeld && state === "live" && !knoppen ? toonKnoppen : undefined}
        >
          {state === "failed" ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full focus-visible:rounded-full bg-crit/20 text-3xl">⚠️</div>
                {failReason === "media" ? (
                  <>
                    <p className="mt-4 text-base font-semibold">{chat.bel.geenToegangTitel}</p>
                    <p className="mt-1.5 max-w-sm text-sm text-white/60">
                      {mode === "video" ? chat.bel.geenToegangVideo : chat.bel.geenToegangAudio}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-base font-semibold">{vulIn(chat.bel.verbindenMisluktTitel, { naam: peerName })}</p>
                    <p className="mt-1.5 max-w-sm text-sm text-white/60">
                      {chat.bel.verbindenMisluktUitleg}
                    </p>
                  </>
                )}
                <button type="button" onClick={() => { setState("ended"); onEnd(); }} className="btn-primary mt-5">
                  {chat.bel.sluiten}
                </button>
              </div>
            </div>
          ) : (
            <>
              {beeld ? (
                // het grote beeld vult het scherm; tikken toont of verbergt de knoppen
                <button
                  type="button"
                  onClick={() => (knoppen ? setKnoppen(false) : toonKnoppen())}
                  aria-label={chat.bel.knoppenTonen}
                  className="absolute inset-0 block h-full w-full cursor-default"
                >
                  {eigenGroot ? (
                    eigenVideo("h-full w-full")
                  ) : anderBeeld ? (
                    anderVideo("h-full w-full object-cover sm:object-contain")
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-[#0b0f0e]">
                      <span className="flex flex-col items-center text-center">
                        {anderAvatar(112)}
                        {mode !== "screen" && <span className="mt-4 text-sm text-white/70">{vulIn(chat.bel.cameraStaatUit, { naam: peerName })}</span>}
                      </span>
                    </span>
                  )}
                </button>
              ) : (
                // spraak: grote foto in het midden, naam en tijd eronder
                <div className="flex h-full flex-col items-center justify-center px-6 pb-36 text-center">
                  <div className="relative">
                    {(state === "ringing" || state === "connecting") && (
                      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full focus-visible:rounded-full bg-white/10" />
                    )}
                    {anderAvatar(128)}
                  </div>
                  <p className="mt-6 font-display text-2xl font-semibold">{peerName}</p>
                  <p className="mt-1 text-sm text-white/70">{status}</p>
                  {mode === "screen" && <p className="mt-1 text-xs text-white/50">{chat.bel.schermoproep}</p>}
                </div>
              )}

              {/* het kleine beeld: tikken = wisselen, slepen = andere hoek */}
              {beeld && kleinBeeld && (
                <button
                  type="button"
                  aria-label={chat.bel.beeldWisselen}
                  onPointerDown={pipDown}
                  onPointerMove={pipMove}
                  onPointerUp={pipUp}
                  onPointerCancel={() => {
                    pipDrag.current = null;
                    setSleep(null);
                  }}
                  onClick={(e) => {
                    // alleen het toetsenbord (Enter/spatie); tikken en slepen gaan via de pointer
                    if (e.detail === 0) setGrootIk((g) => !g);
                  }}
                  style={sleep ? { transform: `translate(${sleep.x}px, ${sleep.y}px)` } : undefined}
                  className={`absolute z-20 aspect-[3/4] w-[28vw] max-w-[9.5rem] touch-none overflow-hidden rounded-2xl focus-visible:rounded-2xl border border-white/25 bg-black shadow-lift ${sleep ? "" : "transition-all duration-200"} ${HOEK_KLASSE[hoek]}`}
                >
                  {eigenGroot ? (
                    anderBeeld ? (
                      anderVideo("h-full w-full object-cover")
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-[#0b0f0e]">{anderAvatar(56)}</span>
                    )
                  ) : (
                    eigenVideo("h-full w-full")
                  )}
                </button>
              )}

              {/* boven: terug naar de chat; bij video ook naam en tijd */}
              <div
                className={`absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3 pb-8 pt-[calc(0.75rem+env(safe-area-inset-top))] transition-opacity duration-300 ${knoppenZichtbaar ? "opacity-100" : "pointer-events-none opacity-0"} ${beeld ? "bg-gradient-to-b from-black/60 to-transparent" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label={chat.bel.terugNaarChat}
                  title={chat.bel.terugNaarChat}
                  className="grid h-11 w-11 place-items-center rounded-full focus-visible:rounded-full text-2xl hover:bg-white/10"
                >
                  <IconChevronDown />
                </button>
                {beeld && (
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-semibold">{peerName}</p>
                    <p className="text-xs text-white/75">{status}</p>
                  </div>
                )}
              </div>

              {/* onder: de knoppen in een balk, rood ophangen rechts */}
              <div
                className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-10 transition-opacity duration-300 ${knoppenZichtbaar ? "opacity-100" : "pointer-events-none opacity-0"} ${beeld ? "bg-gradient-to-t from-black/70 to-transparent" : ""}`}
              >
                {melding && (
                  <p role="alert" className="max-w-sm rounded-xl bg-black/70 px-3 py-2 text-center text-xs">
                    {melding}
                  </p>
                )}
                <div className="flex items-center gap-3 rounded-full focus-visible:rounded-full bg-white/10 px-3 py-2.5 backdrop-blur-md sm:gap-4">
                  {camOn && kanWisselen && !sharing && (
                    <BelKnop label={chat.bel.cameraWisselen} onClick={() => void wisselCamera()}>
                      <IconCameraFlip />
                    </BelKnop>
                  )}
                  {videoKnop && (
                    <BelKnop label={camOn ? chat.bel.videoUit : chat.bel.videoAan} onClick={() => void toggleVideo()} aan={mode === "video" && !camOn}>
                      {camOn ? <IconVideo /> : <IconVideoOff />}
                    </BelKnop>
                  )}
                  <BelKnop label={muted ? chat.bel.microfoonAan : chat.bel.microfoonUit} onClick={toggleMute} aan={muted}>
                    {muted ? <IconMicOff /> : <IconMic />}
                  </BelKnop>
                  {canShare && kanVideo && (
                    <BelKnop label={sharing ? chat.bel.stopSchermDelen : chat.bel.schermDelen} onClick={toggleShare} aan={sharing}>
                      <IconScreenShare />
                    </BelKnop>
                  )}
                  <button
                    type="button"
                    onClick={() => cleanup(true)}
                    aria-label={chat.bel.ophangen}
                    title={chat.bel.ophangen}
                    className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full focus-visible:rounded-full bg-crit text-3xl text-white transition hover:brightness-110 active:scale-95"
                  >
                    <IconPhoneDown />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Portal>
  );
}
