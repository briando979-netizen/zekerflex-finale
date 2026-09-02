"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";

const KEY = "zf-welcome-seen-v1";

/**
 * First-run welcome popup. Shows once per browser (localStorage-gated) when a
 * freelancer lands on their dashboard, then never again. Purely informational.
 */
export function WelcomeDialog({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* storage blocked — just don't show it */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function dismiss() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zf-welcome-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md animate-slide-up-fade rounded-2xl border border-hair bg-white p-6 shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <LogoGlyph size={34} tone="dark" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-600">Welkom bij ZekerFlex</p>
            <h2 id="zf-welcome-title" className="font-display text-lg font-bold text-ink">
              Fijn dat je er bent, {firstName}
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-neutralx-600">
          Je account staat klaar. Drie dingen om mee te beginnen:
        </p>
        <ul className="mt-3 space-y-2.5 text-sm text-neutralx-700">
          <li className="flex gap-2.5">
            <span className="mt-0.5 text-brand-mint">1.</span>
            <span>
              Rond je <Link href="/dashboard/verificatie" className="font-semibold text-brand-600 hover:underline">verificatie</Link> af
              (KVK, identiteit en je documenten) zodat je diensten kunt aannemen.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 text-brand-mint">2.</span>
            <span>
              Stel je <Link href="/dashboard/beschikbaarheid" className="font-semibold text-brand-600 hover:underline">beschikbaarheid</Link> en
              voorkeuren in — dan zie je alleen klussen die bij je passen.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 text-brand-mint">3.</span>
            <span>
              Lees de{" "}
              <a href="/kennis/whitepapers" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline">
                whitepapers
              </a>{" "}
              over belasting, uitbetaling en verzekering. Je bent vanaf je eerste klus gratis verzekerd.
            </span>
          </li>
        </ul>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="btn-primary text-sm">
            Aan de slag
          </button>
        </div>
      </div>
    </div>
  );
}
