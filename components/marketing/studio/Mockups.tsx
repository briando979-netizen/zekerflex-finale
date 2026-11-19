"use client";

import type { ReactNode } from "react";

// "Zo ziet het eruit op …": schetsen van echte dingen (visitekaartjes, een website, een shirt, een kladblok, een telefoon,
// een poster) om een logo of advertentie heen. Alles eigen CSS- en SVG-vormen, geen foto's. De beelden die erin staan zijn
// dezelfde die de pagina al toont: bij een aanvraag het voorbeeld MET watermerk van de beeldroute (de schone versie komt
// hier vóór vrijgave nooit in), op de landingspagina's de voorbeelden van verzonnen merken. Een clientcomponent, omdat de
// beelden hun contextmenu en slepen uitzetten; de pagina geeft alleen adressen en een kleur door. Op een telefoon is de rij veegbaar; elke kaart is `relative`,
// zodat niets de pagina breder maakt.

const DONKER = "#0B0B0C";
const geenMenu = (e: { preventDefault: () => void }) => e.preventDefault();

function Beeld({ src, className = "", stijl }: { src: string; className?: string; stijl?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden draggable={false} onContextMenu={geenMenu} onDragStart={geenMenu} loading="lazy" className={`pointer-events-none block select-none ${className}`} style={{ WebkitUserSelect: "none", userSelect: "none", ...stijl }} />
  );
}

function Kaart({ titel, children, donker = false }: { titel: string; children: ReactNode; donker?: boolean }) {
  return (
    <li className="relative w-[78vw] max-w-[20rem] flex-shrink-0 snap-center sm:w-auto sm:max-w-none">
      <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl ${donker ? "bg-[#17181A]" : "bg-[#ECE9E1]"}`}>{children}</div>
      <p className="mt-2.5 text-sm font-medium text-neutralx-600">{titel}</p>
    </li>
  );
}

function Rij({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </ul>
  );
}

const streep = (b: string, extra = "") => <span className={`block h-1.5 rounded-full bg-black/15 ${b} ${extra}`} />;

/** Logo: `donker` = wit op zwart, `licht` = zwart op wit, `kleur` = in de gekozen kleur op wit; `accent` is die kleur. */
export function LogoMockups({ donker, licht, kleur, accent, label = "Zo ziet je logo eruit" }: { donker: string; licht: string; kleur: string; accent: string; label?: string }) {
  return (
    <Rij label={label}>
      <Kaart titel="Op je visitekaartje">
        <div className="relative h-[62%] w-[70%]">
          <div className="absolute left-[14%] top-[18%] h-[72%] w-[80%] rotate-[7deg] overflow-hidden rounded-md shadow-[0_10px_24px_rgba(0,0,0,0.25)]" style={{ background: DONKER }}>
            <Beeld src={donker} className="h-full w-full object-cover" />
          </div>
          <div className="absolute left-0 top-0 flex h-[72%] w-[80%] -rotate-[5deg] flex-col justify-between overflow-hidden rounded-md bg-white p-[7%] shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
            <Beeld src={licht} className="h-[58%] w-[58%] object-cover" stijl={{ marginLeft: "-6%" }} />
            <div className="space-y-1.5">
              {streep("w-[46%]")}
              {streep("w-[34%]")}
            </div>
          </div>
        </div>
      </Kaart>

      <Kaart titel="Bovenaan je website (schets)">
        <div className="h-[78%] w-[84%] overflow-hidden rounded-lg bg-white shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
          <div className="flex h-[9%] items-center gap-1 bg-[#E4E1D8] px-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/25" />
          </div>
          <div className="flex h-[24%] items-center justify-between px-[4%]">
            <Beeld src={licht} className="h-full w-[26%] object-cover" />
            <div className="flex w-[40%] items-center justify-end gap-[7%]">
              {streep("w-[24%]")}
              {streep("w-[24%]")}
              {streep("w-[24%]")}
            </div>
          </div>
          <div className="flex h-[67%] flex-col justify-center gap-2 px-[7%]" style={{ background: accent }}>
            <span className="block h-2.5 w-[62%] rounded-full bg-white/90" />
            <span className="block h-2.5 w-[44%] rounded-full bg-white/90" />
            <span className="mt-1 block h-1.5 w-[52%] rounded-full bg-white/50" />
            <span className="mt-2 block h-5 w-[26%] rounded-full bg-white" />
          </div>
        </div>
      </Kaart>

      <Kaart titel="Op een shirt" donker>
        <div className="relative h-[92%] w-[70%]">
          <svg viewBox="0 0 200 190" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M66 8 C78 22 122 22 134 8 L176 26 L198 70 L168 86 L156 68 L156 184 L44 184 L44 68 L32 86 L2 70 L24 26 Z" fill={DONKER} stroke="#2B2C2F" strokeWidth="2" />
            <path d="M66 8 C78 26 122 26 134 8" fill="none" stroke="#2B2C2F" strokeWidth="5" />
          </svg>
          <Beeld src={donker} className="absolute left-[30%] top-[30%] w-[40%]" stijl={{ aspectRatio: "4 / 3", objectFit: "cover" }} />
        </div>
      </Kaart>

      <Kaart titel="Op je kladblok">
        <div className="relative h-[84%] w-[58%]">
          <div className="absolute inset-0 -rotate-3 overflow-hidden rounded-md bg-white shadow-[0_12px_26px_rgba(0,0,0,0.2)]">
            <div className="flex h-[9%] items-center justify-around px-[8%]" style={{ background: accent }}>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-white/80" />
              ))}
            </div>
            <Beeld src={kleur} className="mx-auto mt-[3%] w-[64%]" stijl={{ aspectRatio: "4 / 3", objectFit: "cover" }} />
            <div className="mt-[3%] space-y-2.5 px-[12%]">
              {streep("w-full")}
              {streep("w-full")}
              {streep("w-[70%]")}
            </div>
          </div>
          <span className="absolute -right-[22%] top-[26%] block h-[62%] w-[6%] rotate-[24deg] rounded-full" style={{ background: accent }} aria-hidden />
        </div>
      </Kaart>

      <Kaart titel="Als profielfoto" donker>
        <div className="flex h-[88%] w-[40%] flex-col items-center rounded-[1.4rem] border-[3px] border-[#3A3B3F] bg-white px-[8%] pt-[14%]">
          <div className="aspect-square w-[64%] overflow-hidden rounded-full ring-2 ring-black/10" style={{ background: DONKER }}>
            <Beeld src={donker} className="h-full w-full scale-[1.5] object-cover" />
          </div>
          <span className="mt-3 block h-2 w-[56%] rounded-full bg-black/70" />
          <span className="mt-1.5 block h-1.5 w-[40%] rounded-full bg-black/20" />
          <span className="mt-3 block h-5 w-[70%] rounded-full" style={{ background: accent }} />
          <div className="mt-3 grid w-full grid-cols-3 gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="block aspect-square rounded-sm bg-black/10" />
            ))}
          </div>
        </div>
      </Kaart>

      <Kaart titel="Op een gevelbord" donker>
        <div className="flex h-full w-full flex-col items-center justify-center">
          <span className="block h-[10%] w-1 bg-[#3A3B3F]" />
          <div className="w-[62%] overflow-hidden rounded-lg border-[3px] border-[#3A3B3F] shadow-[0_14px_30px_rgba(0,0,0,0.5)]" style={{ background: DONKER }}>
            <Beeld src={donker} className="w-full" stijl={{ aspectRatio: "4 / 3", objectFit: "cover" }} />
          </div>
        </div>
      </Kaart>
    </Rij>
  );
}

/** Advertentie: het vierkante beeld, het verhaal (staand) en het liggende beeld. */
export function AdMockups({ vierkant, verhaal, liggend, naam, label = "Zo ziet je advertentie eruit" }: { vierkant: string; verhaal: string; liggend: string; naam: string; label?: string }) {
  return (
    <Rij label={label}>
      <Kaart titel="Als bericht op je telefoon">
        <div className="flex h-[92%] w-[46%] flex-col overflow-hidden rounded-[1.3rem] border-[3px] border-[#2B2C2F] bg-white">
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <span className="h-4 w-4 flex-shrink-0 rounded-full bg-black/70" />
            <span className="truncate text-[0.6rem] font-semibold text-black/80">{naam}</span>
          </div>
          <Beeld src={vierkant} className="aspect-square w-full object-cover" />
          <div className="space-y-1.5 px-2 py-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-black/50" />
              <span className="h-2.5 w-2.5 rounded-full border border-black/50" />
            </div>
            {streep("w-[80%]")}
            {streep("w-[55%]")}
          </div>
        </div>
      </Kaart>

      <Kaart titel="Als verhaal" donker>
        <div className="relative h-[92%] overflow-hidden rounded-[1.3rem] border-[3px] border-[#3A3B3F]" style={{ aspectRatio: "9 / 16", background: DONKER }}>
          <Beeld src={verhaal} className="h-full w-full object-cover" />
          <span className="absolute left-[6%] right-[6%] top-[2.5%] block h-0.5 rounded-full bg-white/70" aria-hidden />
        </div>
      </Kaart>

      <Kaart titel="Liggend, op je website of als poster">
        <div className="w-[84%] rounded-sm bg-white p-[2.5%] shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
          <Beeld src={liggend} className="w-full" stijl={{ aspectRatio: "1200 / 628", objectFit: "cover" }} />
        </div>
      </Kaart>
    </Rij>
  );
}
