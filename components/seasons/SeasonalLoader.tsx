"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isThemeId, type ThemeId } from "@/lib/seasons/calendar";

// The decoration itself is its own chunk: on an ordinary day nothing loads.
const SeasonalDecor = dynamic(() => import("@/components/seasons/SeasonalDecor").then((m) => m.SeasonalDecor), { ssr: false });

/**
 * Festive decoration for a Dutch holiday or a birthday (lib/seasons). It waits
 * until the page is idle, so it never delays anything. With `preview`, any
 * page shows ?thema=<naam> — that is how Admin → Huisstijl previews a theme.
 */
export function SeasonalLoader({
  theme,
  countdownTo = null,
  naam = null,
  preview = false,
}: {
  theme: ThemeId | null;
  countdownTo?: string | null;
  naam?: string | null;
  preview?: boolean;
}) {
  const [show, setShow] = useState<ThemeId | null>(null);

  useEffect(() => {
    let wanted = theme;
    if (preview) {
      try {
        const asked = new URLSearchParams(window.location.search).get("thema");
        if (isThemeId(asked)) wanted = asked;
      } catch {
        /* geen URL: gewoon het thema van vandaag */
      }
    }
    if (!wanted) return;
    const chosen = wanted;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setShow(chosen), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => setShow(chosen), 1200);
    return () => window.clearTimeout(timer);
  }, [theme, preview]);

  // Into <body>: inside an app shell an animated ancestor (transform) would make
  // "fixed" relative to that element instead of the screen.
  return show ? createPortal(<SeasonalDecor theme={show} countdownTo={countdownTo} naam={naam} />, document.body) : null;
}
