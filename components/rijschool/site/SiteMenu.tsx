"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

// Het menu van een rijschoolsite op de telefoon: een knop die een paneel met de
// ankers opent (op een groot scherm staan die links gewoon in de kop). Esc of
// een klik op een link sluit het; de focus gaat terug naar de knop.

export function SiteMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const knop = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        knop.current?.focus();
      }
    };
    document.addEventListener("keydown", toets);
    return () => document.removeEventListener("keydown", toets);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={knop}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="grid h-10 w-10 place-items-center rounded-full hover:bg-schw-night/5"
      >
        <span className="sr-only">{open ? "Menu sluiten" : "Menu openen"}</span>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id={id} aria-label="Menu" className="absolute inset-x-0 top-full border-b border-schw-night/10 bg-schw-cream shadow-lg">
          <ul className="mx-auto max-w-[1280px] px-4 py-3 sm:px-8">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-display text-lg font-bold hover:bg-schw-night/5">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
