"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { AuthLanguage } from "@/components/auth/AuthLanguage";
import type { Locale } from "@/lib/i18n/config";
import type { WelkomDict } from "@/lib/i18n/welkom";
import {
  AANTAL_SLIDES,
  WELKOM_STORAGE_KEY,
  gezienCookie,
  slideNaSwipe,
  slideVanScroll,
  volgendeSlide,
  vorigeSlide,
} from "@/lib/welkom/slides";

const FOTOS = ["/welkom/slide-1.webp", "/welkom/slide-2.webp", "/welkom/slide-3.webp"] as const;

/** Onthoud (nooit essentieel) dat de carrousel gezien is: cookie voor de server, localStorage als reserve. */
function onthoudGezien(): void {
  try {
    document.cookie = gezienCookie();
  } catch {
    /* geen cookies: dan zien ze de carrousel de volgende keer weer */
  }
  try {
    window.localStorage.setItem(WELKOM_STORAGE_KEY, "1");
  } catch {
    /* privévenster of geblokkeerd */
  }
}

function Pijl({ richting }: { richting: "links" | "rechts" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={richting === "links" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WelkomCarousel({
  locale,
  texts,
  registerHref,
}: {
  locale: Locale;
  texts: WelkomDict;
  registerHref: string;
}) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const touchX = useRef<number | null>(null);
  const laatste = index === AANTAL_SLIDES - 1;

  const gaNaar = useCallback((i: number) => {
    const el = scroller.current;
    setIndex(i);
    if (!el) return;
    const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: rustig ? "auto" : "smooth" });
  }, []);

  function onScroll() {
    if (raf.current !== null) return;
    raf.current = window.requestAnimationFrame(() => {
      raf.current = null;
      const el = scroller.current;
      if (el) setIndex(slideVanScroll(el.scrollLeft, el.clientWidth));
    });
  }

  useEffect(() => {
    return () => {
      if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    };
  }, []);

  // de laatste slide gezien: een volgende keer in de app meteen naar het inlogscherm
  useEffect(() => {
    if (laatste) onthoudGezien();
  }, [laatste]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      gaNaar(volgendeSlide(index));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      gaNaar(vorigeSlide(index));
    }
  }

  // vegen op het witte paneel werkt net als vegen op de foto
  function onTouchStart(e: TouchEvent<HTMLElement>) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: TouchEvent<HTMLElement>) {
    const start = touchX.current;
    touchX.current = null;
    const eind = e.changedTouches[0]?.clientX;
    if (start === null || eind === undefined) return;
    const naar = slideNaSwipe(index, eind - start);
    if (naar !== index) gaNaar(naar);
  }

  const slide = texts.slides[index] ?? texts.slides[0];
  const van = (n: number) => texts.slideOf.replace("{n}", String(n)).replace("{total}", String(AANTAL_SLIDES));

  return (
    <main className="welkom-scherm flex min-h-[100dvh] items-center justify-center bg-ink md:p-8">
      <section
        aria-roledescription="carousel"
        aria-label={texts.carousel}
        onKeyDown={onKeyDown}
        className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-ink md:h-[min(100dvh-4rem,820px)] md:rounded-3xl md:shadow-2xl"
      >
        {/* foto's: eigen scroll-snap, vegen werkt native */}
        <div
          ref={scroller}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={texts.carousel}
          className="relative flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-none"
        >
          {FOTOS.map((src, i) => (
            <div
              key={src}
              role="group"
              aria-roledescription="slide"
              aria-label={van(i + 1)}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <Image
                src={src}
                alt={texts.slides[i]?.alt ?? ""}
                fill
                sizes="(min-width: 448px) 448px, 100vw"
                priority={i === 0}
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/55 to-transparent" />
            </div>
          ))}
        </div>

        {/* logo en taalkeuze over de foto */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-ink/50 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <span className="flex items-center gap-2 text-white">
            <LogoGlyph size={28} tone="light" />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </span>
          <span className="rounded-full bg-white/90 backdrop-blur">
            <AuthLanguage locale={locale} label={texts.lang} />
          </span>
        </div>

        {/* pijlen: vooral voor toetsenbord en muis; op de telefoon veeg je */}
        <div className="pointer-events-none absolute inset-x-3 top-[28%] z-10 hidden justify-between md:flex">
          <button
            type="button"
            onClick={() => gaNaar(vorigeSlide(index))}
            disabled={index === 0}
            aria-label={texts.prev}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow disabled:opacity-0"
          >
            <Pijl richting="links" />
          </button>
          <button
            type="button"
            onClick={() => gaNaar(volgendeSlide(index))}
            disabled={laatste}
            aria-label={texts.next}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow disabled:opacity-0"
          >
            <Pijl richting="rechts" />
          </button>
        </div>

        {/* wit paneel */}
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative z-10 -mt-6 rounded-t-[28px] bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
        >
          <div role="tablist" aria-label={texts.carousel} className="flex justify-center">
            {texts.slides.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={van(i + 1)}
                onClick={() => gaNaar(i)}
                className="group grid h-9 min-w-6 place-items-center px-1"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                    i === index ? "w-7 bg-brand-500" : "w-2.5 bg-hairstrong group-hover:bg-brand-300"
                  }`}
                />
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-live="polite" className="mt-3 min-h-[8.5rem] text-center">
            <h1 className="text-balance font-display text-2xl font-bold leading-tight text-ink">{slide?.title}</h1>
            <p className="mx-auto mt-2 max-w-xs text-pretty text-[15px] leading-relaxed text-neutralx-600">{slide?.text}</p>
            {laatste && <p className="mx-auto mt-2 max-w-xs text-xs leading-snug text-neutralx-500">{texts.note}</p>}
          </div>

          <div className="mt-4 space-y-3">
            <Link href={registerHref} onClick={onthoudGezien} className="btn-primary w-full !py-3.5 !text-base">
              {texts.create}
            </Link>
            <Link
              href="/login"
              onClick={onthoudGezien}
              className="btn w-full border-2 border-ink bg-white !py-3 !text-base text-ink hover:bg-paper-soft"
            >
              {texts.login}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
