"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { fireConfetti } from "@/components/ui/confetti";

/**
 * Subtiele mijlpaal-felicitatie: bij het bereiken van een drempel (1e, 5e, 10e…
 * voltooide klus) verschijnt één keer een feest-toast. De hoogst gevierde
 * drempel staat in localStorage, zodat je nooit dubbel gefeliciteerd wordt —
 * ook niet als je in één keer meerdere drempels voorbij schiet.
 */
const THRESHOLDS = [1, 5, 10, 25, 50, 100, 250, 500];

export function MilestoneCelebration({ count, firstText, nText }: { count: number; firstText: string; nText: string }) {
  const toast = useToast();
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem("zf:milestone") ?? "0") || 0;
    } catch {
      /* geen opslag — dan gewoon niet vieren om dubbel te voorkomen */
      return;
    }
    const reached = THRESHOLDS.filter((t) => t <= count && t > last);
    if (reached.length === 0) return;
    const top = reached[reached.length - 1]!;
    try {
      localStorage.setItem("zf:milestone", String(top));
    } catch {
      return;
    }
    toast.success(top === 1 ? firstText : `${top} ${nText}`);
    fireConfetti();
  }, [count, firstText, nText, toast]);
  return null;
}
