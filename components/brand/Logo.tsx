import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// ZekerFlex brand mark — a squircle with a bold, forward-leaning "ZF" ligature.
// One source of truth; also mirrored in app/icon.svg for the favicon.
//   tone="dark"  → black squircle, white ZF   (default; use on light surfaces)
//   tone="light" → white squircle, black ZF   (use on dark surfaces)
//   tone="bare"  → no squircle, currentColor ZF
// ---------------------------------------------------------------------------

type Tone = "dark" | "light" | "bare";

const INK = "#0C0E12";
const PAPER = "#FAFAF8";

function palette(tone: Tone): { bg: string | null; fg: string } {
  if (tone === "light") return { bg: PAPER, fg: INK };
  if (tone === "bare") return { bg: null, fg: "currentColor" };
  return { bg: INK, fg: PAPER };
}

export function LogoGlyph({
  size = 32,
  tone = "dark",
  rounded = true,
  className,
  style,
}: {
  size?: number;
  tone?: Tone;
  rounded?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { bg, fg } = palette(tone);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="ZekerFlex"
      className={className}
      style={style}
    >
      {bg && (
        <rect x="8" y="8" width="496" height="496" rx={rounded ? 116 : 28} fill={bg} />
      )}
      <g
        transform="matrix(1,0,-0.1228,1,31,0)"
        fill="none"
        stroke={fg}
        strokeWidth="46"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        {/* Z */}
        <path d="M104 150 H250 L104 372 H262" />
        {/* F — stem rises out of the Z's tail, two arms reach right */}
        <path d="M300 372 V150 H424 M300 258 H396" />
      </g>
    </svg>
  );
}

export function Wordmark({
  size = 32,
  tone = "dark",
  invert = false,
  className,
}: {
  size?: number;
  tone?: Tone;
  invert?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoGlyph size={size} tone={tone} />
      <span
        className={`font-display font-bold tracking-tight ${invert ? "text-white" : "text-ink"}`}
        style={{ fontSize: size * 0.6 }}
      >
        ZekerFlex
      </span>
    </span>
  );
}
