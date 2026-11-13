"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { doelIndex } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Verslepen in de Site-ontwerper: pak een rij bij zijn greep (⠿) en sleep hem naar een andere plek, met de muis of met je
// vinger. Met het toetsenbord: zet de focus op de greep en gebruik de pijltjestoetsen. De pijlknoppen ernaast blijven bestaan.
//
// Gebruik: geef de lijst (<ol>/<ul>) `{...sleep.lijst}`, elke versleepbare rij (direct kind van de lijst) `data-sleep-rij`,
// en zet in die rij een <SleepGreep />. Een rij zonder `data-sleep-rij` (een vaste regel) doet niet mee.
// De rekenregels staan in lib/ontwerp/sleep.ts.
// ---------------------------------------------------------------------------

type Richting = "verticaal" | "horizontaal";

export function useSleep(onVerplaats: (van: number, naar: number) => void, richting: Richting = "verticaal") {
  const lijst = useRef<HTMLElement | null>(null);
  const bezig = useRef<{ van: number; doel: number } | null>(null);

  const rijen = (): HTMLElement[] => [...(lijst.current?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-sleep-rij"));

  /** De rij en de plek van de greep waarop iets gebeurde, of null als het niet een greep van DEZE lijst is (een lijst in een lijst). */
  const vind = (doel: EventTarget | null): { index: number } | null => {
    if (!(doel instanceof Element)) return null;
    const greep = doel.closest("[data-sleep-greep]");
    const rij = greep?.closest("[data-sleep-rij]");
    if (!greep || !rij || rij.parentElement !== lijst.current) return null;
    const index = rijen().indexOf(rij as HTMLElement);
    return index < 0 ? null : { index };
  };

  const wisMarkering = () => {
    for (const r of rijen()) {
      r.style.boxShadow = "";
      r.style.opacity = "";
    }
  };

  const markeer = (van: number, doel: number) => {
    const alle = rijen();
    alle.forEach((r, i) => {
      r.style.opacity = i === van ? "0.6" : "";
      r.style.boxShadow = "";
    });
    const rij = alle[doel];
    if (!rij || doel === van) return;
    const streep = "3px";
    // de streep staat aan de kant waar de rij tussenkomt
    rij.style.boxShadow =
      richting === "verticaal"
        ? `0 ${doel < van ? "-" : ""}${streep} 0 0 var(--a-accent)`
        : `${doel < van ? "-" : ""}${streep} 0 0 0 var(--a-accent)`;
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const gevonden = vind(e.target);
    if (!gevonden) return;
    e.preventDefault();
    (e.target as Element).closest("[data-sleep-greep]")?.setPointerCapture?.(e.pointerId);
    bezig.current = { van: gevonden.index, doel: gevonden.index };
    markeer(gevonden.index, gevonden.index);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const b = bezig.current;
    if (!b) return;
    const middens = rijen().map((r) => {
      const k = r.getBoundingClientRect();
      return richting === "verticaal" ? k.top + k.height / 2 : k.left + k.width / 2;
    });
    const doel = doelIndex(middens, richting === "verticaal" ? e.clientY : e.clientX, b.van);
    if (doel !== b.doel) {
      b.doel = doel;
      markeer(b.van, doel);
    }
  };

  const klaar = (uitvoeren: boolean) => {
    const b = bezig.current;
    bezig.current = null;
    wisMarkering();
    if (b && uitvoeren && b.doel !== b.van) onVerplaats(b.van, b.doel);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const terug = richting === "verticaal" ? "ArrowUp" : "ArrowLeft";
    const verder = richting === "verticaal" ? "ArrowDown" : "ArrowRight";
    if (e.key !== terug && e.key !== verder) return;
    const gevonden = vind(e.target);
    if (!gevonden) return;
    const naar = gevonden.index + (e.key === terug ? -1 : 1);
    if (naar < 0 || naar >= rijen().length) return;
    e.preventDefault();
    onVerplaats(gevonden.index, naar);
    // na het hertekenen de focus terug op de greep van dezelfde rij, zodat je kunt doorlopen met de pijltjes
    requestAnimationFrame(() => rijen()[naar]?.querySelector<HTMLElement>("[data-sleep-greep]")?.focus());
  };

  return {
    lijst: {
      ref: (el: HTMLElement | null) => {
        lijst.current = el;
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: () => klaar(true),
      onPointerCancel: () => klaar(false),
      onKeyDown,
    },
  };
}

/** De greep van een versleepbare rij. `naam` is wat er versleept wordt (voor schermlezers). */
export function SleepGreep({ naam, horizontaal = false }: { naam: string; horizontaal?: boolean }) {
  return (
    <button
      type="button"
      data-sleep-greep
      aria-label={`${naam} verslepen (of gebruik de pijltjestoetsen)`}
      title="Sleep om te verplaatsen"
      className="grid h-7 w-7 flex-shrink-0 cursor-grab place-items-center rounded-md text-sm active:cursor-grabbing"
      style={{ touchAction: "none", background: "var(--a-elev)", color: "var(--a-mute)" }}
    >
      <span aria-hidden>{horizontaal ? "⋯" : "⠿"}</span>
    </button>
  );
}
