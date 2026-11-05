import type { Ref } from "react";
import { maten, type Lichaam } from "@/lib/shop/paskamer";
import { DOEK, scene, tint, type Gedragen, type Vorm } from "@/lib/shop/paspop-figuur";

// De paspop als SVG. Geen hooks en geen "use client": de paskamer tekent hem
// live, de shop-homepage zet er een vaste look mee neer zonder JavaScript.
// Een eigen gezichtsfoto (data-URL, alleen in de browser) komt met een zachte
// rand in het ovaal van het hoofd; zonder foto is het hoofd een paspophoofd.

export function Paspop({
  lichaam,
  huid,
  gezicht = null,
  stukken,
  label,
  id = "pp",
  className,
  achtergrond = true,
  svgRef,
}: {
  lichaam: Lichaam;
  huid: string;
  gezicht?: string | null;
  stukken: Gedragen[];
  /** wat een schermlezer hoort ("Paspop met …") */
  label: string;
  /** voorvoegsel voor de verlopen en maskers (uniek per paspop op een pagina) */
  id?: string;
  className?: string;
  achtergrond?: boolean;
  svgRef?: Ref<SVGSVGElement>;
}) {
  const sc = scene(lichaam, maten(lichaam), huid, stukken);
  const h = sc.figuur.hoofd;
  const ref = (naam: string) => `url(#${id}-${naam})`;
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${DOEK.w} ${DOEK.h}`} role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id={`${id}-stof`} gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="360" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0.05" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.36" r="0.78">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7e2d7" />
        </radialGradient>
        <radialGradient id={`${id}-hoofd`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor={tint(huid, 1.12)} />
          <stop offset="1" stopColor={tint(huid, 0.82)} />
        </radialGradient>
        <radialGradient id={`${id}-veer`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.82" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-gezicht`} maskContentUnits="userSpaceOnUse">
          <ellipse cx={h.cx} cy={h.cy} rx={h.rx * 1.02} ry={h.ry * 1.02} fill={ref("veer")} />
        </mask>
        <filter id={`${id}-vloer`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {achtergrond && <rect width={DOEK.w} height={DOEK.h} fill={ref("bg")} />}
      <ellipse cx={sc.vloer.cx} cy={sc.vloer.cy} rx={sc.vloer.rx} ry={sc.vloer.ry} fill="#000" opacity="0.16" filter={ref("vloer")} />
      {sc.lagen.map((v, i) => (
        <VormPad key={i} v={v} stof={ref("stof")} />
      ))}
      <ellipse cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={ref("hoofd")} />
      {gezicht && (
        <image
          href={gezicht}
          x={h.cx - h.rx * 1.02}
          y={h.cy - h.ry * 1.02}
          width={h.rx * 2.04}
          height={h.ry * 2.04}
          preserveAspectRatio="xMidYMid slice"
          mask={ref("gezicht")}
        />
      )}
      {sc.opHoofd.map((v, i) => (
        <VormPad key={`h${i}`} v={v} stof={ref("stof")} />
      ))}
    </svg>
  );
}

function VormPad({ v, stof }: { v: Vorm; stof: string }) {
  return (
    <>
      <path
        d={v.d}
        fill={v.fill}
        {...(v.opacity !== undefined ? { opacity: v.opacity } : {})}
        {...(v.stroke ? { stroke: v.stroke, strokeWidth: v.sw ?? 1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const } : {})}
        {...(v.dash ? { strokeDasharray: v.dash } : {})}
      />
      {v.schaduw && <path d={v.d} fill={stof} />}
    </>
  );
}
