"use client";

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "thinking" | "speaking" | "listening" | "error";

const PALETTE: Record<OrbState, { core: string; ring: string; glow: string }> = {
  idle: { core: "#4FE0A0", ring: "#2E9C79", glow: "rgba(79,224,160,0.35)" },
  thinking: { core: "#7CC5FF", ring: "#3E86C9", glow: "rgba(124,197,255,0.4)" },
  speaking: { core: "#4FE0A0", ring: "#63E6C4", glow: "rgba(79,224,160,0.55)" },
  listening: { core: "#FFC46B", ring: "#E0902F", glow: "rgba(255,196,107,0.45)" },
  error: { core: "#F07C6B", ring: "#C1443A", glow: "rgba(240,124,107,0.4)" },
};

/**
 * A holographic assistant orb: concentric perspective rings, an orbiting dot
 * field and a pulsing core. State drives colour + energy; `level` (0..1) adds
 * a live pulse (voice amplitude, or a synthetic breathing curve).
 */
export function HoloOrb({
  state = "idle",
  level = 0,
  size = 320,
}: {
  state?: OrbState;
  level?: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  stateRef.current = state;
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.34;
    const DOTS = 46;
    let raf = 0;
    let t = 0;

    // smoothed values so state changes ease in
    let energy = 0;

    const draw = () => {
      t += reduce ? 0.004 : 0.016;
      const pal = PALETTE[stateRef.current];
      const activeBoost =
        stateRef.current === "thinking" || stateRef.current === "speaking" ? 0.5 : 0.15;
      const target = Math.min(1, activeBoost + levelRef.current * 0.8);
      energy += (target - energy) * 0.08;

      const breathe = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.6);
      const pulse = 1 + energy * 0.16 + breathe * 0.04;

      ctx.clearRect(0, 0, size, size);

      // outer glow
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.1);
      g.addColorStop(0, pal.glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // perspective rings
      for (let i = 0; i < 3; i++) {
        const phase = t * (0.6 + i * 0.22) + i * 2.1;
        const ry = R * (0.35 + 0.28 * Math.abs(Math.sin(phase)));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(phase * 0.3 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * pulse, ry * pulse, 0, 0, Math.PI * 2);
        ctx.strokeStyle = pal.ring;
        ctx.globalAlpha = 0.25 + 0.15 * i;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // orbiting dot field
      for (let i = 0; i < DOTS; i++) {
        const a = (i / DOTS) * Math.PI * 2 + t * 0.5;
        const wobble = Math.sin(a * 3 + t * 2) * 0.06;
        const rr = R * (0.92 + wobble) * pulse;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.5;
        const s = 1 + 1.6 * (0.5 + 0.5 * Math.sin(a * 2 + t * 3));
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fillStyle = pal.core;
        ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(a + t));
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // core
      const coreR = R * 0.42 * pulse;
      const cg = ctx.createRadialGradient(cx, cy - coreR * 0.2, 2, cx, cy, coreR);
      cg.addColorStop(0, "#ffffff");
      cg.addColorStop(0.35, pal.core);
      cg.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.fill();

      // scan line
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R * pulse, 0, Math.PI * 2);
      ctx.clip();
      const sy = cy - R + ((t * 60) % (R * 2));
      ctx.strokeStyle = pal.core;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(cx - R, sy);
      ctx.lineTo(cx + R, sy);
      ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="select-none"
      aria-hidden
    />
  );
}
