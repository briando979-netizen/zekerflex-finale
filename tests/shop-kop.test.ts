import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lees = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("kop van /shop: foto rechts naast de tekst", () => {
  const bron = lees("components/marketing/ShopThuis.tsx");

  it("de foto is een verkleinde JPEG (geen PNG) met vaste afmetingen en voorrang", () => {
    const pad = new URL("../public/shop/kop-team.jpg", import.meta.url);
    expect(statSync(pad).size).toBeLessThan(250_000);
    const kop = readFileSync(pad).subarray(0, 3);
    expect([...kop]).toEqual([0xff, 0xd8, 0xff]);
    expect(bron).toContain('src="/shop/kop-team.jpg"');
    expect(bron).toMatch(/width=\{1024\}\s+height=\{1046\}\s+priority/);
  });

  it("heeft een Nederlandse alt-tekst, snijdt op de gezichten bij en blijft op mobiel binnen de breedte", () => {
    expect(bron).toContain('alt="Vier lachende mensen in ZekerFlex-kleding voor een bakstenen muur met het ZF-logo"');
    expect(bron).toContain("object-[50%_22%]");
    expect(bron).toContain("max-w-[560px]");
    expect(bron).toContain("calc(100vw - 32px)");
  });

  it("staat met bron in public/shop/CREDITS.md", () => {
    expect(lees("public/shop/CREDITS.md")).toContain("kop-team.jpg");
  });
});