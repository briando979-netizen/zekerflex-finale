import { winterActief } from "@/lib/thema/winter";

// ---------------------------------------------------------------------------
// Zachte sneeuw in de kopbalk tijdens de winterperiode (lib/thema/winter.ts),
// zoals de app van YoungOnes (eigenaar, 25 nov 2026). Puur decoratief:
// aria-hidden, geen tekst, en uit bij prefers-reduced-motion (app/globals.css).
// De vlokken staan vast (geen willekeur), anders rendert de server iets anders
// dan de browser en valt de pagina om met hydratiefout #418.
// De ouder moet `relative` en een vaste hoogte hebben; de vlokken vallen 90px.
// ---------------------------------------------------------------------------

const VLOKKEN: readonly { links: string; maat: number; duur: string; start: string }[] = [
  { links: "4%", maat: 3, duur: "7s", start: "-1s" },
  { links: "13%", maat: 2, duur: "9s", start: "-5s" },
  { links: "22%", maat: 4, duur: "6s", start: "-3s" },
  { links: "31%", maat: 2, duur: "8s", start: "0s" },
  { links: "42%", maat: 3, duur: "7.5s", start: "-6s" },
  { links: "53%", maat: 2, duur: "9.5s", start: "-2s" },
  { links: "63%", maat: 4, duur: "6.5s", start: "-4s" },
  { links: "72%", maat: 2, duur: "8.5s", start: "-7s" },
  { links: "82%", maat: 3, duur: "7s", start: "-2.5s" },
  { links: "91%", maat: 2, duur: "9s", start: "-5.5s" },
  { links: "97%", maat: 3, duur: "6.8s", start: "-1.5s" },
];

export function WinterSneeuw() {
  if (!winterActief()) return null;
  return (
    <span aria-hidden className="zf-sneeuw pointer-events-none absolute inset-0 overflow-hidden">
      {VLOKKEN.map((v, i) => (
        <span
          key={i}
          className="zf-vlok"
          style={{ left: v.links, width: v.maat, height: v.maat, animationDuration: v.duur, animationDelay: v.start }}
        />
      ))}
    </span>
  );
}
