"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fireConfetti } from "@/components/ui/confetti";
import { themeInfo, type ThemeId } from "@/lib/seasons/calendar";

// ---------------------------------------------------------------------------
// The festive layer for a Dutch holiday or a birthday (lib/seasons). Only
// decoration: aria-hidden, no pointer events (only the small greeting has a
// button to hide it all for today), fixed so nothing on the page shifts, still
// with prefers-reduced-motion, gone when printing. Corner pieces only on wider
// screens, so they never sit on a phone's bottom bar.
// ---------------------------------------------------------------------------

const CSS = `
.zfs{position:fixed;inset:0;pointer-events:none;z-index:55;overflow:hidden}
.zfs-corner{display:none;position:absolute;bottom:0}
@media (min-width:768px){.zfs-corner{display:flex;align-items:flex-end;gap:2px}}
.zfs-pill{position:fixed;z-index:56;bottom:calc(16px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:.5rem;max-width:calc(100vw - 32px);padding:.4rem .4rem .4rem .8rem;border-radius:999px;background:rgba(255,255,255,.95);color:#16191d;border:1px solid rgba(0,0,0,.07);box-shadow:0 8px 28px rgba(0,0,0,.14);font-size:13px;font-weight:600;line-height:1.2;pointer-events:auto}
@media (max-width:767px){.zfs-pill{bottom:calc(84px + env(safe-area-inset-bottom))}}
.zfs-pill.l{left:16px}.zfs-pill.r{right:16px}
.zfs-pill.dk{background:rgba(22,25,29,.95);color:#f3f4f6;border-color:rgba(255,255,255,.1)}
.zfs-pill button{border:0;border-radius:999px;padding:.32rem .65rem;background:rgba(0,0,0,.07);color:inherit;font:inherit;font-size:12px;cursor:pointer}
.zfs-pill.dk button{background:rgba(255,255,255,.12)}
.zfs-pill button:focus-visible,.zfs-badge:focus-visible{outline:2px solid #4FE0A0;outline-offset:2px}
.zfs-pill.zfs-badge{width:38px;height:38px;padding:0;justify-content:center;font-size:18px;cursor:pointer}
.zfs-num{font-variant-numeric:tabular-nums}
.zfs-wide{display:none}
@media (min-width:768px){.zfs-wide{display:inline}}
.zfs-go .zfs-fall{animation:zfs-fall linear infinite}
.zfs-go .zfs-rise{animation:zfs-rise ease-in infinite}
.zfs-go .zfs-fly{animation:zfs-fly linear infinite}
.zfs-go .zfs-wobble{animation:zfs-wobble 3.2s ease-in-out infinite;transform-origin:50% 100%}
.zfs-go .zfs-up{animation:zfs-up ease-out forwards}
.zfs-go .zfs-twinkle{animation:zfs-twinkle 2.4s ease-in-out infinite}
@keyframes zfs-fall{from{transform:translate3d(0,-16px,0)}to{transform:translate3d(var(--dx,0px),105vh,0)}}
@keyframes zfs-rise{0%{transform:translate3d(0,0,0);opacity:0}12%{opacity:.9}100%{transform:translate3d(var(--dx,0px),-105vh,0);opacity:0}}
@keyframes zfs-fly{from{transform:translateX(-14vw)}to{transform:translateX(114vw)}}
@keyframes zfs-wobble{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes zfs-up{from{transform:translate3d(0,0,0)}to{transform:translate3d(var(--dx,0px),-130vh,0)}}
@keyframes zfs-twinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
@media print{.zfs,.zfs-pill{display:none!important}}
`;

const dayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const rnd = (min: number, max: number) => min + Math.random() * (max - min);

/** A few seconds of fireworks on a canvas that removes itself. */
function fireworks(ms = 7000): void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:57";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#F5C451", "#4FE0A0", "#60A5FA", "#F472B6", "#FB923C", "#A78BFA"];
  const parts: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  const start = performance.now();
  let last = start;
  let next = start;
  const frame = (now: number) => {
    const dt = Math.min(32, now - last) / 16;
    last = now;
    if (now - start < ms - 1500 && now >= next) {
      const x = window.innerWidth * rnd(0.15, 0.85);
      const y = window.innerHeight * rnd(0.12, 0.45);
      const color = colors[Math.floor(Math.random() * colors.length)] ?? "#F5C451";
      for (let i = 0; i < 64; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rnd(1.5, 4.5);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
      }
      next = now + rnd(450, 1000);
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.045 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.013 * dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (now - start < ms || parts.length) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Small flags along the very top edge, short enough to stay clear of the menu text. */
function Bunting({ id, colors }: { id: string; colors: string[] }) {
  const w = 24;
  return (
    <svg width="100%" height="18" style={{ position: "absolute", top: 0, left: 0 }}>
      <defs>
        <pattern id={id} width={w * colors.length} height="18" patternUnits="userSpaceOnUse">
          {colors.map((c, i) => (
            <path key={c + i} d={`M${i * w + 2} 2 L${i * w + w / 2} 16 L${i * w + w - 2} 2 Z`} fill={c} stroke="rgba(0,0,0,.12)" strokeWidth="0.6" />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="18" fill={`url(#${id})`} />
      <line x1="0" y1="2" x2="100%" y2="2" stroke="#8a6a46" strokeWidth="1.5" />
    </svg>
  );
}

const Egg = ({ fill, band, size }: { fill: string; band: string; size: number }) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 40 52" className="zfs-wobble">
    <path d="M20 1C9 1 2 22 2 33c0 10 8 18 18 18s18-8 18-18C38 22 31 1 20 1z" fill={fill} />
    <path d="M3.5 27l5.5-4 5.5 4 5.5-4 5.5 4 5.5-4 5.5 4" fill="none" stroke={band} strokeWidth="3" strokeLinejoin="round" />
    <circle cx="12" cy="38" r="2.4" fill={band} />
    <circle cx="27" cy="40" r="2.4" fill={band} />
  </svg>
);

const Pumpkin = ({ size }: { size: number }) => (
  <svg width={size} height={size * 0.875} viewBox="0 0 64 56" className="zfs-wobble">
    <path d="M30 12c0-5 3-8 7-10" stroke="#3f6212" strokeWidth="4" fill="none" strokeLinecap="round" />
    <ellipse cx="20" cy="34" rx="16" ry="20" fill="#ea580c" />
    <ellipse cx="44" cy="34" rx="16" ry="20" fill="#ea580c" />
    <ellipse cx="32" cy="34" rx="16" ry="21" fill="#f97316" />
    <path d="M22 28l5 6H17zM42 28l5 6H37z" fill="#1c1917" />
    <path d="M20 42l4 4 4-4 4 4 4-4 4 4 4-4" stroke="#1c1917" strokeWidth="3" fill="none" strokeLinejoin="round" />
  </svg>
);

const Bat = () => (
  <svg width="30" height="14" viewBox="0 0 30 14">
    <path d="M15 4c1.2-2 2.8-2 4 0 2-3 6-4 11-2-3 1-4 4-4 7-2-2-4-2-6 0-1-2-2.8-3-5-3s-4 1-5 3c-2-2-4-2-6 0 0-3-1-6-4-7 5-2 9-1 11 2 1.2-2 2.8-2 4 0z" fill="#27272a" />
  </svg>
);

const Heart = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size * 0.92} viewBox="0 0 24 22">
    <path d="M12 21s-9-5.7-11.2-11C-.4 6.5 2 2 6.4 2 9 2 11 3.6 12 5.5 13 3.6 15 2 17.6 2 22 2 24.4 6.5 23.2 10 21 15.3 12 21 12 21z" fill={color} />
  </svg>
);

const Balloon = ({ color }: { color: string }) => (
  <svg width="34" height="72" viewBox="0 0 34 72">
    <ellipse cx="17" cy="19" rx="15" ry="18" fill={color} />
    <ellipse cx="11" cy="12" rx="3" ry="5" fill="#fff" opacity=".35" />
    <path d="M17 37l-3 4h6z" fill={color} />
    <path d="M17 41c-4 8 4 14 0 30" stroke="#9ca3af" strokeWidth="1.2" fill="none" />
  </svg>
);

/** Falling or rising little things, spread over the width; with reduced motion they just sit still. */
function Particles({ count, kind, still }: { count: number; kind: "sneeuw" | "pepernoot" | "hart"; still: boolean }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        left: rnd(0, 100),
        top: rnd(5, 90),
        size: kind === "hart" ? rnd(12, 22) : kind === "pepernoot" ? rnd(7, 11) : rnd(4, 8),
        dur: rnd(9, 17),
        delay: -rnd(0, 17),
        dx: rnd(-40, 40),
        color: kind === "hart" ? ["#fb7185", "#f43f5e", "#fda4af"][i % 3]! : "",
      })),
    [count, kind],
  );
  return (
    <>
      {items.map((p) => {
        const style: CSSProperties & Record<"--dx", string> = {
          position: "absolute",
          left: `${p.left}%`,
          ...(still ? { top: `${p.top}%` } : kind === "hart" ? { bottom: -24 } : { top: -16 }),
          animationDuration: `${p.dur}s`,
          animationDelay: `${p.delay}s`,
          "--dx": `${p.dx}px`,
        };
        if (kind === "hart") return <div key={p.key} className="zfs-rise" style={style}><Heart size={p.size} color={p.color} /></div>;
        const dot: CSSProperties =
          kind === "sneeuw"
            ? { width: p.size, height: p.size, borderRadius: "50%", background: "#bfdbfe", boxShadow: "0 0 3px rgba(59,130,246,.35)", opacity: 0.9 }
            : { width: p.size, height: p.size * 0.85, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #c08457, #7c4a21)" };
        return <div key={p.key} className="zfs-fall" style={style}><div style={dot} /></div>;
      })}
    </>
  );
}

function useCountdown(target: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return target ? new Date(target).getTime() - now : null;
}

const two = (n: number) => String(n).padStart(2, "0");

export function SeasonalDecor({ theme, countdownTo, naam }: { theme: ThemeId; countdownTo: string | null; naam: string | null }) {
  const storageKey = `zf-feest-verborgen:${theme}:${dayStamp()}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [still] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  const [dark] = useState(() => Boolean(document.querySelector('[data-theme="dark"]')));
  // previewing 31 December on another day: count down to the next 1 January
  const [target] = useState(() => (theme === "oudjaar" ? (countdownTo ?? new Date(new Date().getFullYear() + 1, 0, 1).toISOString()) : null));
  const left = useCountdown(target);
  const midnight = left !== null && left <= 0;
  const info = themeInfo(theme);
  const counting = theme === "oudjaar" && !midnight;
  // The greeting folds into a small round badge after a few seconds, so it never
  // sits on a button for long; the countdown on 31 December stays open.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open || counting) return;
    const timer = window.setTimeout(() => setOpen(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [open, counting]);

  // one burst per visitor per day (not on every reload), or at midnight on 31 December
  useEffect(() => {
    if (hidden || still) return;
    const once = `zf-feest-knal:${theme}:${dayStamp()}`;
    try {
      if (window.localStorage.getItem(once) === "1") return;
      window.localStorage.setItem(once, "1");
    } catch {
      /* geen opslag: dan gewoon één keer nu */
    }
    if (theme === "carnaval") fireConfetti(80, ["#DC2626", "#FACC15", "#16A34A"]);
    if (theme === "verjaardag") fireConfetti(110);
    if (theme === "nieuwjaar") fireworks();
  }, [theme, hidden, still]);
  useEffect(() => {
    if (midnight && !hidden && !still) fireworks(12000);
  }, [midnight, hidden, still]);

  if (hidden) return null;
  const hide = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* geen opslag: alleen voor nu verbergen */
    }
    setHidden(true);
  };

  const year = new Date().getFullYear();
  let text: string = info.groet;
  if (theme === "verjaardag") text = `Gefeliciteerd${naam ? `, ${naam}` : ""}!`;
  if (theme === "nieuwjaar") text = `Gelukkig nieuwjaar ${year}!`;
  if (theme === "oudjaar" && target) {
    const next = new Date(target).getFullYear();
    if (midnight) text = `Gelukkig nieuwjaar ${next}!`;
    else if (left !== null) {
      const s = Math.max(0, Math.floor(left / 1000));
      const days = Math.floor(s / 86_400);
      const clock = `${two(Math.floor((s % 86_400) / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
      text = `Nog ${days > 0 ? `${days} ${days === 1 ? "dag" : "dagen"} en ` : ""}${clock} tot ${next}`;
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className={`zfs${still ? "" : " zfs-go"}`} aria-hidden="true">
        {theme === "koningsdag" && <Bunting id="zfs-vlag-koningsdag" colors={["#F97316", "#AE1C28", "#F8FAFC", "#21468B"]} />}
        {theme === "carnaval" && <Bunting id="zfs-vlag-carnaval" colors={["#DC2626", "#FACC15", "#16A34A"]} />}
        {theme === "pasen" && (
          <>
            <div className="zfs-corner" style={{ left: 18 }}>
              <Egg fill="#f9c6d3" band="#ec4899" size={34} />
              <Egg fill="#fde68a" band="#f59e0b" size={44} />
              <Egg fill="#a7f3d0" band="#10b981" size={30} />
            </div>
            <div className="zfs-corner" style={{ right: 18 }}>
              <Egg fill="#c7d2fe" band="#6366f1" size={38} />
              <Egg fill="#fbcfe8" band="#db2777" size={30} />
            </div>
          </>
        )}
        {theme === "halloween" && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="zfs-fly" style={{ position: "absolute", top: 18 + i * 34, left: 0, animationDuration: `${20 + i * 6}s`, animationDelay: `${-i * 7}s`, opacity: 0.75 }}>
                <Bat />
              </div>
            ))}
            <div className="zfs-corner" style={{ left: 18 }}>
              <Pumpkin size={58} />
            </div>
            <div className="zfs-corner" style={{ right: 18 }}>
              <Pumpkin size={46} />
              <Pumpkin size={62} />
            </div>
          </>
        )}
        {theme === "kerst" && <Particles count={30} kind="sneeuw" still={still} />}
        {theme === "sinterklaas" && <Particles count={14} kind="pepernoot" still={still} />}
        {theme === "valentijn" && <Particles count={10} kind="hart" still={still} />}
        {(theme === "nieuwjaar" || theme === "oudjaar") &&
          [6, 14, 82, 91].map((x, i) => (
            <span key={x} className="zfs-twinkle zfs-wide" style={{ position: "absolute", top: 14 + (i % 2) * 22, left: `${x}%`, color: "#F5C451", fontSize: 18 + (i % 2) * 6, animationDelay: `${i * 0.6}s` }}>
              ✦
            </span>
          ))}
        {theme === "verjaardag" && (
          <div className="zfs-corner" style={{ right: 22 }}>
            {["#f472b6", "#60a5fa", "#fbbf24", "#34d399"].map((c, i) => (
              <div key={c} className="zfs-up" style={{ animationDuration: `${9 + i * 1.6}s`, animationDelay: `${i * 0.5}s`, ["--dx" as string]: `${(i - 1.5) * 30}px` } as CSSProperties}>
                <Balloon color={c} />
              </div>
            ))}
          </div>
        )}
      </div>
      {open ? (
        <div className={`zfs-pill ${theme === "verjaardag" ? "r" : "l"}${dark ? " dk" : ""}`}>
          <span aria-hidden="true">{midnight ? "🎆" : info.emoji}</span>
          <span className={counting ? "zfs-num" : undefined}>{text}</span>
          <button type="button" onClick={hide} aria-label="Feestversiering vandaag verbergen">
            Verbergen
          </button>
        </div>
      ) : (
        <button type="button" className={`zfs-pill zfs-badge ${theme === "verjaardag" ? "r" : "l"}${dark ? " dk" : ""}`} onClick={() => setOpen(true)} aria-label={`${text} Groet tonen`}>
          <span aria-hidden="true">{info.emoji}</span>
        </button>
      )}
    </>
  );
}
