"use client";

import { createElement, useEffect, useRef, useState } from "react";

// 3D-weergave van een product (draaien, zoomen, AR op de telefoon) met Google's
// model-viewer. Het pakket (met three.js) zit in onze eigen bundel en wordt pas
// geladen als iemand de 3D-weergave opent, zodat de gewone pagina even snel
// blijft. Zonder WebGL of bij een fout: een nette melding, de foto's blijven.

type State = "laden" | "klaar" | "geladen" | "geen-webgl" | "fout";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Model3DViewer({ src, alt, poster, className = "" }: { src: string; alt: string; poster?: string | null; className?: string }) {
  const [state, setState] = useState<State>("laden");
  const [still, setStill] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!hasWebGL()) {
      setState("geen-webgl");
      return;
    }
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => !cancelled && setState("klaar"))
      .catch(() => !cancelled && setState("fout"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || state !== "klaar") return;
    const onLoad = () => setState("geladen");
    const onError = () => setState("fout");
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [state]);

  if (state === "geen-webgl" || state === "fout") {
    return (
      <div className={`grid place-items-center bg-paper-soft p-6 text-center ${className}`} role="status">
        <p className="max-w-xs text-sm text-neutralx-600">
          {state === "geen-webgl" ? "Je browser kan geen 3D tonen. Bekijk de foto's van dit product." : "Het 3D-model kon niet geladen worden. Bekijk de foto's van dit product."}
        </p>
      </div>
    );
  }

  return (
    <div className={`relative bg-paper-soft ${className}`}>
      {state !== "laden" &&
        createElement("model-viewer", {
          ref,
          src,
          alt,
          ...(poster ? { poster } : {}),
          "camera-controls": "",
          ...(still ? {} : { "auto-rotate": "", "auto-rotate-delay": "1500" }),
          "interaction-prompt": "auto",
          "shadow-intensity": "1",
          exposure: "1",
          ar: "",
          "ar-modes": "webxr scene-viewer quick-look",
          "touch-action": "pan-y",
          style: { width: "100%", height: "100%", background: "transparent" },
        })}
      {state !== "geladen" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-live="polite">
          <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-e1">3D-model laden…</span>
        </div>
      )}
      {state === "geladen" && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] text-neutralx-600 shadow-e1">
          Sleep om te draaien · knijp of scroll om te zoomen
        </p>
      )}
    </div>
  );
}
