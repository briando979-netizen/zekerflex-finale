import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIJN_WINKEL_KNOPPEN, betalenStatus } from "@/lib/shop/console";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { isShopTab } from "@/lib/shop/admin-tabs";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

// Mijn winkel (14 nov): het startpunt van het webshopbeheer, met zes grote knoppen in gewoon Nederlands.
describe("Mijn winkel: de zes knoppen", () => {
  it("heeft precies de zes dingen die de eigenaar doet, in deze volgorde", () => {
    expect(MIJN_WINKEL_KNOPPEN.map((k) => k.titel)).toEqual(["Product toevoegen", "Producten", "Bestellingen", "Winkel bekijken", "Winkel inrichten", "Betalen"]);
  });

  it("elke knop wijst naar een pagina die bestaat (het menu of de winkel zelf) en een geldig tabblad", () => {
    const inMenu = new Set(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href)));
    for (const k of MIJN_WINKEL_KNOPPEN) {
      const [pad, zoek] = k.href.split("?");
      if (pad === "/shop") expect(k.buiten, k.titel).toBe(true);
      else expect(inMenu.has(pad ?? ""), k.titel).toBe(true);
      const tab = new URLSearchParams(zoek ?? "").get("tab");
      if (tab && pad === "/admin/shop") expect(isShopTab(tab), k.titel).toBe(true);
    }
    expect(MIJN_WINKEL_KNOPPEN.find((k) => k.id === "toevoegen")?.href).toBe("/admin/shop?nieuw=1");
  });

  it("de uitleg is gewoon Nederlands: een zin, geen vaktaal", () => {
    for (const k of MIJN_WINKEL_KNOPPEN) {
      expect(k.uitleg.endsWith("."), k.titel).toBe(true);
      expect(k.uitleg, k.titel).not.toMatch(/\bPSP\b|API|webhook|tenant/i);
    }
  });

  it("Betalen zegt eerlijk dicht zolang Stripe dat meldt, en verzint niets als het niet gemeten is", () => {
    expect(betalenStatus(false)).toEqual({ tekst: "Dicht: klanten kunnen nu niet betalen", toon: "crit" });
    expect(betalenStatus(true).toon).toBe("ok");
    expect(betalenStatus(null)).toEqual({ tekst: "Nog niet gemeten", toon: "neutral" });
  });
});

describe("Mijn winkel: de pagina en het menu", () => {
  it("de pagina heet Mijn winkel, toont de knoppen en de Betalen-status, en blijft strikt voor platformbeheer", () => {
    const pagina = lees("app/admin/webshop/page.tsx");
    expect(pagina).toContain('title="Mijn winkel"');
    expect(pagina).toContain("MIJN_WINKEL_KNOPPEN.map");
    expect(pagina).toContain("betalenStatus(s.betalen)");
    expect(pagina).toContain('hasRole(principal, "PLATFORM_ADMIN")');
  });

  it("Mijn winkel staat bovenaan Webshop en merk", () => {
    const merk = ADMIN_HUBS.find((h) => h.id === "merk");
    expect(merk?.pages[0]).toEqual({ href: "/admin/webshop", label: "Mijn winkel" });
  });

  it("de knop Product toevoegen opent meteen het formulier voor een nieuw product", () => {
    const scherm = lees("components/admin/ShopAdmin.tsx");
    expect(scherm).toContain('zoek.get("nieuw") === "1"');
    expect(scherm).toContain("setShowForm(true)");
  });
});

describe("Mijn winkel: Winkel inrichten (deel 5)", () => {
  it("wijst naar bestaande tabbladen van de Site-ontwerper, in gewoon Nederlands", async () => {
    const { INRICHTEN_KNOPPEN } = await import("@/lib/shop/console");
    const { isOntwerperTab } = await import("@/lib/ontwerp/tabs");
    expect(INRICHTEN_KNOPPEN.map((k) => k.id)).toEqual(["kop", "indeling", "kleuren", "menu", "teksten", "beeld"]);
    for (const k of INRICHTEN_KNOPPEN) {
      const [pad, zoek] = k.href.split("?");
      expect(pad).toBe("/admin/ontwerper");
      expect(isOntwerperTab(new URLSearchParams(zoek ?? "").get("tab")), k.titel).toBe(true);
      expect(k.uitleg.endsWith("."), k.titel).toBe(true);
    }
  });

  it("staat op de pagina met uitleg dat er een voorbeeld naast staat", () => {
    const pagina = lees("app/admin/webshop/page.tsx");
    expect(pagina).toContain('title="Winkel inrichten"');
    expect(pagina).toContain("INRICHTEN_KNOPPEN.map");
    expect(pagina).toContain("Je ziet meteen een voorbeeld van je winkel ernaast.");
  });
});
