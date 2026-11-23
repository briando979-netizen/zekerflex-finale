"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Een tooltip voor de werkgeversapp (23 nov 2026; tot nu toe stond overal een kaal `title=`, dat op een telefoon niets doet en
// door een schermlezer wisselend wordt voorgelezen). De aanleiding is een echte knop: zweven of focus toont de uitleg, tikken
// of Enter zet hem vast of haalt hem weg, Escape en ergens anders tikken sluiten hem. De uitleg hangt met aria-describedby aan
// de knop (role="tooltip"), dus een schermlezer leest hem voor zodra de knop focus krijgt. Het vlak is wit met de sierlijn van
// ZekerFlex erboven. Geen portal: het vlak staat in de rij zelf, dus het thema (donker) werkt vanzelf.

export function Tooltip({
  inhoud,
  children,
  label,
  kant = "links",
  breed = false,
  opRij = false,
  className = "",
}: {
  /** wat er in de tooltip staat */
  inhoud: ReactNode;
  /** wat de knop toont (een icoon of een stukje tekst) */
  children: ReactNode;
  /** de naam van de knop voor een schermlezer, als de knop alleen een icoon toont */
  label?: string | undefined;
  /** aan welke kant van de knop het vlak begint: "rechts" voor een knop aan de rechterkant van het scherm */
  kant?: "links" | "rechts" | "midden";
  /** een breed vlak (voor meer dan één regel uitleg) */
  breed?: boolean;
  /**
   * In een reactierij: onder 1280 px (de rij is dan een kaart) hangt het vlak onder de hele rij, over de volle breedte, zodat het
   * nooit buiten het scherm valt. De rij zelf moet dan gepositioneerd zijn (relative).
   */
  opRij?: boolean;
  /** de klassen van de knop */
  className?: string;
}) {
  const id = useId();
  const [zweeft, setZweeft] = useState(false);
  const [vast, setVast] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const open = zweeft || vast;

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setVast(false);
      setZweeft(false);
    };
    const buiten = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) setVast(false);
    };
    document.addEventListener("keydown", toets);
    document.addEventListener("pointerdown", buiten);
    return () => {
      document.removeEventListener("keydown", toets);
      document.removeEventListener("pointerdown", buiten);
    };
  }, [open]);

  const plek = kant === "rechts" ? "right-0" : kant === "midden" ? "left-1/2 -translate-x-1/2" : "left-0";
  const maat = opRij
    ? `left-3 right-3 ${kant === "rechts" ? "xl:left-auto xl:right-0" : "xl:left-0 xl:right-auto"} ${breed ? "xl:w-[40rem]" : "xl:w-max xl:max-w-[18rem]"}`
    : `${plek} ${breed ? "w-[min(40rem,calc(100vw-3rem))]" : "w-max max-w-[min(18rem,calc(100vw-3rem))]"}`;
  return (
    <span
      ref={ref}
      className={opRij ? "inline-flex xl:relative" : "relative inline-flex"}
      onPointerEnter={(e) => {
        // alleen een muis zweeft; een vinger tikt (en zet de tooltip vast)
        if (e.pointerType === "mouse") setZweeft(true);
      }}
      onPointerLeave={() => setZweeft(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setVast((v) => !v)}
        onFocus={() => setZweeft(true)}
        onBlur={() => setZweeft(false)}
        className={className}
      >
        {children}
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-30 mt-2 block overflow-hidden rounded-lg border border-hair bg-white text-left text-sm font-normal leading-relaxed text-ink shadow-e3 ${maat}`}
        >
          <span aria-hidden className="block h-[3px] bg-gradient-to-r from-ink via-brand-500 to-ink" />
          <span className="block px-4 py-3">{inhoud}</span>
        </span>
      ) : null}
    </span>
  );
}
