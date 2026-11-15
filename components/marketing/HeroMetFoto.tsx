import Image from "next/image";
import type { ReactNode } from "react";
import { fotoPad, type Foto } from "@/lib/marketing/fotos";

// De kop van een openbare pagina met een echte foto ernaast (15 nov 2026, eigenaar: "elke pagina strak met echte foto's"):
// links de tekst en knoppen, rechts een foto uit onze eigen fotobibliotheek (lib/marketing/fotos.ts, bron en licentie in
// public/marketing/foto/CREDITS.md). Zonder foto blijft het de oude kop. Servercomponent, geen scripts.
export function HeroMetFoto({ foto, children }: { foto: Foto | undefined; children: ReactNode }) {
  if (!foto) return <>{children}</>;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
      <div>{children}</div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5">
        <Image src={fotoPad(foto)} alt={foto.alt} fill priority sizes="(max-width: 1024px) 100vw, 480px" className={`object-cover ${foto.staand ? "object-[50%_25%]" : ""}`} />
      </div>
    </div>
  );
}

/** Alleen de foto, voor een kop op een donkere achtergrond waar de tekst al in een eigen kolom staat. Zonder foto komt er niets. */
export function FotoKolom({ foto, className = "" }: { foto: Foto | undefined; className?: string }) {
  if (!foto) return null;
  return (
    <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 ${className}`}>
      <Image src={fotoPad(foto)} alt={foto.alt} fill priority sizes="(max-width: 1024px) 100vw, 480px" className={`object-cover ${foto.staand ? "object-[50%_25%]" : ""}`} />
    </div>
  );
}
