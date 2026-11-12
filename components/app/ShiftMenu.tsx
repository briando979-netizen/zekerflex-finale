"use client";

import { copyText } from "@/lib/clipboard";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";

const HIDDEN_KEY = "zf-hidden-employers";

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

/** Adds an employer name to the per-device hidden list. */
export function hideEmployer(name: string): void {
  try {
    const set = new Set(readHidden());
    set.add(name);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function hiddenEmployers(): Set<string> {
  return new Set(readHidden());
}

/** "..." menu on a klus: hide this employer, or share the klus. */
export function ShiftMenu({
  employerName,
  shiftTitle,
}: {
  employerName: string;
  shiftTitle: string;
}) {
  const t = useFT().los.menu;
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function share() {
    setOpen(false);
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: shiftTitle, url });
        return;
      }
      await copyText(url);
      toast.success(t.gekopieerd);
    } catch {
      /* user cancelled share */
    }
  }

  function hide() {
    setOpen(false);
    hideEmployer(employerName);
    toast.success(vulIn(t.verborgen, { naam: employerName }), t.verborgenTekst);
    router.push("/dashboard/klussen");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.meer}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-lg text-ink shadow-card backdrop-blur"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-hair bg-white p-1.5 shadow-lift">
          <button
            type="button"
            onClick={hide}
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper-soft"
          >
            {t.verberg}
          </button>
          <button
            type="button"
            onClick={share}
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper-soft"
          >
            {t.deel}
          </button>
        </div>
      )}
    </div>
  );
}
