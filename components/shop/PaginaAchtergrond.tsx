import { achtergrondVoor } from "@/lib/ontwerp/achtergrond";
import type { AchtergrondPagina } from "@/lib/ontwerp/achtergrond-core";
import { AchtergrondVideo } from "@/components/shop/AchtergrondVideo";

// Het achtergrondbeeld dat de eigenaar in Beheer → Webshop koos, als strook
// bovenaan de pagina. Een vaste hoogte (geen verspringen) en geen keuze betekent
// dat er niets wordt getekend: de pagina blijft precies zoals hij was.
export async function PaginaAchtergrond({ pagina }: { pagina: AchtergrondPagina }) {
  const w = await achtergrondVoor(pagina);
  if (!w) return null;
  const vorm = "relative h-44 w-full overflow-hidden bg-[#0C0E12] sm:h-60 lg:h-72";
  const vervaag = { WebkitMaskImage: "linear-gradient(to bottom, #000 70%, transparent)", maskImage: "linear-gradient(to bottom, #000 70%, transparent)" };
  return (
    <div aria-hidden={w.soort === "video" ? true : undefined} className={vorm} style={vervaag} data-pagina-achtergrond={pagina}>
      {w.soort === "foto" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.src} alt={w.alt} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <AchtergrondVideo src={w.src} poster={w.poster} />
      )}
    </div>
  );
}
