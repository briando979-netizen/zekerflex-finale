import { EXTENSIES, extensie } from "@/lib/domeinen/extensies";

// Wat iemand in de zoekbalk typt omzetten naar een geldige domeinnaam. Puur.
// "https://www.Bakkerij Jansen.nl/" → { label: "bakkerij-jansen", tld: "nl" }.
// Een naam met accenten (café) wordt de punycode-vorm ("xn--caf-dma").

export interface GezochteNaam {
  /** het deel vóór de extensie, in kleine letters (eventueel xn--…) */
  label: string;
  /** de getypte extensie, als we die aanbieden */
  tld: string | null;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Een geldig label: 1–63 tekens a-z, 0-9 en -, niet beginnen of eindigen met -, geen -- op plek 3-4 (behalve xn--). */
export function geldigLabel(label: string): boolean {
  if (!LABEL.test(label)) return false;
  if (label.slice(2, 4) === "--" && !label.startsWith("xn--")) return false;
  return true;
}

export function leesNaam(invoer: string): GezochteNaam | null {
  let s = invoer.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "");
  s = s.replace(/\s+/g, "-").replace(/[_'’]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!s) return null;
  // naar punycode (café → xn--caf-dma); ongeldige tekens maken de URL ongeldig
  let host: string;
  try {
    host = new URL(`http://${s}`).hostname;
  } catch {
    return null;
  }
  const delen = host.split(".").filter(Boolean);
  if (!delen.length) return null;
  let tld: string | null = null;
  if (delen.length > 1) {
    const laatste = delen[delen.length - 1] ?? "";
    if (extensie(laatste)) {
      tld = laatste;
      delen.pop();
    }
  }
  // "bakkerij.jansen" zonder bekende extensie → één naam met een streepje
  // (niet opnieuw streepjes samenvoegen: punycode begint met "xn--")
  const label = delen.join("-");
  return geldigLabel(label) ? { label, tld } : null;
}

/** De extensies die we laten zien: de getypte eerst, dan de populaire, dan de rest. */
export function teZoeken(naam: GezochteNaam, max = 10): string[] {
  const volgorde = [
    ...(naam.tld ? [naam.tld] : []),
    ...EXTENSIES.filter((e) => e.populair).map((e) => e.tld),
    ...EXTENSIES.filter((e) => !e.populair).map((e) => e.tld),
  ];
  return [...new Set(volgorde)].slice(0, max).map((t) => `${naam.label}.${t}`);
}

/** Is dit een volledige domeinnaam met een extensie die we aanbieden? */
export function leesDomein(domein: string): { label: string; tld: string } | null {
  const n = leesNaam(domein);
  return n && n.tld ? { label: n.label, tld: n.tld } : null;
}
