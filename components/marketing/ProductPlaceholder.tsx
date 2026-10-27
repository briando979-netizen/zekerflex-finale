import type { ReactElement, SVGProps } from "react";
import { LogoGlyph } from "@/components/brand/Logo";

// Line-art garment/PBM glyph shown when a shop product has no photo yet, so the
// catalog stays readable (a trui looks like a trui) before real photos are
// uploaded. Classifies on name + slug + category keywords; anything we can't
// place falls back to the brand LogoGlyph, so no product ever regresses.

type GlyphKey =
  | "sweater"
  | "jacket"
  | "trousers"
  | "shirt"
  | "shoe"
  | "glove"
  | "helmet"
  | "vest"
  | "book"
  | "bag"
  | "bottle"
  | "hat";

// Order matters: the first matching rule wins, so put the more specific
// garments (colbert/blazer, bodywarmer) before the broader ones.
const RULES: ReadonlyArray<readonly [RegExp, GlyphKey]> = [
  [/colbert|blazer|softshell|werkjas|parka|mantel|\bjas\b|jasje|jacket|coat/, "jacket"],
  [/bodywarmer|hesje|gilet/, "vest"],
  [/pantalon|broek|trouser|jeans|chino|legging/, "trousers"],
  [/overhemd|blouse|t-?shirt|polo|\bshirt\b/, "shirt"],
  [/coltrui|trui|sweater|hoodie|pullover|gebreid|\bvest\b/, "sweater"], // NL "vest" = vest/cardigan → sweater silhouette
  [/schoen|sneaker|\bboot\b|laars|\bshoe\b/, "shoe"],
  [/handschoen|\bglove\b/, "glove"],
  [/\bhelm\b|helmet|hoofdbescherming/, "helmet"],
  [/\bboek\b|lesboek|\bbook\b|\bvca\b/, "book"],
  [/\btas\b|tasje|rugzak|\bbag\b/, "bag"],
  [/\bfles\b|drinkfles|bidon|\bbottle\b/, "bottle"],
  [/\bmuts\b|beanie|\bcap\b|\bpet\b|\bhat\b/, "hat"],
];

export function classifyProductGlyph(...hints: Array<string | null | undefined>): GlyphKey | null {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  for (const [re, key] of RULES) if (re.test(text)) return key;
  return null;
}

const stroke = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

const GLYPHS: Record<GlyphKey, (p: SVGProps<SVGSVGElement>) => ReactElement> = {
  sweater: (p) => (
    <svg {...stroke(p)}>
      <path d="M9 3c0 2 6 2 6 0l4 2-2 8-2-1v9H9v-9l-2 1-2-8z" />
      <path d="M9 19h6" />
    </svg>
  ),
  jacket: (p) => (
    <svg {...stroke(p)}>
      <path d="M8 3 4 5l2 7 2-.7V21h8v-9.7l2 .7 2-7-4-2-4 3z" />
      <path d="M12 6v15" />
    </svg>
  ),
  trousers: (p) => (
    <svg {...stroke(p)}>
      <path d="M7 3h10l-1 18h-3l-1-11-1 11H8z" />
      <path d="M7 5h10" />
    </svg>
  ),
  shirt: (p) => (
    <svg {...stroke(p)}>
      <path d="M8.5 3 4 6l2 3.5 2-1V21h8V8.5l2 1L20 6l-4.5-3a3.5 3.5 0 0 1-7 0z" />
      <path d="M9.5 3.2 12 6l2.5-2.8M12 6v13" />
    </svg>
  ),
  shoe: (p) => (
    <svg {...stroke(p)}>
      <path d="M3 16c0-3 3-3 5-2l7 2c3 0 6 0 6 2v1H3z" />
      <path d="M8 14l1 2M11 15l1 2" />
    </svg>
  ),
  glove: (p) => (
    <svg {...stroke(p)}>
      <path d="M7 21V10a5 5 0 0 1 10 0v2l2-1a1.6 1.6 0 0 1 1 2.6L17 15v6z" />
      <path d="M10 10V7M13 10V6.5M16 11V9" />
    </svg>
  ),
  helmet: (p) => (
    <svg {...stroke(p)}>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M2.5 15h19" />
      <path d="M12 7v8M8 8l1 7M16 8l-1 7" />
    </svg>
  ),
  vest: (p) => (
    <svg {...stroke(p)}>
      <path d="M9 3l3 3 3-3 2 1v17H7V4z" />
      <path d="M12 6v15" />
    </svg>
  ),
  book: (p) => (
    <svg {...stroke(p)}>
      <path d="M5 4h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 4v17" />
    </svg>
  ),
  bag: (p) => (
    <svg {...stroke(p)}>
      <path d="M6 8h12l1 12H5z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  ),
  bottle: (p) => (
    <svg {...stroke(p)}>
      <path d="M10 2h4v3l1 2v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7l1-2z" />
      <path d="M9 11h6" />
    </svg>
  ),
  hat: (p) => (
    <svg {...stroke(p)}>
      <path d="M5 15a7 7 0 0 1 14 0z" />
      <path d="M4 15h16v3H4z" />
    </svg>
  ),
};

export function ProductPlaceholder({
  name,
  slug,
  category,
  glyphSize = 72,
  className,
}: {
  name?: string | null | undefined;
  slug?: string | null | undefined;
  category?: string | null | undefined;
  /** px size for the glyph (and the LogoGlyph fallback) */
  glyphSize?: number;
  /** when set, replaces the default muted text colour (e.g. admin theme var) */
  className?: string;
}) {
  const key = classifyProductGlyph(name, slug, category);
  const Glyph = key ? GLYPHS[key] : null;
  return (
    <div className={`grid h-full w-full place-items-center ${className ?? "text-neutralx-300"}`}>
      {Glyph ? <Glyph width={glyphSize} height={glyphSize} /> : <LogoGlyph size={glyphSize} tone="dark" />}
    </div>
  );
}
