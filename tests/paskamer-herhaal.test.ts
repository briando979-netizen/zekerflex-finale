import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FotoFoutError, HERHAAL_WACHT_MS, bundelAdres, isLaadFout, metHerhaling, metStap } from "@/lib/shop/foto-fout";

// 15 nov, iPhone-app: stap=bundel, "'text/html' is geen JavaScript": tijdens een uitrol gaf /paskamer/ml/vision_bundle.mjs een HTML-pagina.
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
afterEach(() => vi.useRealTimers());

describe("een laadfout herkennen", () => {
  it("herkent een import die geen JavaScript kreeg, en netwerkfouten bij het laden", () => {
    expect(isLaadFout(new TypeError("'text/html' is geen JavaScript MIME-type"))).toBe(true);
    expect(isLaadFout(new TypeError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\""))).toBe(true);
    expect(isLaadFout(new TypeError("Failed to fetch dynamically imported module: https://x/vision_bundle.mjs"))).toBe(true);
    expect(isLaadFout(new SyntaxError("Unexpected token '<'"))).toBe(true);
    expect(isLaadFout(new TypeError("Load failed"))).toBe(true);
    expect(isLaadFout(metStap(new TypeError("'text/html' is geen JavaScript"), "bundel", "model"))).toBe(true);
  });

  it("herkent geen CSP-blokkade en geen fout van het model zelf", () => {
    expect(isLaadFout(new Error("WebAssembly.instantiate() violates CSP: script-src 'self'"))).toBe(false);
    expect(isLaadFout(new Error("WebAssembly.instantiate(): invalid SIMD opcode"))).toBe(false);
    expect(isLaadFout(new FotoFoutError("heic"))).toBe(false);
    expect(isLaadFout(null)).toBe(false);
  });

  it("de herhaling gebruikt een ander adres met ?v=, het gewone pad blijft gelijk", () => {
    expect(bundelAdres("/paskamer/ml", 0)).toBe("/paskamer/ml/vision_bundle.mjs");
    expect(bundelAdres("/paskamer/ml", 1)).toBe("/paskamer/ml/vision_bundle.mjs?v=1");
  });
});

describe("één keer opnieuw na 3 seconden", () => {
  it("lukt de eerste keer, dan geen herhaling", async () => {
    const poging = vi.fn(async (n: number) => `ok${n}`);
    await expect(metHerhaling(poging)).resolves.toBe("ok0");
    expect(poging).toHaveBeenCalledTimes(1);
  });

  it("een laadfout wordt na 3 s eenmaal opnieuw geprobeerd met poging 1", async () => {
    vi.useFakeTimers();
    const poging = vi.fn(async (n: number) => {
      if (n === 0) throw new TypeError("'text/html' is geen JavaScript");
      return "gelukt";
    });
    const uitkomst = metHerhaling(poging);
    await vi.advanceTimersByTimeAsync(HERHAAL_WACHT_MS - 1);
    expect(poging).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(uitkomst).resolves.toBe("gelukt");
    expect(poging).toHaveBeenCalledTimes(2);
    expect(poging).toHaveBeenLastCalledWith(1);
  });

  it("mislukt ook de herhaling, dan gaat de fout door (de eerlijke melding), en er komt geen derde poging", async () => {
    vi.useFakeTimers();
    const poging = vi.fn(async () => {
      throw new TypeError("'text/html' is geen JavaScript");
    });
    const uitkomst = metHerhaling(poging);
    const verwacht = expect(uitkomst).rejects.toThrow(/geen JavaScript/);
    await vi.advanceTimersByTimeAsync(HERHAAL_WACHT_MS + 10);
    await verwacht;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poging).toHaveBeenCalledTimes(2);
  });

  it("een andere fout wordt meteen doorgegeven, zonder herhaling of wachttijd", async () => {
    const poging = vi.fn(async () => {
      throw new Error("WebAssembly.instantiate() violates CSP");
    });
    await expect(metHerhaling(poging)).rejects.toThrow(/CSP/);
    expect(poging).toHaveBeenCalledTimes(1);
  });
});

describe("de laadstap van de paskamer", () => {
  it("laadt de bundel via metHerhaling en bundelAdres, en de mislukte poging blijft niet in de cache", () => {
    const bron = lees("components/marketing/paskamer/fotoMeting.ts");
    expect(bron).toContain("metHerhaling(async (nr) =>");
    expect(bron).toContain("import(/* webpackIgnore: true */ bundelAdres(BASIS, nr))");
    expect(bron).toContain("G.__zfMeting = undefined;");
    expect(bron).not.toMatch(/\(\?<[=!]/);
  });

  it("de bundel staat nog onder public/paskamer/ml (zelfde pad voor de CSP)", () => {
    expect(readFileSync(path.join(process.cwd(), "public", "paskamer", "ml", "vision_bundle.mjs")).length).toBeGreaterThan(1000);
    expect(lees("lib/security/csp.ts")).toContain("'wasm-unsafe-eval'");
  });
});