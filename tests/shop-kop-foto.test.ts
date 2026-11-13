import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De kop van de webshop met de teamfoto van de eigenaar (13 nov): tekst links, foto rechts in een afgerond kader, op de
// telefoon onder de tekst. De foto die de beheerder voor de webshop kiest komt in dat kader, niet meer als strook erboven.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de foto zelf", () => {
  it("staat als lichte jpeg in public/shop, met de bron in CREDITS.md", () => {
    const f = path.join(process.cwd(), "public/shop/kop-team.jpg");
    expect(existsSync(f)).toBe(true);
    // verkleind: geen losse png van een megabyte
    expect(statSync(f).size).toBeLessThan(250_000);
    expect(bron("public/shop/CREDITS.md")).toContain("| kop-team.jpg |");
  });
});

describe("de kop", () => {
  const kop = bron("components/marketing/ShopThuis.tsx");
  const hero = kop.slice(kop.indexOf("export function ShopThuisHero("), kop.indexOf("export type GroteTegel"));

  it("toont de foto met voorrang, een Nederlandse beschrijving en een vaste verhouding (niets verspringt)", () => {
    expect(kop).toContain('export const SHOP_KOP_FOTO = { src: "/shop/kop-team.jpg", alt: "Vier mensen in ZekerFlex-kleding');
    expect(hero).toContain("<Image src={foto.src} alt={foto.alt} fill priority");
    expect(hero).toContain("aspect-[4/3]");
    expect(hero).toContain("lg:aspect-square");
    // bijgesneden op de gezichten: die staan bovenin de foto
    expect(hero).toContain("object-cover object-[50%_18%]");
    expect(hero).toContain("rounded-[1.75rem]");
  });

  it("de tekst staat eerst (links, en op de telefoon boven de foto) en de foto wordt nooit breder dan het scherm", () => {
    expect(hero.indexOf('id="shop-kop"')).toBeLessThan(hero.indexOf("<Image "));
    expect(hero).toContain("w-full max-w-[560px]");
    expect(hero).toContain('className="overflow-hidden bg-[#f4efe6]"');
    // het sierblok achter de foto steekt alleen uit waar er ruimte is
    expect(hero).toContain("hidden h-2/3 w-2/3");
  });

  it("de productkaartjes staan niet meer in de kop", () => {
    expect(hero).not.toContain("uitgelicht");
  });
});

describe("de pagina", () => {
  const src = bron("app/shop/page.tsx");

  it("een gekozen foto komt in de kop en niet nog eens als strook; een video blijft de strook", () => {
    expect(src).toContain('const achtergrond = browsing ? null : await achtergrondVoor("shop");');
    expect(src).toContain('const kopFoto = achtergrond?.soort === "foto" ? { src: achtergrond.src, alt: achtergrond.alt } : null;');
    expect(src).toContain('{!browsing && achtergrond?.soort === "video" && <PaginaAchtergrond pagina="shop" />}');
    expect(src).toContain("<ShopThuisHero t={dict} {...(kopFoto ? { foto: kopFoto } : {})} />");
  });
});
