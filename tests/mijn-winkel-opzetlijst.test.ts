import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { opzetStappen, opzetVoortgang, volgendeStap, type OpzetStand } from "@/lib/shop/opzetlijst";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { isShopTab } from "@/lib/shop/admin-tabs";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const leeg: OpzetStand = { producten: 0, zichtbaar: 0, zonderFoto: 0, eigenTeksten: false, betalen: false, betaaldTotaal: 0 };
const klaar: OpzetStand = { producten: 4, zichtbaar: 3, zonderFoto: 0, eigenTeksten: true, betalen: true, betaaldTotaal: 2 };
const stap = (s: OpzetStand, id: string) => opzetStappen(s).find((x) => x.id === id)!;

describe("de opzetlijst van Mijn winkel", () => {
  it("heeft zes stappen in een vaste volgorde, elk met één knop", () => {
    const s = opzetStappen(leeg);
    expect(s.map((x) => x.id)).toEqual(["product", "zichtbaar", "fotos", "inrichten", "betalen", "bestelling"]);
    for (const x of s) {
      expect(x.knop.length, x.id).toBeGreaterThan(2);
      expect(x.uitleg.endsWith("."), x.id).toBe(true);
    }
  });

  it("een lege winkel heeft niets afgevinkt en is eerlijk over betalen", () => {
    const s = opzetStappen(leeg);
    expect(s.filter((x) => x.klaar === true)).toHaveLength(0);
    expect(opzetVoortgang(s)).toMatchObject({ klaar: 0, totaal: 6, tekst: "0 van 6 klaar", allesKlaar: false });
    expect(volgendeStap(s)?.id).toBe("product");
    expect(stap(leeg, "betalen").status).toBe("Dicht: klanten kunnen nu niet betalen");
    expect(stap(leeg, "betalen").uitleg).toMatch(/staat dicht/);
  });

  it("vinkt af uit echte gegevens", () => {
    expect(stap({ ...leeg, producten: 2 }, "product").klaar).toBe(true);
    expect(stap({ ...leeg, producten: 2 }, "product").status).toBe("2 producten aangemaakt");
    expect(stap({ ...leeg, producten: 1 }, "product").status).toBe("1 product aangemaakt");
    expect(stap({ ...leeg, zichtbaar: 1 }, "zichtbaar").klaar).toBe(true);
    expect(stap({ ...leeg, eigenTeksten: true }, "inrichten").klaar).toBe(true);
    expect(stap({ ...leeg, betaaldTotaal: 1 }, "bestelling").klaar).toBe(true);
    expect(stap({ ...leeg, betaaldTotaal: 3 }, "bestelling").status).toBe("3 betaalde bestellingen");
  });

  it("foto's zijn pas klaar als er zichtbare producten zijn en geen enkele zonder foto", () => {
    expect(stap(leeg, "fotos").klaar).toBe(false);
    expect(stap({ ...leeg, zichtbaar: 2, zonderFoto: 1 }, "fotos")).toMatchObject({ klaar: false, status: "1 zonder foto" });
    expect(stap({ ...leeg, zichtbaar: 2, zonderFoto: 0 }, "fotos").klaar).toBe(true);
  });

  it("betalen: dicht is niet klaar, open is klaar, niet gemeten is geen vinkje", () => {
    expect(stap({ ...leeg, betalen: false }, "betalen").klaar).toBe(false);
    expect(stap({ ...leeg, betalen: true }, "betalen").klaar).toBe(true);
    const onbekend = stap({ ...leeg, betalen: null }, "betalen");
    expect(onbekend.klaar).toBeNull();
    expect(onbekend.status).toBe("Nog niet gemeten");
    // een niet gemeten stap telt nooit als klaar
    expect(opzetVoortgang(opzetStappen({ ...klaar, betalen: null })).klaar).toBe(5);
  });

  it("alles klaar geeft 6 van 6 en geen volgende stap", () => {
    const s = opzetStappen(klaar);
    expect(opzetVoortgang(s)).toMatchObject({ klaar: 6, allesKlaar: true });
    expect(volgendeStap(s)).toBeNull();
  });

  it("elke knop wijst naar een bestaande pagina met een geldig tabblad", () => {
    const inMenu = new Set(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href)));
    for (const x of opzetStappen(leeg)) {
      const [pad, zoek] = x.href.split("?");
      expect(inMenu.has(pad ?? ""), x.id).toBe(true);
      const tab = new URLSearchParams(zoek ?? "").get("tab");
      if (tab && pad === "/admin/shop") expect(isShopTab(tab), x.id).toBe(true);
    }
  });
});

describe("de pagina", () => {
  it("toont de opzetlijst met voortgang, meet echte gegevens en blijft strikt voor platformbeheer", () => {
    const pagina = lees("app/admin/webshop/page.tsx");
    expect(pagina).toContain("Zo zet je je winkel op");
    expect(pagina).toContain("opzetStappen({");
    expect(pagina).toContain("opzetVoortgang(stappen)");
    expect(pagina).toContain("prisma.shopOrder.count({ where: { status: { in: [...BETAALD] } } })");
    expect(pagina).toContain('getContentMap(contentKeys("shop."))');
    expect(pagina).toContain('hasRole(principal, "PLATFORM_ADMIN")');
  });
});