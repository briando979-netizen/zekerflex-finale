"use client";

import { useEffect, useRef, useState } from "react";
import { heeftWebGL, maakPaskamer3D, type Paskamer3D, type Stand3D } from "@/components/marketing/paskamer/paskamer3d";

// De 3D-paspop in het paskamerscherm. Laadt three.js en het model pas als dit
// onderdeel verschijnt (dynamic import in Paskamer.tsx); zonder WebGL of bij een
// fout meldt het dat via onFout, en toont de pagina de tekening.

export type Paspop3DHandle = Paskamer3D;

export function Paspop3D({ stand, label, onKlaar, onFout, handle }: { stand: Stand3D; label: string; onKlaar?: () => void; onFout?: () => void; handle?: { current: Paspop3DHandle | null } }) {
  const houder = useRef<HTMLDivElement | null>(null);
  const scene = useRef<Paskamer3D | null>(null);
  const laatste = useRef(stand);
  const [klaar, setKlaar] = useState(false);
  laatste.current = stand;

  useEffect(() => {
    const el = houder.current;
    if (!el) return;
    if (!heeftWebGL()) {
      onFout?.();
      return;
    }
    let weg = false;
    maakPaskamer3D(el)
      .then(async (p) => {
        if (weg) return p.stop();
        scene.current = p;
        if (handle) handle.current = p;
        await p.zet(laatste.current);
        setKlaar(true);
        onKlaar?.();
      })
      .catch(() => !weg && onFout?.());
    return () => {
      weg = true;
      scene.current?.stop();
      scene.current = null;
      if (handle) handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het tonen
  }, []);

  // elke wijziging (kleding, maat, foto) past de bestaande scène aan
  const sleutel = JSON.stringify(stand);
  useEffect(() => {
    void scene.current?.zet(stand);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sleutel dekt stand
  }, [sleutel]);

  return (
    <div className="relative h-full w-full" role="img" aria-label={label}>
      <div ref={houder} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {!klaar && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] font-semibold text-neutralx-500">…</div>}
    </div>
  );
}
