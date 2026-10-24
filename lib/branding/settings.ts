import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Runtime huisstijl: de eigenaar kan de primaire merkkleur + accent (mint)
// instellen zonder code. De merkkleuren zijn CSS-variabelen (tailwind.config +
// globals.css); hier leiden we uit de gekozen primaire kleur de tinten (50–700)
// af en zetten we de override-CSS klaar. Staat alles op standaard, dan injecteren
// we niets → de look is exact de oorspronkelijke.
// ---------------------------------------------------------------------------

const DEFAULT_PRIMARY = "#0E5C4A";
const DEFAULT_MINT = "#4FE0A0";
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface Branding {
  primaryHex: string;
  mintHex: string;
}

const KEY = "branding:colors";

export async function getBranding(): Promise<Branding> {
  const raw = await kvGet<Partial<Branding>>(KEY).catch(() => null);
  return {
    primaryHex: raw?.primaryHex && HEX.test(raw.primaryHex) ? raw.primaryHex : DEFAULT_PRIMARY,
    mintHex: raw?.mintHex && HEX.test(raw.mintHex) ? raw.mintHex : DEFAULT_MINT,
  };
}

export async function setBranding(patch: Partial<Branding>): Promise<Branding> {
  const next = { ...(await getBranding()), ...patch };
  next.primaryHex = HEX.test(next.primaryHex) ? next.primaryHex : DEFAULT_PRIMARY;
  next.mintHex = HEX.test(next.mintHex) ? next.mintHex : DEFAULT_MINT;
  await kvSet(KEY, next);
  return next;
}

export function isDefaultBranding(b: Branding): boolean {
  return b.primaryHex.toLowerCase() === DEFAULT_PRIMARY.toLowerCase() && b.mintHex.toLowerCase() === DEFAULT_MINT.toLowerCase();
}

type RGB = [number, number, number];
function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lerp(c: RGB, t: RGB, amt: number): RGB {
  return [Math.round(c[0] + (t[0] - c[0]) * amt), Math.round(c[1] + (t[1] - c[1]) * amt), Math.round(c[2] + (t[2] - c[2]) * amt)];
}
const str = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** De override-CSS voor :root, of null als alles op standaard staat. */
export function brandingCssVars(b: Branding): string | null {
  if (isDefaultBranding(b)) return null;
  const p = hexToRgb(b.primaryHex);
  const mint = hexToRgb(b.mintHex);
  const vars = [
    `--brand-50-rgb:${str(lerp(p, WHITE, 0.9))}`,
    `--brand-100-rgb:${str(lerp(p, WHITE, 0.76))}`,
    `--brand-300-rgb:${str(lerp(p, WHITE, 0.42))}`,
    `--brand-500-rgb:${str(p)}`,
    `--brand-600-rgb:${str(lerp(p, BLACK, 0.18))}`,
    `--brand-700-rgb:${str(lerp(p, BLACK, 0.36))}`,
    `--brand-mint-rgb:${str(mint)}`,
  ];
  return `:root{${vars.join(";")}}`;
}
