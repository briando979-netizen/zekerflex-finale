"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE, KLANTLOGIN, MENU } from "@/lib/voorstel/smileyapp";

// Het menu op de telefoon (onder lg): een knop die het menu onder de kop
// uitklapt. Sluit na een keuze, bij een andere pagina en met Escape.

export function SmileyMenu() {
  const [open, setOpen] = useState(false);
  const pad = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pad]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="sm-menu"
        className="grid h-11 w-11 place-items-center rounded-full bg-smiley-ink text-white"
      >
        <span className="sr-only">{open ? "Menu sluiten" : "Menu openen"}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <nav id="sm-menu" aria-label="Menu" className="absolute inset-x-0 top-full border-b border-smiley-ink/10 bg-white px-4 pb-6 pt-2 shadow-[0_30px_60px_-30px_rgba(14,42,32,0.45)]">
          <ul className="divide-y divide-smiley-ink/10">
            {MENU.map((m) => (
              <li key={m.href}>
                <Link href={m.href} onClick={() => setOpen(false)} className="flex items-center justify-between py-3.5 font-display text-lg font-bold text-smiley-ink">
                  {m.label}
                  <span aria-hidden="true" className="text-smiley-leaf">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`${BASE}/demo`} onClick={() => setOpen(false)} className="col-span-2 rounded-full bg-smiley-ink px-4 py-3.5 text-center font-bold text-white">
              Vraag een demo aan
            </Link>
            <a href={KLANTLOGIN} className="rounded-full px-4 py-3 text-center text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20">
              Klantlogin
            </a>
            <Link href={`${BASE}/contact`} onClick={() => setOpen(false)} className="rounded-full bg-smiley-green px-4 py-3 text-center text-sm font-bold text-smiley-ink">
              Contact opnemen
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
