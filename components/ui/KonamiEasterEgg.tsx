"use client";

import { useEffect } from "react";
import { fireConfetti } from "@/components/ui/confetti";

// Verborgen easter-egg: de Konami-code (↑ ↑ ↓ ↓ ← → ← → B A) geeft confetti +
// een knipoog. Puur voor de fun; geen effect op functionaliteit.
const SEQ = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

export function KonamiEasterEgg() {
  useEffect(() => {
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      pos = k === SEQ[pos] ? pos + 1 : k === SEQ[0] ? 1 : 0;
      if (pos === SEQ.length) {
        pos = 0;
        fireConfetti(150);
        wink();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function wink() {
  try {
    const el = document.createElement("div");
    el.textContent = "🎉 Je vond de ZekerFlex easter-egg!";
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:10000;background:#0E5C4A;color:#fff;padding:10px 18px;border-radius:999px;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.4);pointer-events:none";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 3500);
  } catch {
    /* geen DOM — negeren */
  }
}
