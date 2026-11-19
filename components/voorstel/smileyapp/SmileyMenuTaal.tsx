"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TaalKiezer } from "@/components/voorstel/smileyapp/TaalKiezer";

// Het menu op de telefoon (onder lg) op /en en /de: dezelfde knop en hetzelfde
// uitklappen als SmileyMenu, met de links en teksten van die taal. De kop
// (components/voorstel/smileyapp/taal/Kader.tsx) geeft ze mee als gewone
// gegevens. Sluit na een keuze, bij een andere pagina en met Escape.

export interface MenuLink {
  label: string;
  href: string;
}

interface Props {
  items: readonly MenuLink[];
  demo: MenuLink;
  klantlogin: MenuLink;
  teksten: { openen: string; sluiten: string; naam: string };
}

export function SmileyMenuTaal({ items, demo, klantlogin, teksten }: Props) {
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
    // open menu: de zwevende chatknop gaat weg (smiley.css), anders ligt hij over de menuknoppen
    document.documentElement.dataset.smMenu = "open";
    return () => {
      window.removeEventListener("keydown", esc);
      delete document.documentElement.dataset.smMenu;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="sm-menu-taal" className="grid h-11 w-11 place-items-center rounded-full bg-smiley-ink text-white">
        <span className="sr-only">{open ? teksten.sluiten : teksten.openen}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <nav id="sm-menu-taal" aria-label={teksten.naam} className="absolute inset-x-0 top-full border-b border-smiley-ink/10 bg-white px-4 pb-6 pt-2 shadow-[0_30px_60px_-30px_rgba(14,42,32,0.45)]">
          <ul className="divide-y divide-smiley-ink/10">
            {items.map((m) => (
              <li key={m.href}>
                <Link href={m.href} onClick={() => setOpen(false)} className="flex items-center justify-between py-3.5 font-display text-lg font-bold text-smiley-ink">
                  {m.label}
                  <span aria-hidden="true" className="text-smiley-leaf">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2">
            <Link href={demo.href} onClick={() => setOpen(false)} className="rounded-full bg-smiley-ink px-4 py-3.5 text-center font-bold text-white">
              {demo.label}
            </Link>
            <a href={klantlogin.href} className="rounded-full px-4 py-3 text-center text-sm font-bold text-smiley-ink ring-1 ring-smiley-ink/20">
              {klantlogin.label}
            </a>
          </div>
          <div className="mt-5 flex justify-center">
            <TaalKiezer variant="menu" />
          </div>
        </nav>
      )}
    </div>
  );
}
