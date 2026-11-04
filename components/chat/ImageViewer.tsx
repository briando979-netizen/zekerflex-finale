"use client";

import { useEffect, useRef } from "react";
import { Portal } from "./Portal";
import { IconClose, IconDownload } from "./icons";

/** Een foto uit de chat schermvullend bekijken, met downloaden. Esc of tikken naast de foto sluit. */
export function ImageViewer({ src, filename, onClose }: { src: string; filename: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label={`Foto: ${filename}`} className="fixed inset-0 z-[100] flex flex-col bg-black/90" onClick={onClose}>
        <div className="flex items-center gap-2 px-3 py-2 text-white" onClick={(e) => e.stopPropagation()}>
          <p className="min-w-0 flex-1 truncate text-sm">{filename}</p>
          <a href={`${src}?dl=1`} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Foto downloaden" title="Downloaden">
            <IconDownload className="h-5 w-5" />
          </a>
          <button ref={closeRef} type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Sluiten" title="Sluiten (Esc)">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={filename} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      </div>
    </Portal>
  );
}
