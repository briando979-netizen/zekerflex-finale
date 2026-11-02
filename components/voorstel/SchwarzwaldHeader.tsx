"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE, CONTACT } from "@/lib/voorstel/schwarzwald";

// Kop van het Schwarzwald-voorstel: woordmerk, hoofdmenu en een altijd
// zichtbare reserveerknop. Op mobiel klapt het menu uit als volledig scherm.

const NAV = [
  { href: `${BASE}/activiteiten`, label: "Activiteiten" },
  { href: `${BASE}/themafeesten`, label: "Themafeesten" },
  { href: `${BASE}/voor/bedrijfsuitje`, label: "Zakelijk" },
  { href: `${BASE}/voor/vrijgezellenfeest`, label: "Vrijgezellen" },
  { href: `${BASE}/voor/restaurant`, label: "Eten & drinken" },
];

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`font-display text-xl font-bold leading-none tracking-tight ${light ? "text-schw-cream" : "text-schw-night"}`}>
      Het <span className="text-schw-orange">Schwarz</span>wald
    </span>
  );
}

export function SchwarzwaldHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-schw-night/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-8">
        <Link href={BASE} aria-label="Het Schwarzwald, naar de homepage">
          <Wordmark light />
        </Link>
        <nav aria-label="Hoofdmenu" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      active ? "bg-white/10 text-schw-sun" : "text-schw-cream/80 hover:bg-white/5 hover:text-schw-cream"
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <a
          href={CONTACT.telefoonHref}
          className="ml-auto hidden text-sm font-semibold text-schw-cream/80 hover:text-schw-cream sm:block lg:ml-0"
        >
          {CONTACT.telefoon}
        </a>
        <Link
          href={`${BASE}/reserveren`}
          className="ml-auto rounded-full bg-schw-orange px-5 py-2.5 text-sm font-bold text-schw-night shadow-[0_8px_24px_-8px_rgba(255,95,31,0.7)] transition-transform hover:-translate-y-0.5 sm:ml-0"
        >
          Reserveer
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="schw-menu"
          aria-label={open ? "Menu sluiten" : "Menu openen"}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-schw-cream lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {open ? (
              <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {open && (
        <div id="schw-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-schw-night px-4 pb-10 pt-6 lg:hidden">
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block border-b border-white/10 py-4 font-display text-3xl font-bold text-schw-cream">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-3">
            <Link href={`${BASE}/reserveren`} className="rounded-full bg-schw-orange py-4 text-center font-bold text-schw-night">
              Reserveer je uitje
            </Link>
            <a href={CONTACT.telefoonHref} className="rounded-full border border-white/20 py-4 text-center font-semibold text-schw-cream">
              Bel {CONTACT.telefoon}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
