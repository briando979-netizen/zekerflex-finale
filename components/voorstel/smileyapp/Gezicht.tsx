import { gezichtKleur, mondPad } from "@/lib/voorstel/smileyapp-gezicht";

// Een smiley als vaste tekening (server): ring, twee ogen en een mond die
// lacht of fronst naar de score (lib/voorstel/smileyapp-gezicht.ts). Zonder
// `titel` is hij versiering en dus verborgen voor schermlezers.

export function Gezicht({
  score = 10,
  kleur,
  className = "",
  titel,
  knipoog = false,
  vulling = "none",
  accent,
}: {
  score?: number;
  kleur?: string;
  className?: string;
  titel?: string;
  /** de ogen knipperen af en toe (niet bij "minder beweging") */
  knipoog?: boolean;
  vulling?: string;
  /** andere kleur voor ogen en mond, zoals het logo: groene ring, geel gezicht */
  accent?: string;
}) {
  const k = kleur ?? gezichtKleur(score);
  const a = accent ?? k;
  const oog = `sm-oog${knipoog ? " sm-knipoog" : ""}`;
  return (
    <svg viewBox="0 0 100 100" className={className} role={titel ? "img" : undefined} aria-label={titel} aria-hidden={titel ? undefined : true}>
      <circle cx="50" cy="50" r="41" fill={vulling} stroke={k} strokeWidth="8" />
      <circle className={oog} cx="36" cy="40" r="5.5" fill={a} />
      <circle className={oog} cx="64" cy="40" r="5.5" fill={a} />
      <path className="sm-mond" d={mondPad(score)} fill="none" stroke={a} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
