// Lichtgewicht confetti-explosie zonder dependencies, via de Web Animations API.
// Respecteert prefers-reduced-motion en ruimt zichzelf op. Puur decoratief.
export function fireConfetti(count = 90): void {
  if (typeof document === "undefined") return;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    /* geen matchMedia — dan gewoon tonen */
  }
  const colors = ["#4FE0A0", "#0E5C4A", "#F5C451", "#2563EB", "#B91C1C", "#7C3AED"];
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(root);

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 8;
    const dur = 1800 + Math.random() * 1400;
    const delay = Math.random() * 250;
    const rot = Math.random() * 360;
    const drift = (Math.random() - 0.5) * 260;
    p.style.cssText = `position:absolute;top:-24px;left:${Math.random() * 100}vw;width:${size}px;height:${size * 0.6}px;background:${colors[i % colors.length]};border-radius:1px;will-change:transform`;
    p.animate(
      [
        { transform: `translate(0,0) rotate(${rot}deg)`, opacity: 1 },
        { transform: `translate(${drift}px, 105vh) rotate(${rot + 540}deg)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${drift}px, 108vh) rotate(${rot + 560}deg)`, opacity: 0 },
      ],
      { duration: dur, delay, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" },
    );
    root.appendChild(p);
  }
  window.setTimeout(() => root.remove(), 4000);
}
