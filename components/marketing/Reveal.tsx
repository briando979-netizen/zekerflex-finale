"use client";

import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";

/**
 * Scroll-reveal wrapper. Adds `data-shown` once the element scrolls into view;
 * the animation itself lives in .reveal (globals.css) and is disabled under
 * prefers-reduced-motion. Purely presentational.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  once = true,
  cms,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
  once?: boolean;
  /** tekst-sleutel (lib/content/store.ts), in het voorbeeld van de Site-ontwerper aanklikbaar; regel = welk punt van een lijsttekst */
  cms?: { key: string; regel?: number };
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    // 11 nov (eigenaar): geen lege vlakken tijdens het scrollen. Een blok verschijnt al als het nog een
    // heel scherm onder het beeld ligt (rootMargin 100%), en altijd na 2,5 s, ook als de waarnemer niets
    // meldt (snel scrollen, een volledige schermafdruk, afdrukken).
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold: 0, rootMargin: "0px 0px 100% 0px" },
    );
    io.observe(el);
    const vangnet = once
      ? window.setTimeout(() => {
          setShown(true);
          io.disconnect();
        }, 2500)
      : 0;
    return () => {
      io.disconnect();
      window.clearTimeout(vangnet);
    };
  }, [once]);

  return (
    <Tag
      ref={ref}
      data-shown={shown}
      data-cms-key={cms?.key}
      data-cms-regel={cms?.regel}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </Tag>
  );
}
