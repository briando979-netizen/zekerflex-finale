"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { biedtAan } from "@/lib/locatie/modules";
import { LOCATIE_TEKSTEN, type LocatieTeksten } from "@/lib/locatie/teksten";

// ---------------------------------------------------------------------------
// De portofoon: kies een kanaal, houd de knop ingedrukt en praat. De spraak
// gaat rechtstreeks tussen de telefoons (WebRTC, met onze TURN-server als
// tussenstation, net als bellen in de chat); wie-is-er en de verbindings-
// berichten lopen via /api/locatie/portofoon/<kanaal> (elke seconde).
// Is iemand niet verbonden, dan spreek je een bericht in: dat gaat als
// spraakbericht naar het groepsgesprek van het kanaal en speelt bij de ander
// vanzelf af zodra die het kanaal open heeft.
// Gedeeld door werker (/dashboard/portofoon, vijf talen via `t`) en werkgever.
// ---------------------------------------------------------------------------

export interface KanaalInfo {
  id: string;
  soort: "klus" | "vestiging";
  titel: string;
  ondertitel: string;
  tenantId: string;
}

interface Lid {
  userId: string;
  naam: string;
  rol: "werker" | "team";
}

interface Signaal {
  from: string;
  to: string;
  type: "offer" | "answer" | "candidate" | "leave";
  data: unknown;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  wachtrij: RTCIceCandidateInit[];
  remote: boolean;
  verbonden: boolean;
}

const STUN: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

async function iceServers(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch("/api/calls/turn", { cache: "no-store" });
    if (!r.ok) return STUN;
    const d = (await r.json()) as { turn: { urls: string[]; username: string; credential: string } | null };
    return d.turn ? [...STUN, { urls: d.turn.urls, username: d.turn.username, credential: d.turn.credential }] : STUN;
  } catch {
    return STUN;
  }
}

/** Korte piep bij begin en einde van praten, zoals een echte portofoon. */
function piep(ctx: AudioContext | null, hoog: boolean) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hoog ? 1320 : 880;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
  } catch {
    /* geen geluid is geen ramp */
  }
}

export function Portofoon({
  kanalen,
  ik,
  startKanaal = null,
  t = LOCATIE_TEKSTEN.nl.portofoon,
  terugHref,
  terugLabel = LOCATIE_TEKSTEN.nl.terug,
  chatHref,
}: {
  kanalen: KanaalInfo[];
  ik: { userId: string; naam: string };
  startKanaal?: string | null;
  t?: LocatieTeksten["portofoon"];
  terugHref?: string;
  terugLabel?: string;
  /** waar het groepsgesprek opent, bijv. /dashboard/berichten of /werkgever/berichten */
  chatHref: string;
}) {
  const [kanaal, setKanaal] = useState<KanaalInfo | null>(null);
  const [fase, setFase] = useState<"uit" | "verbinden" | "aan">("uit");
  const [leden, setLeden] = useState<Lid[]>([]);
  const [spreker, setSpreker] = useState<string | null>(null);
  const [praat, setPraat] = useState(false);
  const [gedempt, setGedempt] = useState(false);
  const [verbondenMet, setVerbondenMet] = useState(0);
  const [fout, setFout] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [opname, setOpname] = useState<null | { secs: number }>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const ice = useRef<RTCIceServer[]>(STUN);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const actx = useRef<AudioContext | null>(null);
  const kanaalRef = useRef<KanaalInfo | null>(null);
  const gedemptRef = useRef(false);
  const afgespeeld = useRef(new Set<string>());
  const joinTijd = useRef("");
  const recorder = useRef<MediaRecorder | null>(null);
  const brokken = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const bezig = useRef(false);
  const opnameSecs = useRef(0);

  const post = useCallback(async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/locatie/portofoon/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!r) return null;
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error((d.error as { message?: string } | undefined)?.message ?? "Dat lukte niet.");
    return d;
  }, []);

  const telVerbonden = () => setVerbondenMet([...peers.current.values()].filter((p) => p.verbonden).length);

  const sluitPeer = useCallback((userId: string) => {
    const p = peers.current.get(userId);
    if (!p) return;
    try {
      p.pc.close();
    } catch {
      /* al dicht */
    }
    p.audio.srcObject = null;
    p.audio.remove();
    peers.current.delete(userId);
    telVerbonden();
  }, []);

  const maakPeer = useCallback(
    (ander: string): Peer => {
      const k = kanaalRef.current;
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.muted = gedemptRef.current;
      audioHost.current?.appendChild(audio);
      const peer: Peer = { pc, audio, wachtrij: [], remote: false, verbonden: false };
      for (const track of stream.current?.getTracks() ?? []) pc.addTrack(track, stream.current!);
      pc.ontrack = (e) => {
        const s = e.streams[0];
        if (s) {
          audio.srcObject = s;
          void audio.play().catch(() => undefined);
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && k) void post(k.id, { type: "signal", to: ander, soort: "candidate", data: e.candidate.toJSON() }).catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        peer.verbonden = pc.connectionState === "connected";
        if (pc.connectionState === "failed" || pc.connectionState === "closed") sluitPeer(ander);
        telVerbonden();
      };
      peers.current.set(ander, peer);
      return peer;
    },
    [post, sluitPeer],
  );

  const bied = useCallback(
    async (ander: string) => {
      const k = kanaalRef.current;
      if (!k || peers.current.has(ander)) return;
      const peer = maakPeer(ander);
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      await post(k.id, { type: "signal", to: ander, soort: "offer", data: offer });
    },
    [maakPeer, post],
  );

  const verwerkSignaal = useCallback(
    async (s: Signaal) => {
      const k = kanaalRef.current;
      if (!k) return;
      if (s.type === "leave") return sluitPeer(s.from);
      if (s.type === "offer") {
        // twee aanbiedingen tegelijk: de laagste userId wint, de ander begint opnieuw
        if (peers.current.has(s.from) && biedtAan(ik.userId, s.from)) return;
        if (peers.current.has(s.from)) sluitPeer(s.from);
        const peer = maakPeer(s.from);
        await peer.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        peer.remote = true;
        for (const c of peer.wachtrij) await peer.pc.addIceCandidate(c).catch(() => undefined);
        peer.wachtrij = [];
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        await post(k.id, { type: "signal", to: s.from, soort: "answer", data: answer });
        return;
      }
      const peer = peers.current.get(s.from);
      if (!peer) return;
      if (s.type === "answer") {
        if (peer.pc.signalingState !== "have-local-offer") return;
        await peer.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        peer.remote = true;
        for (const c of peer.wachtrij) await peer.pc.addIceCandidate(c).catch(() => undefined);
        peer.wachtrij = [];
        return;
      }
      // candidate: pas na de beschrijving van de ander, anders in de wachtrij
      const c = s.data as RTCIceCandidateInit;
      if (peer.remote) await peer.pc.addIceCandidate(c).catch(() => undefined);
      else peer.wachtrij.push(c);
    },
    [ik.userId, maakPeer, post, sluitPeer],
  );

  const stopAlles = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    if (chatPoll.current) clearInterval(chatPoll.current);
    poll.current = null;
    chatPoll.current = null;
    for (const id of [...peers.current.keys()]) sluitPeer(id);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setLeden([]);
    setSpreker(null);
    setPraat(false);
    setVerbondenMet(0);
    setFase("uit");
  }, [sluitPeer]);

  const verlaat = useCallback(async () => {
    const k = kanaalRef.current;
    kanaalRef.current = null;
    setKanaal(null);
    stopAlles();
    if (k) await post(k.id, { type: "leave" }).catch(() => undefined);
  }, [post, stopAlles]);

  /** Nieuwe spraakberichten in het groepsgesprek afspelen (voor wie niet rechtstreeks verbonden was). */
  const speelBerichten = useCallback(async () => {
    if (!threadId || bezig.current) return;
    const r = await fetch(`/api/inbox/${threadId}?visible=1`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { messages: { id: string; from: string; kind: string; at: string; attachment?: { mediaId: string } }[] };
    for (const m of d.messages) {
      if (m.kind !== "voice" || m.from === ik.userId || !m.attachment || m.at < joinTijd.current || afgespeeld.current.has(m.id)) continue;
      afgespeeld.current.add(m.id);
      if (gedemptRef.current) continue;
      bezig.current = true;
      piep(actx.current, true);
      const a = new Audio(`/api/inbox/${threadId}/media/${m.attachment.mediaId}`);
      await new Promise<void>((klaar) => {
        a.onended = () => klaar();
        a.onerror = () => klaar();
        a.play().catch(() => klaar());
      });
      bezig.current = false;
    }
  }, [ik.userId, threadId]);

  const ga = useCallback(
    async (k: KanaalInfo) => {
      setFout(null);
      setFase("verbinden");
      setKanaal(k);
      kanaalRef.current = k;
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setFout(t.microfoon);
        setFase("uit");
        setKanaal(null);
        kanaalRef.current = null;
        return;
      }
      stream.current.getAudioTracks().forEach((tr) => (tr.enabled = false));
      try {
        actx.current ??= new AudioContext();
        void actx.current.resume();
      } catch {
        actx.current = null;
      }
      ice.current = await iceServers();
      try {
        const d = (await post(k.id, { type: "join", apparaat: /Mobi|Android/i.test(navigator.userAgent) ? "telefoon" : "computer" })) as {
          leden: Lid[];
          threadId: string;
          spreker: string | null;
        } | null;
        if (!d) throw new Error("Geen verbinding.");
        setLeden(d.leden);
        setSpreker(d.spreker);
        setThreadId(d.threadId);
        joinTijd.current = new Date().toISOString();
        setFase("aan");
        for (const l of d.leden) if (l.userId !== ik.userId && biedtAan(ik.userId, l.userId)) void bied(l.userId).catch(() => undefined);
      } catch (e) {
        setFout(e instanceof Error ? e.message : "Dat lukte niet.");
        stopAlles();
        setKanaal(null);
        kanaalRef.current = null;
        return;
      }
      poll.current = setInterval(async () => {
        const kk = kanaalRef.current;
        if (!kk) return;
        try {
          const d = (await post(kk.id, { type: "poll" })) as { leden: Lid[]; signalen: Signaal[]; spreker: string | null } | null;
          if (!d) return;
          setLeden(d.leden);
          setSpreker(d.spreker);
          for (const s of d.signalen) await verwerkSignaal(s).catch(() => undefined);
          const aanwezig = new Set(d.leden.map((l) => l.userId));
          for (const id of [...peers.current.keys()]) if (!aanwezig.has(id)) sluitPeer(id);
          for (const l of d.leden) if (l.userId !== ik.userId && !peers.current.has(l.userId) && biedtAan(ik.userId, l.userId)) void bied(l.userId).catch(() => undefined);
        } catch {
          /* volgende seconde opnieuw */
        }
      }, 1000);
    },
    [bied, ik.userId, post, sluitPeer, stopAlles, t.microfoon, verwerkSignaal],
  );

  // het groepsgesprek elke 4 s nakijken op spraakberichten
  useEffect(() => {
    if (fase !== "aan" || !threadId) return;
    chatPoll.current = setInterval(() => void speelBerichten(), 4000);
    return () => {
      if (chatPoll.current) clearInterval(chatPoll.current);
    };
  }, [fase, threadId, speelBerichten]);

  // kanaal uit de link (?kanaal=klus:…) meteen openen
  useEffect(() => {
    if (!startKanaal || kanaalRef.current) return;
    const k = kanalen.find((x) => x.id === startKanaal);
    if (k) void ga(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKanaal]);

  // weg van de pagina: netjes afmelden
  useEffect(() => {
    const weg = () => {
      const k = kanaalRef.current;
      if (k) navigator.sendBeacon?.(`/api/locatie/portofoon/${encodeURIComponent(k.id)}`, new Blob([JSON.stringify({ type: "leave" })], { type: "application/json" }));
      stopAlles();
    };
    window.addEventListener("pagehide", weg);
    return () => {
      window.removeEventListener("pagehide", weg);
      weg();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zetPraat = useCallback(
    (aan: boolean) => {
      const k = kanaalRef.current;
      if (!k || fase !== "aan" || opname) return;
      stream.current?.getAudioTracks().forEach((tr) => (tr.enabled = aan));
      setPraat(aan);
      piep(actx.current, aan);
      navigator.vibrate?.(aan ? 15 : 8);
      void post(k.id, { type: "spreek", praat: aan }).catch(() => undefined);
    },
    [fase, opname, post],
  );

  // spatiebalk = praten (computer)
  useEffect(() => {
    if (fase !== "aan") return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        zetPraat(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        zetPraat(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fase, zetPraat]);

  const toggleDemp = () => {
    const v = !gedempt;
    gedemptRef.current = v;
    setGedempt(v);
    for (const p of peers.current.values()) p.audio.muted = v;
  };

  /* ─── spraakbericht voor wie niet verbonden is ─── */
  const startOpname = () => {
    if (!stream.current || opname) return;
    const bron = new MediaStream(stream.current.getAudioTracks());
    stream.current.getAudioTracks().forEach((tr) => (tr.enabled = true));
    const rec = new MediaRecorder(bron);
    brokken.current = [];
    rec.ondataavailable = (e) => e.data.size && brokken.current.push(e.data);
    rec.onstop = async () => {
      stream.current?.getAudioTracks().forEach((tr) => (tr.enabled = false));
      if (recTimer.current) clearInterval(recTimer.current);
      const secs = opnameSecs.current;
      setOpname(null);
      const blob = new Blob(brokken.current, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 800 || !threadId) return;
      const fd = new FormData();
      fd.append("file", blob, `portofoon-${Date.now()}.webm`);
      fd.append("durationSec", String(Math.max(1, secs)));
      const up = await fetch(`/api/inbox/${threadId}/media`, { method: "POST", body: fd }).catch(() => null);
      const att = up?.ok ? ((await up.json()) as { attachment: unknown }).attachment : null;
      if (!att) return setMelding("Versturen mislukt.");
      await fetch(`/api/inbox/${threadId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "", kind: "voice", attachment: att }) }).catch(() => null);
      setMelding("✓");
      setTimeout(() => setMelding(null), 1500);
    };
    recorder.current = rec;
    rec.start();
    opnameSecs.current = 0;
    setOpname({ secs: 0 });
    recTimer.current = setInterval(() => {
      opnameSecs.current += 1;
      setOpname({ secs: opnameSecs.current });
    }, 1000);
  };
  const stopOpname = () => recorder.current?.stop();

  const anderen = leden.filter((l) => l.userId !== ik.userId);
  const sprekerNaam = spreker && spreker !== ik.userId ? (leden.find((l) => l.userId === spreker)?.naam ?? null) : null;

  /* ─── scherm ─── */
  if (!kanaal) {
    return (
      <div>
        {terugHref && (
          <Link href={terugHref} className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
            {terugLabel}
          </Link>
        )}
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">📻 {t.titel}</h1>
        <p className="mt-1 text-sm text-neutralx-500">{t.uitleg}</p>
        {fout && (
          <p role="alert" className="mt-4 rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">
            {fout}
          </p>
        )}
        {kanalen.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-hair bg-white px-4 py-8 text-center text-sm text-neutralx-500">{t.geenKanalen}</p>
        ) : (
          <>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-neutralx-400">{t.kies}</p>
            <ul className="mt-2 space-y-2">
              {kanalen.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => void ga(k)}
                    disabled={fase === "verbinden"}
                    className="flex w-full items-center gap-3 rounded-2xl border border-hair bg-white px-4 py-3.5 text-left shadow-card hover:border-brand-500 disabled:opacity-60"
                  >
                    <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-lg ${k.soort === "klus" ? "bg-brand-50" : "bg-paper-soft"}`} aria-hidden>
                      {k.soort === "klus" ? "🧰" : "📍"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{k.titel}</span>
                      <span className="block truncate text-xs text-neutralx-500">{k.ondertitel}</span>
                    </span>
                    <span className="text-neutralx-400" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="select-none">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void verlaat()} className="rounded-lg px-2 py-1 text-sm font-medium text-neutralx-500 hover:bg-paper-soft hover:text-ink">
          ‹ {t.verlaat}
        </button>
      </div>
      <div className="mt-3 rounded-2xl border border-hair bg-white p-4 shadow-card">
        <p className="truncate font-display text-lg font-bold text-ink">📻 {kanaal.titel}</p>
        <p className="truncate text-xs text-neutralx-500">{kanaal.ondertitel}</p>
        <p className="mt-2 text-xs text-neutralx-500">
          {fase === "verbinden" ? t.verbinden : anderen.length === 0 ? t.niemand : `${t.aanwezig(anderen.length)} · ${t.verbonden(verbondenMet)}`}
        </p>
        {anderen.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Aanwezig">
            {anderen.map((l) => {
              const aanHetWoord = spreker === l.userId;
              const live = peers.current.get(l.userId)?.verbonden;
              return (
                <li key={l.userId} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${aanHetWoord ? "bg-ok/15 text-ok ring-2 ring-ok/40" : "bg-paper-soft text-neutralx-600"}`}>
                  <span className={`h-2 w-2 rounded-full ${live ? "bg-ok" : "bg-neutralx-300"}`} aria-hidden />
                  {l.naam}
                  {l.rol === "team" && <span className="text-[10px] text-neutralx-400">· team</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center">
        <p className={`h-6 text-sm font-semibold ${praat ? "text-ok" : sprekerNaam ? "text-brand-700" : "text-neutralx-400"}`} aria-live="polite">
          {praat ? t.praat : sprekerNaam ? t.spreekt(sprekerNaam) : t.stil}
        </p>
        <button
          type="button"
          disabled={fase !== "aan" || Boolean(opname)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            zetPraat(true);
          }}
          onPointerUp={() => zetPraat(false)}
          onPointerCancel={() => zetPraat(false)}
          onPointerLeave={() => praat && zetPraat(false)}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={praat}
          aria-label={t.houdIngedrukt}
          className={`mt-3 grid h-44 w-44 place-items-center rounded-full border-8 text-white shadow-lift transition-transform [touch-action:none] active:scale-95 disabled:opacity-50 ${
            praat ? "scale-105 border-ok/40 bg-ok" : sprekerNaam ? "border-brand-200 bg-brand-500" : "border-brand-100 bg-brand-600"
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-semibold">{praat ? t.praat : t.houdIngedrukt}</span>
          </span>
        </button>
        <p className="mt-3 text-[11px] text-neutralx-400">{t.luisteren}: {gedempt ? t.gedempt : t.geluidAan}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={toggleDemp} className="rounded-xl border border-hair bg-white px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-soft">
          {gedempt ? `🔈 ${t.geluidAan}` : `🔇 ${t.gedempt}`}
        </button>
        {opname ? (
          <button type="button" onClick={stopOpname} className="rounded-xl bg-crit px-3 py-2.5 text-sm font-semibold text-white">
            ⏹ {t.stop} · {opname.secs}s
          </button>
        ) : (
          <button type="button" onClick={startOpname} disabled={fase !== "aan" || !threadId} className="rounded-xl border border-hair bg-white px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-soft disabled:opacity-50" title={t.berichtUitleg}>
            🎤 {t.bericht}
          </button>
        )}
        {threadId && (
          <Link href={`${chatHref}?thread=${threadId}`} className="rounded-xl border border-hair bg-white px-3 py-2.5 text-center text-sm font-medium text-ink hover:bg-paper-soft">
            💬 {t.openChat}
          </Link>
        )}
        <button type="button" onClick={() => void verlaat()} className="rounded-xl border border-crit/30 bg-white px-3 py-2.5 text-sm font-medium text-crit hover:bg-crit/5">
          ✕ {t.verlaat}
        </button>
      </div>
      {melding && <p className="mt-2 text-center text-xs text-neutralx-500">{melding}</p>}
      <p className="mt-4 text-center text-xs text-neutralx-400">{t.berichtUitleg}</p>
      <div ref={audioHost} className="hidden" aria-hidden />
    </div>
  );
}
