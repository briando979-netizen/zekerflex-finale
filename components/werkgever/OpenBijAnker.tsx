"use client";

import { useEffect } from "react";

// Een <details> gaat niet vanzelf open als de link ernaartoe een anker heeft: wie uit het
// hulpcentrum op "/werkgever/facturen#factuurgegevens" komt, zag alleen de dichte regel.
// Dit onderdeel klapt het blok open als het anker in het adres een van `ankers` is en
// schuift daarna naar het bedoelde deel (in een dicht blok kan de browser daar niet heen).
// Het toont zelf niets en verandert niets aan opslaan.
export function OpenBijAnker({ blokId, ankers }: { blokId: string; ankers: string[] }) {
  const sleutel = ankers.join("|");

  useEffect(() => {
    const lijst = sleutel.split("|");
    const kijk = () => {
      const anker = window.location.hash.replace(/^#/, "");
      if (!anker || !lijst.includes(anker)) return;
      const blok = document.getElementById(blokId);
      if (!(blok instanceof HTMLDetailsElement)) return;
      blok.open = true;
      const doel = document.getElementById(anker);
      if (doel) doel.scrollIntoView({ block: "start" });
    };
    kijk();
    window.addEventListener("hashchange", kijk);
    return () => {
      window.removeEventListener("hashchange", kijk);
    };
  }, [blokId, sleutel]);

  return null;
}
