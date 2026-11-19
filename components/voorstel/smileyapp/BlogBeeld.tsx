import Image from "next/image";
import type { Bericht } from "@/lib/voorstel/smileyapp-blog-regels";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// Het beeld boven een blogbericht (server). De vier berichten van smileyapp.nl
// hebben hun eigen foto; een bericht dat het team zelf schreef heeft er geen
// en krijgt een vlak in de kleuren van SmileyApp met een smiley.

export function BlogBeeld({ beeld, className = "", sizes, priority = false }: { beeld: Bericht["beeld"]; className?: string; sizes: string; priority?: boolean }) {
  if (beeld) return <Image src={beeld.src} alt="" width={beeld.breed} height={beeld.hoog} priority={priority} sizes={sizes} className={`object-cover ${className}`} />;
  return (
    <div aria-hidden="true" className={`relative grid place-items-center overflow-hidden bg-smiley-green ${className}`}>
      <span className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-smiley-sun/60" />
      <span className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-smiley-ink/15" />
      <Gezicht score={10} kleur="#0E2A20" className="relative h-1/2 w-auto" />
    </div>
  );
}
