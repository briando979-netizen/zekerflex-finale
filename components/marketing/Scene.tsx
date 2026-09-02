// ---------------------------------------------------------------------------
// Art-directed brand scenes — editorial flat illustration, ZekerFlex palette.
// Used wherever the marketing site places a photo; a real photo dropped into
// /public/marketing (via /admin/studio or by hand) replaces the illustration.
//
// Shared visual language: layered depth (bg glow → environment → subject →
// foreground), a fine film grain, warm skin tones, deep green + mint accents.
// ---------------------------------------------------------------------------

const INK = "#0B100E";
const GREEN = "#0E5C4A";
const GREEN_D = "#0A3A2F";
const MINT = "#4FE0A0";
const PAPER = "#F5F2EA";
const SAND = "#E4DED0";
const WARM = "#E8935C";

/* A reusable grain + soft-shadow filter set. Each scene references by id. */
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-grain`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" result="g" />
        <feComposite in="g" in2="SourceGraphic" operator="over" />
      </filter>
      <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor="#17362B" />
        <stop offset="0.6" stopColor="#0E211B" />
        <stop offset="1" stopColor={INK} />
      </linearGradient>
      <linearGradient id={`${id}-day`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FBF8F1" />
        <stop offset="1" stopColor={SAND} />
      </linearGradient>
      <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={MINT} stopOpacity="0.5" />
        <stop offset="1" stopColor={MINT} stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** Detailed flat figure. `pose` tweaks the arms. */
function Person({
  x = 0,
  y = 0,
  scale = 1,
  skin = "#E6B78F",
  skinShade = "#C9905F",
  hair = "#2A211B",
  jacket = GREEN,
  jacketShade = GREEN_D,
  shirt = PAPER,
  pose = "stand",
}: {
  x?: number;
  y?: number;
  scale?: number;
  skin?: string;
  skinShade?: string;
  hair?: string;
  jacket?: string;
  jacketShade?: string;
  shirt?: string;
  pose?: "stand" | "phone" | "reach" | "hold" | "carry";
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* legs */}
      <path d="M-20 92 Q-24 150 -22 190 L-8 190 Q-6 140 -4 100 Z" fill="#2E3742" />
      <path d="M4 96 Q6 150 8 190 L22 190 Q22 148 20 92 Z" fill="#3A4550" />
      {/* shoes */}
      <path d="M-24 188 q-10 2 -10 8 q0 4 14 4 l12 0 0 -12 Z" fill={INK} />
      <path d="M8 188 q-2 12 6 12 l14 0 q4 0 4 -4 q0 -6 -10 -8 Z" fill={INK} />

      {/* torso / jacket */}
      <path
        d="M-30 22 Q-34 20 -34 40 L-30 96 Q0 104 30 96 L34 40 Q34 20 30 22 Q0 34 -30 22 Z"
        fill={jacket}
      />
      <path d="M-30 22 Q-14 30 0 30 L0 100 Q-18 100 -30 96 Z" fill={jacketShade} opacity="0.55" />
      {/* shirt collar */}
      <path d="M-12 24 L0 40 L12 24 L6 20 L0 30 L-6 20 Z" fill={shirt} />

      {/* arms by pose */}
      {pose === "phone" && (
        <>
          <path d="M26 34 Q42 46 34 74 L24 70 Q30 50 20 40 Z" fill={jacket} />
          <path d="M-26 34 Q-40 44 -30 68 L-18 82 L-8 74 L-18 62 Q-22 46 -18 38 Z" fill={jacket} />
          <circle cx="-14" cy="80" r="7" fill={skin} />
          <rect x="-24" y="66" width="18" height="30" rx="4" fill={INK} transform="rotate(-18 -15 81)" />
          <rect x="-22" y="69" width="14" height="22" rx="2" fill={MINT} transform="rotate(-18 -15 81)" opacity="0.85" />
        </>
      )}
      {pose === "reach" && (
        <>
          <path d="M26 32 Q54 22 66 8 L60 -2 Q46 8 24 22 Z" fill={jacket} />
          <circle cx="64" cy="4" r="7" fill={skin} />
          <path d="M-26 34 Q-40 48 -34 74 L-24 72 Q-28 50 -18 40 Z" fill={jacket} />
          <circle cx="-30" cy="74" r="7" fill={skin} />
        </>
      )}
      {pose === "hold" && (
        <>
          <path d="M24 34 Q40 42 40 60 L28 62 Q26 46 18 40 Z" fill={jacket} />
          <path d="M-24 34 Q-40 42 -40 60 L-28 62 Q-26 46 -18 40 Z" fill={jacket} />
          <circle cx="34" cy="62" r="6" fill={skin} />
          <circle cx="-34" cy="62" r="6" fill={skin} />
        </>
      )}
      {pose === "carry" && (
        <>
          <path d="M26 34 Q44 40 46 30 L44 20 Q30 26 20 34 Z" fill={jacket} />
          <path d="M-26 34 Q-44 40 -46 30 L-44 20 Q-30 26 -20 34 Z" fill={jacket} />
          <circle cx="44" cy="26" r="6" fill={skin} />
          <circle cx="-44" cy="26" r="6" fill={skin} />
        </>
      )}
      {pose === "stand" && (
        <>
          <path d="M28 34 Q40 52 34 88 L24 86 Q28 54 20 40 Z" fill={jacket} />
          <path d="M-28 34 Q-40 52 -34 88 L-24 86 Q-28 54 -20 40 Z" fill={jacketShade} opacity="0.8" />
          <circle cx="32" cy="88" r="6" fill={skin} />
          <circle cx="-32" cy="88" r="6" fill={skinShade} />
        </>
      )}

      {/* neck + head */}
      <rect x="-7" y="8" width="14" height="18" rx="5" fill={skinShade} />
      <circle cx="0" cy="-6" r="20" fill={skin} />
      <path d="M-18 -6 Q-6 6 8 2" stroke={skinShade} strokeWidth="2" fill="none" opacity="0.4" />
      {/* hair */}
      <path d="M-21 -8 Q-24 -34 0 -34 Q24 -34 21 -6 Q14 -20 0 -20 Q-8 -20 -14 -10 Q-18 -16 -21 -8 Z" fill={hair} />
      <path d="M-21 -8 Q-22 2 -16 8 Q-20 -2 -18 -12 Z" fill={hair} />
    </g>
  );
}

function Grain({ id }: { id: string }) {
  return <rect width="100%" height="100%" fill={`url(#${id}-grain)`} pointerEvents="none" />;
}

/* -------------------------------------------------------------- HERO: match */
export function SceneMatch() {
  const id = "sc-match";
  return (
    <svg viewBox="0 0 520 460" className="w-full" role="img" aria-label="Een freelancer wordt in enkele minuten gematcht aan een dienst">
      <Defs id={id} />
      <rect width="520" height="460" rx="24" fill={`url(#${id}-night)`} />
      <ellipse cx="360" cy="70" rx="260" ry="180" fill={`url(#${id}-sun)`} />
      <circle cx="70" cy="60" r="3" fill={MINT} opacity="0.6" />
      <circle cx="470" cy="120" r="2" fill={PAPER} opacity="0.4" />
      <circle cx="130" cy="40" r="2" fill={PAPER} opacity="0.3" />

      {/* city silhouette */}
      <g fill="#0C231C" opacity="0.9">
        <rect x="0" y="300" width="90" height="160" />
        <rect x="96" y="250" width="70" height="210" />
        <rect x="430" y="270" width="90" height="190" />
        <rect x="390" y="320" width="46" height="140" />
      </g>
      <g fill={WARM} opacity="0.5">
        <rect x="18" y="330" width="8" height="10" />
        <rect x="40" y="360" width="8" height="10" />
        <rect x="118" y="290" width="7" height="9" />
        <rect x="452" y="310" width="8" height="10" />
      </g>

      {/* ground */}
      <path d="M0 400 Q260 370 520 405 L520 460 L0 460 Z" fill="#0A1512" />

      {/* the sovereign box + match card */}
      <g transform="translate(360 250)">
        <rect x="-6" y="-2" width="150" height="120" rx="18" fill="#000" opacity="0.35" filter={`url(#${id}-soft)`} />
        <rect x="-78" y="-64" width="150" height="120" rx="18" fill="#0E1B17" stroke={MINT} strokeOpacity="0.45" />
        <circle cx="-56" cy="-42" r="5" fill={MINT} />
        <rect x="-42" y="-48" width="96" height="9" rx="4" fill={PAPER} opacity="0.22" />
        <rect x="-56" y="-24" width="110" height="7" rx="3" fill={PAPER} opacity="0.13" />
        <rect x="-56" y="-8" width="78" height="7" rx="3" fill={PAPER} opacity="0.13" />
        <g transform="translate(-56 14)">
          <circle cx="8" cy="8" r="8" fill={MINT} />
          <path d="M3 8 l4 4 l7 -8" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="26" y="12" fontFamily="ui-monospace, monospace" fontSize="12" fill={MINT}>match 0,94</text>
        </g>
      </g>

      {/* connection beam */}
      <path d="M170 300 C240 296 250 292 282 268" stroke={MINT} strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" fill="none" opacity="0.8" />

      {/* freelancer */}
      <g transform="translate(140 210)">
        <ellipse cx="0" cy="196" rx="72" ry="14" fill="#000" opacity="0.35" />
        <Person scale={1.55} skin="#E7B189" skinShade="#C98F60" hair={INK} jacket={MINT} jacketShade="#2F9F74" shirt={INK} pose="phone" />
      </g>

      {/* floating shift card */}
      <g transform="translate(56 54)">
        <rect x="4" y="6" width="164" height="78" rx="14" fill="#000" opacity="0.3" filter={`url(#${id}-soft)`} />
        <rect width="164" height="78" rx="14" fill={PAPER} />
        <rect x="16" y="16" width="96" height="10" rx="5" fill={INK} />
        <rect x="16" y="34" width="132" height="7" rx="3.5" fill={SAND} />
        <rect x="16" y="48" width="80" height="7" rx="3.5" fill={SAND} />
        <rect x="16" y="62" width="52" height="8" rx="4" fill={GREEN} />
        <circle cx="140" cy="22" r="9" fill={MINT} />
      </g>

      <Grain id={id} />
    </svg>
  );
}

/* --------------------------------------------------- FREELANCER at work */
export function SceneWork() {
  const id = "sc-work";
  return (
    <svg viewBox="0 0 520 400" className="w-full" role="img" aria-label="Een zelfstandige aan het werk op locatie">
      <Defs id={id} />
      <rect width="520" height="400" rx="24" fill={`url(#${id}-day)`} />
      {/* window light */}
      <path d="M300 -20 L520 60 L520 -20 Z" fill={MINT} opacity="0.12" />
      <path d="M340 -20 L520 120 L520 -20 Z" fill={WARM} opacity="0.08" />

      {/* shelving unit */}
      <g>
        <rect x="300" y="40" width="200" height="300" rx="6" fill={PAPER} />
        <rect x="300" y="40" width="200" height="300" rx="6" fill="none" stroke={SAND} strokeWidth="2" />
        {[92, 158, 224, 290].map((yy) => (
          <rect key={yy} x="306" y={yy} width="188" height="8" rx="2" fill={SAND} />
        ))}
        {[
          [320, 52, GREEN],
          [356, 52, MINT],
          [392, 52, WARM],
          [430, 52, GREEN],
          [320, 118, WARM],
          [366, 118, GREEN],
          [430, 118, MINT],
          [320, 184, MINT],
          [372, 184, WARM],
          [430, 184, GREEN],
        ].map(([xx, yy, c], i) => (
          <rect key={i} x={xx as number} y={yy as number} width="30" height="30" rx="4" fill={c as string} opacity="0.9" />
        ))}
        <rect x="392" y="184" width="30" height="30" rx="4" fill={GREEN_D} opacity="0.15" />
      </g>

      {/* trolley */}
      <g transform="translate(120 300)">
        <rect x="-50" y="-40" width="90" height="54" rx="6" fill={SAND} />
        <rect x="-46" y="-52" width="16" height="16" rx="3" fill={WARM} />
        <rect x="-26" y="-52" width="16" height="16" rx="3" fill={GREEN} />
        <circle cx="-40" cy="20" r="9" fill={INK} />
        <circle cx="26" cy="20" r="9" fill={INK} />
      </g>

      {/* worker reaching for a shelf */}
      <g transform="translate(210 150)">
        <ellipse cx="0" cy="180" rx="66" ry="12" fill="#000" opacity="0.12" />
        <Person
          scale={1.5}
          skin="#C98F60"
          skinShade="#A06A42"
          hair={INK}
          jacket={WARM}
          jacketShade="#B96A3C"
          shirt={PAPER}
          pose="reach"
        />
        {/* apron */}
        <path d="M-22 40 Q0 46 22 40 L20 92 Q0 100 -20 92 Z" fill={GREEN} opacity="0.9" />
      </g>

      {/* floor */}
      <rect x="0" y="340" width="520" height="60" fill={SAND} opacity="0.6" />
      <Grain id={id} />
    </svg>
  );
}

/* ------------------------------------------------------ EMPLOYER approve */
export function SceneApprove() {
  const id = "sc-appr";
  return (
    <svg viewBox="0 0 520 400" className="w-full" role="img" aria-label="Een vestigingsmanager keurt de uren goed op een tablet">
      <Defs id={id} />
      <rect width="520" height="400" rx="24" fill={`url(#${id}-day)`} />
      <ellipse cx="120" cy="70" rx="200" ry="140" fill={`url(#${id}-sun)`} opacity="0.5" />

      {/* wall panelling / counter */}
      <rect x="0" y="300" width="520" height="100" fill={PAPER} />
      <rect x="0" y="296" width="520" height="6" fill={SAND} />

      {/* approval UI panel */}
      <g transform="translate(280 44)">
        <rect x="8" y="10" width="210" height="270" rx="18" fill="#000" opacity="0.18" filter={`url(#${id}-soft)`} />
        <rect width="210" height="270" rx="18" fill={INK} />
        <rect x="20" y="22" width="120" height="11" rx="5.5" fill={PAPER} opacity="0.9" />
        <rect x="20" y="40" width="70" height="8" rx="4" fill={MINT} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(20 ${66 + i * 46})`}>
            <rect width="170" height="36" rx="9" fill={PAPER} opacity="0.07" />
            <circle cx="22" cy="18" r="10" fill={i < 3 ? MINT : "#2C3A34"} />
            {i < 3 && (
              <path d="M17 18 l4 4 l7 -8" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <rect x="42" y="9" width="86" height="7" rx="3.5" fill={PAPER} opacity="0.5" />
            <rect x="42" y="21" width="52" height="6" rx="3" fill={PAPER} opacity="0.3" />
          </g>
        ))}
      </g>

      {/* manager with tablet */}
      <g transform="translate(150 130)">
        <ellipse cx="0" cy="176" rx="72" ry="13" fill="#000" opacity="0.12" />
        <Person
          scale={1.55}
          skin="#8A5A3C"
          skinShade="#6B4229"
          hair="#171310"
          jacket="#2E3742"
          jacketShade="#20262D"
          shirt={PAPER}
          pose="hold"
        />
        {/* tablet */}
        <g transform="translate(-4 66)">
          <rect x="-34" y="-6" width="70" height="48" rx="6" fill={PAPER} />
          <rect x="-28" y="1" width="42" height="6" rx="3" fill={SAND} />
          <rect x="-28" y="13" width="56" height="5" rx="2.5" fill={SAND} />
          <rect x="-28" y="24" width="30" height="10" rx="5" fill={GREEN} />
          <circle cx="24" cy="29" r="6" fill={MINT} />
        </g>
      </g>

      <Grain id={id} />
    </svg>
  );
}

/* --------------------------------------------------------- TEAM shift */
export function SceneTeam() {
  const id = "sc-team";
  return (
    <svg viewBox="0 0 560 320" className="w-full" role="img" aria-label="Een team flexwerkers tijdens een drukke dienst">
      <Defs id={id} />
      <rect width="560" height="320" rx="24" fill={`url(#${id}-night)`} />
      <ellipse cx="280" cy="40" rx="320" ry="160" fill={`url(#${id}-sun)`} opacity="0.4" />

      {/* back wall + racking */}
      <g stroke="#1C3A30" strokeWidth="5" opacity="0.8">
        <line x1="40" y1="40" x2="520" y2="40" />
        <line x1="40" y1="40" x2="40" y2="250" />
        <line x1="520" y1="40" x2="520" y2="250" />
        <line x1="180" y1="40" x2="180" y2="250" />
        <line x1="360" y1="40" x2="360" y2="250" />
      </g>
      {[70, 130, 190].map((yy) =>
        [60, 200, 380].map((xx) => (
          <rect key={`${xx}-${yy}`} x={xx} y={yy} width="26" height="26" rx="4" fill={(xx + yy) % 60 ? GREEN : MINT} opacity="0.55" />
        )),
      )}

      <path d="M0 250 Q280 224 560 252 L560 320 L0 320 Z" fill="#0A1512" />

      {/* three colleagues */}
      <g transform="translate(130 90)">
        <ellipse cx="0" cy="170" rx="58" ry="11" fill="#000" opacity="0.3" />
        <Person scale={1.3} skin="#E7B189" skinShade="#C98F60" hair="#241C16" jacket={WARM} jacketShade="#B96A3C" shirt={INK} pose="carry" />
      </g>
      <g transform="translate(285 78)">
        <ellipse cx="0" cy="178" rx="62" ry="12" fill="#000" opacity="0.3" />
        <Person scale={1.42} skin="#C98F60" skinShade="#A06A42" hair={INK} jacket={MINT} jacketShade="#2F9F74" shirt={INK} pose="stand" />
      </g>
      <g transform="translate(430 92)">
        <ellipse cx="0" cy="168" rx="56" ry="11" fill="#000" opacity="0.3" />
        <Person scale={1.28} skin="#8A5A3C" skinShade="#6B4229" hair="#171310" jacket={GREEN} jacketShade={GREEN_D} shirt={PAPER} pose="reach" />
      </g>

      <Grain id={id} />
    </svg>
  );
}
