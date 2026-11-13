import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CSP_HERLAAD_VLAG, FotoFoutError, fotoFoutSoort, isCspWasmFout, metStap, moetHerladen, type VlagOpslag } from "@/lib/shop/foto-fout";

// Gemeten (13 nov, Edge): "WebAssembly.instantiate() violates CSP: script-src 'self' 'nonce-...'" op /shop/paskamer. De CSP hoort
// bij het eerste document (lib/security/csp.ts, AGENTS.md): wie via een <Link> uit / of Beheer kwam, had geen 'wasm-unsafe-eval'.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const CSP_FOUT = "CompileError: WebAssembly.instantiate(): Refused to compile or instantiate WebAssembly module because 'unsafe-eval' or 'wasm-unsafe-eval' is not an allowed source of script. Content Security Policy violates CSP";

function opslag(): VlagOpslag & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("de CSP-fout van WebAssembly herkennen", () => {
  it("herkent een CSP-melding, maar geen andere fouten", () => {
    expect(isCspWasmFout(new Error("WebAssembly.instantiate() violates CSP: script-src 'self' 'nonce-abc'"))).toBe(true);
    expect(isCspWasmFout(new Error("... 'wasm-unsafe-eval' is not an allowed source of script"))).toBe(true);
    expect(isCspWasmFout(new Error(CSP_FOUT))).toBe(true);
    expect(isCspWasmFout(new Error("Failed to fetch"))).toBe(false);
    expect(isCspWasmFout(new Error("WebAssembly.instantiate(): invalid SIMD opcode"))).toBe(false);
    expect(isCspWasmFout("iets anders")).toBe(false);
    expect(isCspWasmFout(null)).toBe(false);
  });

  it("zoekt in de oorzaak van een FotoFoutError en geeft de fout de soort csp", () => {
    const e = metStap(new Error("WebAssembly.instantiate() violates CSP"), "wasm", "model");
    expect(fotoFoutSoort(e)).toBe("csp");
    expect(isCspWasmFout(e)).toBe(true);
    expect(fotoFoutSoort(metStap(new Error("Failed to fetch"), "wasm", "model"))).toBe("model");
    expect(isCspWasmFout(new FotoFoutError("model", "wasm", new Error("Failed to fetch")))).toBe(false);
  });
});

describe("één herlading, nooit een lus", () => {
  it("herlaadt de eerste keer bij een CSP-fout en zet de vlag", () => {
    const o = opslag();
    expect(moetHerladen(true, o)).toBe(true);
    expect(o.data.get(CSP_HERLAAD_VLAG)).toBe("1");
  });

  it("herlaadt een tweede keer niet", () => {
    const o = opslag();
    expect(moetHerladen(true, o)).toBe(true);
    expect(moetHerladen(true, o)).toBe(false);
  });

  it("herlaadt niet zonder CSP-fout of zonder werkende opslag", () => {
    expect(moetHerladen(false, opslag())).toBe(false);
    expect(moetHerladen(true, null)).toBe(false);
    const kapot: VlagOpslag = { getItem: () => { throw new Error("geblokkeerd"); }, setItem: () => { throw new Error("geblokkeerd"); } };
    expect(moetHerladen(true, kapot)).toBe(false);
    // een opslag die niets bewaart zou een lus geven: dan geen herlading
    const leeg: VlagOpslag = { getItem: () => null, setItem: () => undefined };
    expect(moetHerladen(true, leeg)).toBe(false);
  });

  it("het scherm gebruikt het vangnet en wist de vlag na een gelukte meting", () => {
    const bron = lees("components/marketing/paskamer/MijnFoto.tsx");
    expect(bron).toContain("moetHerladen(isCspWasmFout(e), opslag)");
    expect(bron).toContain("window.location.reload()");
    expect(bron).toContain("window.sessionStorage.removeItem(CSP_HERLAAD_VLAG)");
    expect(bron).not.toMatch(/\(\?<[=!]/);
  });
});

describe("links naar de paskamer laden de pagina volledig", () => {
  const BESTANDEN = [
    "components/marketing/ShopChrome.tsx",
    "components/marketing/ShopProductCard.tsx",
    "components/marketing/ShopSections.tsx",
    "components/marketing/ShopThuis.tsx",
    "components/marketing/paskamer/PaskamerTip.tsx",
    "components/marketing/zakelijk/ZakelijkSecties.tsx",
  ];

  it.each(BESTANDEN)("%s heeft geen <Link> meer naar /shop/paskamer", (pad) => {
    const bron = lees(pad);
    expect(bron).not.toMatch(/<Link\s[^>]*href=(\{`|")\/shop\/paskamer/);
    expect(bron).toContain("<PaskamerLink");
  });

  it("nergens in de code staat een <Link> of router.push naar /shop/paskamer", () => {
    const stack = ["components", "app"];
    const gevonden: string[] = [];
    const loop = (map: string) => {
      for (const naam of readdirSyncSafe(map)) {
        const vol = path.join(map, naam);
        if (statSyncSafe(vol)) loop(vol);
        else if (/\.tsx?$/.test(naam)) {
          const bron = readFileSync(vol, "utf8");
          if (/<Link\s[^>]*href=(\{`|")\/shop\/paskamer/.test(bron) || /router\.(push|replace)\(\s*[`"']\/shop\/paskamer/.test(bron)) gevonden.push(vol);
        }
      }
    };
    for (const m of stack) loop(path.join(process.cwd(), m));
    expect(gevonden).toEqual([]);
  });

  it("de PaskamerLink is een gewone <a> met de uitleg waarom", () => {
    const bron = lees("components/marketing/PaskamerLink.tsx");
    expect(bron).toContain("<a href={href}");
    expect(bron).not.toContain("next/link");
    expect(bron).toContain("CSP");
  });
});

import { readdirSync, statSync } from "node:fs";
const readdirSyncSafe = (m: string): string[] => {
  try {
    return readdirSync(m);
  } catch {
    return [];
  }
};
const statSyncSafe = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};