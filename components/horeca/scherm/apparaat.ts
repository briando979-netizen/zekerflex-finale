"use client";

// ---------------------------------------------------------------------------
// Wat een scherm van het apparaat zelf gebruikt: een geluidje bij een nieuwe
// bon (zonder geluidsbestand, via Web Audio), trillen op de handheld, het
// scherm aan houden (Wake Lock) en volledig scherm. Alles stil als de browser
// het niet kan; niets hiervan is nodig om het scherm te gebruiken.
// ---------------------------------------------------------------------------

type MetAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
let ctx: AudioContext | null = null;

/** Na een tik op het scherm mag geluid (regel van de browser): dan maken we de context. */
export function geluidKlaarzetten(): boolean {
  try {
    const Ctx = window.AudioContext ?? (window as MetAudio).webkitAudioContext;
    if (!Ctx) return false;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

/** Twee korte tonen: "er is iets nieuws". */
export function ding(hoog = false) {
  if (!ctx || ctx.state !== "running") return;
  const nu = ctx.currentTime;
  [0, 0.18].forEach((na, i) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = (hoog ? 1046 : 880) * (i ? 1.5 : 1);
    gain.gain.setValueAtTime(0.0001, nu + na);
    gain.gain.exponentialRampToValueAtTime(0.35, nu + na + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, nu + na + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(nu + na);
    osc.stop(nu + na + 0.32);
  });
}

export function tril(patroon: number | number[] = 120) {
  try {
    navigator.vibrate?.(patroon);
  } catch {
    // niet elke browser kan trillen
  }
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
type MetWakeLock = Navigator & { wakeLock?: { request: (soort: "screen") => Promise<WakeLockSentinelLike> } };

/** Houdt het scherm aan zolang het zichtbaar is; geeft een functie om los te laten. */
export function houdSchermAan(): () => void {
  let slot: WakeLockSentinelLike | null = null;
  let weg = false;
  const vraag = async () => {
    try {
      const wl = (navigator as MetWakeLock).wakeLock;
      if (wl && !document.hidden) slot = await wl.request("screen");
    } catch {
      // geen toestemming of niet ondersteund: het scherm gaat dan gewoon uit volgens de instellingen
    }
  };
  const opnieuw = () => {
    if (!weg && !document.hidden) void vraag();
  };
  void vraag();
  document.addEventListener("visibilitychange", opnieuw);
  return () => {
    weg = true;
    document.removeEventListener("visibilitychange", opnieuw);
    void slot?.release().catch(() => undefined);
  };
}

export function wisselVolledigScherm() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  } catch {
    // iPhone kent geen volledig scherm voor webpagina's; zet hem dan op het beginscherm
  }
}

const SLEUTEL_GELUID = "zf-scherm-geluid";
export const geluidVoorkeur = () => {
  try {
    return localStorage.getItem(SLEUTEL_GELUID) !== "uit";
  } catch {
    return true;
  }
};
export const bewaarGeluid = (aan: boolean) => {
  try {
    localStorage.setItem(SLEUTEL_GELUID, aan ? "aan" : "uit");
  } catch {
    // privévenster: alleen voor nu
  }
};
