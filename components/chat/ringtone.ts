"use client";

// Synthesizes ring tones purely with the Web Audio API — no audio asset to
// host, license, or ship in the bundle, and nothing to fetch over the network.

export interface Ringer {
  start: () => void;
  stop: () => void;
}

function makeRinger(freqs: number[], onMs: number, offMs: number): Ringer {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  const cycle = () => {
    if (!active || !ctx) return;
    // The context is created inside a React effect, not synchronously inside
    // the click handler that started the call — browsers treat that as
    // outside the user-gesture window and start it "suspended" (silent).
    // Resuming is safe to call repeatedly; it's a no-op once already running.
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    const now = ctx.currentTime;
    const onSec = onMs / 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.setValueAtTime(0.22, now + Math.max(0.02, onSec - 0.03));
    gain.gain.linearRampToValueAtTime(0, now + onSec);
    gain.connect(ctx.destination);
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + onSec);
    }
    timer = setTimeout(cycle, onMs + offMs);
  };

  return {
    start() {
      if (active) return;
      active = true;
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        cycle();
      } catch {
        active = false;
      }
    },
    stop() {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (ctx) {
        const c = ctx;
        ctx = null;
        void c.close().catch(() => undefined);
      }
    },
  };
}

/** Caller hears this while the other side's phone is ringing (classic EU ring-back cadence, shortened). */
export function makeRingback(): Ringer {
  return makeRinger([425], 1000, 3000);
}

/** Callee hears this while deciding to accept/decline an incoming call. */
export function makeRingtone(): Ringer {
  return makeRinger([440, 480], 1200, 800);
}
