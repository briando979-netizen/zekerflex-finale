"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — not in the official navigator typings.
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}

// Real "install the app" entry point — the manifest + service worker already
// make ZekerFlex a genuinely installable PWA on both Android and iOS today,
// no app-store review needed. This replaces store badges that pointed at a
// generic search (Android) or a non-existent listing (iOS) with something
// that actually works when clicked.
export function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <span className={`inline-flex items-center gap-2 text-sm font-semibold text-white/70 ${className}`}>
        ✓ App is geïnstalleerd
      </span>
    );
  }

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    if (ios) {
      setShowIosHelp((v) => !v);
    }
  };

  // Neither prompt available yet (Chrome hasn't fired it) nor iOS: nothing
  // useful to do — don't show a button that does nothing.
  if (!deferred && !ios) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-white transition-colors hover:border-brand-mint hover:bg-white/[0.08]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[10px] uppercase tracking-wide text-white/50">Werkt direct, geen store nodig</span>
          <span className="block text-sm font-bold">Installeer de app</span>
        </span>
      </button>
      {showIosHelp && (
        <p className="mt-2 max-w-[220px] text-xs text-white/65">
          Tik in Safari op <strong>Deel</strong> (het vierkantje met pijl) en kies{" "}
          <strong>Zet op beginscherm</strong>.
        </p>
      )}
    </div>
  );
}
