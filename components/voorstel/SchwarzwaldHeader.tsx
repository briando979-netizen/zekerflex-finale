"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE, CONTACT, MENU, TOPLINKS } from "@/lib/voorstel/schwarzwald";

// Kop van het Schwarzwald-voorstel, met hetzelfde menu als hun huidige site:
// op de computer uitklapmenu's per groep, op mobiel een hamburgermenu over het
// hele scherm met uitklapgroepen. Zoeken werkt op beide over alle pagina's.

export interface ZoekItem {
  label: string;
  href: string;
  groep: string;
}

const kaal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Logo({ className = "h-12 w-auto sm:h-14" }: { className?: string }) {
  return <Image src="/voorstel/schwarzwald/logo.webp" alt="Het Schwarzwald, restaurant en partycentrum" width={484} height={322} priority className={className} />;
}

function Pijltje({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Zoeken({ index, autoFocus = false, donker = false }: { index: ZoekItem[]; autoFocus?: boolean; donker?: boolean }) {
  const [q, setQ] = useState("");
  const treffers = useMemo(() => {
    const woorden = kaal(q).split(/\s+/).filter(Boolean);
    if (!woorden.length) return [];
    return index.filter((i) => woorden.every((w) => kaal(`${i.label} ${i.groep}`).includes(w))).slice(0, 8);
  }, [q, index]);

  return (
    <div>
      <label className="sr-only" htmlFor="schw-zoek">Zoeken</label>
      <input
        id="schw-zoek"
        type="search"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ik ben op zoek naar…"
        className={`w-full rounded-full border-0 px-5 py-3.5 text-base ring-1 focus:outline-none focus:ring-2 focus:ring-schw-orange ${
          donker ? "bg-white/10 text-schw-cream ring-white/15 placeholder:text-schw-cream/50" : "bg-white text-schw-night ring-schw-night/15"
        }`}
      />
      {q.trim() && (
        <ul className="mt-3 space-y-1" aria-live="polite">
          {treffers.length === 0 && <li className={`px-2 py-2 text-sm ${donker ? "text-schw-cream/60" : "text-schw-mute"}`}>Niets gevonden voor &ldquo;{q}&rdquo;</li>}
          {treffers.map((t) => (
            <li key={`${t.href}-${t.label}`}>
              <Link href={t.href} className={`flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 ${donker ? "hover:bg-white/10" : "hover:bg-schw-sand"}`}>
                <span className="font-semibold">{t.label}</span>
                <span className={`text-xs ${donker ? "text-schw-cream/50" : "text-schw-mute"}`}>{t.groep}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SchwarzwaldHeader({ zoekIndex }: { zoekIndex: ZoekItem[] }) {
  const [mobiel, setMobiel] = useState(false);
  const [groep, setGroep] = useState<string | null>(null);
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [zoek, setZoek] = useState(false);
  const pathname = usePathname();
  const kop = useRef<HTMLElement>(null);

  useEffect(() => {
    setMobiel(false);
    setGroep(null);
    setZoek(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobiel(false);
      setGroep(null);
      setZoek(false);
    };
    const onKlik = (e: MouseEvent) => {
      if (kop.current && !kop.current.contains(e.target as Node)) {
        setGroep(null);
        setZoek(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onKlik);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onKlik);
    };
  }, []);

  useEffect(() => {
    if (!mobiel) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobiel]);

  return (
    // geen backdrop-blur: dat maakt de kop het referentievlak voor `fixed`, en dan vult het mobiele menu het scherm niet meer
    <header ref={kop} className="sticky top-0 z-40 bg-schw-night text-schw-cream">
      {/* bovenbalk, zoals op hun site */}
      <div className="hidden border-b border-white/10 lg:block">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center gap-6 px-8 text-xs">
          <span className="text-schw-cream/80">
            <span className="text-schw-sun">★★★★★</span> <strong className="text-schw-cream">{CONTACT.score}</strong>/10 uit {CONTACT.aantalReviews} beoordelingen
          </span>
          <nav aria-label="Service" className="ml-auto flex items-center gap-5">
            {TOPLINKS.map((t) => (
              <Link key={t.href} href={t.href} className="text-schw-cream/70 hover:text-schw-cream">
                {t.label}
              </Link>
            ))}
            <a href={CONTACT.telefoonHref} className="font-semibold text-schw-cream hover:text-schw-sun">
              Bel ons: {CONTACT.telefoon}
            </a>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-4 px-4 sm:px-8">
        <Link href={BASE} aria-label="Het Schwarzwald, naar de homepage" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Hoofdmenu" className="ml-auto hidden lg:block">
          <ul className="flex items-center">
            {MENU.map((g) => {
              const open = groep === g.label;
              const id = `schw-groep-${g.label.replace(/\W+/g, "")}`;
              return (
                <li key={g.label} className="relative" onMouseEnter={() => setGroep(g.label)} onMouseLeave={() => setGroep(null)}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={() => setGroep(open ? null : g.label)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                      open ? "bg-white/10 text-schw-sun" : "text-schw-cream/85 hover:text-schw-cream"
                    }`}
                  >
                    {g.label}
                    <Pijltje open={open} />
                  </button>
                  {open && (
                    <div id={id} className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
                      <div className={`rounded-2xl bg-white p-3 text-schw-night shadow-2xl ring-1 ring-black/5 ${g.items.length > 7 ? "grid w-[480px] grid-cols-2" : "w-64"}`}>
                        {g.items.map((i) => (
                          <Link key={i.href + i.label} href={i.href} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-schw-sand">
                            {i.label}
                            {i.nieuw && <span className="rounded-full bg-schw-sun px-2 py-0.5 text-[10px] font-bold">Nieuw</span>}
                          </Link>
                        ))}
                        {g.href && !g.items.some((i) => i.href === g.href) && (
                          <Link href={g.href} className="col-span-full mt-1 block rounded-xl bg-schw-night px-3 py-2.5 text-center text-sm font-bold text-schw-cream">
                            Bekijk alle {g.label.toLowerCase()} →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative ml-auto lg:ml-0">
          <button
            type="button"
            onClick={() => setZoek((v) => !v)}
            aria-expanded={zoek}
            aria-label="Zoeken"
            className="hidden h-10 w-10 place-items-center rounded-full border border-white/15 hover:bg-white/10 lg:grid"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {zoek && (
            <div className="absolute right-0 top-full z-50 mt-3 w-[380px] rounded-2xl bg-white p-4 text-schw-night shadow-2xl">
              <Zoeken index={zoekIndex} autoFocus />
            </div>
          )}
        </div>

        <Link
          href={`${BASE}/reserveren`}
          className="rounded-full bg-schw-orange px-5 py-2.5 text-sm font-bold text-schw-night shadow-[0_8px_24px_-8px_rgba(255,95,31,0.7)] transition-transform hover:-translate-y-0.5"
        >
          Reserveer
        </Link>
        <button
          type="button"
          onClick={() => setMobiel(true)}
          aria-expanded={mobiel}
          aria-controls="schw-menu"
          aria-label="Menu openen"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {mobiel && (
        <div id="schw-menu" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col bg-schw-night text-schw-cream lg:hidden">
          <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/10 px-4">
            <Logo />
            <button
              type="button"
              onClick={() => setMobiel(false)}
              aria-label="Menu sluiten"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5">
            <Zoeken index={zoekIndex} donker />
            <ul className="mt-5">
              {MENU.map((g) => {
                const open = subOpen === g.label;
                const id = `schw-sub-${g.label.replace(/\W+/g, "")}`;
                return (
                  <li key={g.label} className="border-b border-white/10">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={id}
                      onClick={() => setSubOpen(open ? null : g.label)}
                      className="flex w-full items-center justify-between py-4 text-left font-display text-2xl font-bold"
                    >
                      {g.label}
                      <Pijltje open={open} />
                    </button>
                    {open && (
                      <ul id={id} className="pb-4">
                        {g.href && !g.items.some((i) => i.href === g.href) && (
                          <li>
                            <Link href={g.href} className="block py-2 font-semibold text-schw-sun">
                              Alle {g.label.toLowerCase()}
                            </Link>
                          </li>
                        )}
                        {g.items.map((i) => (
                          <li key={i.href + i.label}>
                            <Link href={i.href} className="flex items-center gap-2 py-2 text-schw-cream/85">
                              {i.label}
                              {i.nieuw && <span className="rounded-full bg-schw-sun px-2 py-0.5 text-[10px] font-bold text-schw-night">Nieuw</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <ul className="mt-5 grid grid-cols-2 gap-2 text-sm">
              {TOPLINKS.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="block rounded-xl bg-white/5 px-4 py-3 font-semibold">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              <Link href={`${BASE}/reserveren`} className="rounded-full bg-schw-orange py-4 text-center font-bold text-schw-night">
                Reserveer je uitje
              </Link>
              <a href={CONTACT.telefoonHref} className="rounded-full border border-white/20 py-4 text-center font-semibold">
                Bel {CONTACT.telefoon}
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
