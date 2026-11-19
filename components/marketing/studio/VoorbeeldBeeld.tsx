"use client";

import { useEffect, useState } from "react";

// Een beeld van de beeldroute (voorbeeld met watermerk, of een voorbeeld van een verzonnen merk) dat nooit als kapot
// plaatje blijft staan. Lukt het laden niet (de server is even druk: 503 of 429), dan probeert het scherm het tot drie
// keer opnieuw, met een steeds langere pauze. Daarna staat er een nette tegel met een knop. De poging staat als extra
// stukje in het adres (`_p`), zodat de browser echt opnieuw vraagt; de server negeert het en bewaart het beeld onder
// dezelfde sleutel. Het vak eromheen heeft een vaste verhouding: er verspringt niets.

const PAUZES = [900, 2200, 5000];
const geenMenu = (e: React.SyntheticEvent) => e.preventDefault();

export function VoorbeeldBeeld({ src, alt, width, height, className = "", stil = false, style }: { src: string; alt: string; width?: number; height?: number; className?: string; /** bij een schets: geen tegel, het vak blijft dan gewoon leeg */ stil?: boolean; style?: React.CSSProperties }) {
  const [poging, setPoging] = useState(0);
  const [wacht, setWacht] = useState(false);
  const [mislukt, setMislukt] = useState(false);

  // een ander beeld (ander logo, andere ondergrond): opnieuw beginnen
  useEffect(() => {
    setPoging(0);
    setWacht(false);
    setMislukt(false);
  }, [src]);

  useEffect(() => {
    if (!wacht) return;
    const klok = setTimeout(() => {
      setWacht(false);
      setPoging((p) => p + 1);
    }, PAUZES[poging] ?? 5000);
    return () => clearTimeout(klok);
  }, [wacht, poging]);

  function fout() {
    if (poging < PAUZES.length) setWacht(true);
    else setMislukt(true);
  }

  if (mislukt) {
    if (stil) return null;
    return (
      <span role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutralx-100 p-3 text-center text-xs leading-snug text-neutralx-600">
        Voorbeeld laden lukt even niet.
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMislukt(false);
            setPoging((p) => p + 1);
          }}
          className="rounded-full border border-hairstrong bg-white px-3 py-1 text-xs font-semibold text-ink"
        >
          Probeer opnieuw
        </button>
      </span>
    );
  }
  if (wacht) return null;
  const adres = poging === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}_p=${poging}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={adres} alt={alt} width={width} height={height} draggable={false} onContextMenu={geenMenu} onDragStart={geenMenu} onError={fout} className={className} style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", ...style }} />
  );
}
