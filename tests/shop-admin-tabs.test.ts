import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHOP_TABS, isShopTab, kiesShopTab, zoekMetShopTab } from "@/lib/shop/admin-tabs";
import { CONSOLE_GROEPEN } from "@/lib/shop/console";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("het tabblad van Beheer, Webshop in het adres", () => {
  it("kent alleen de echte tabnamen, en niet constructor of andere ingebouwde namen", () => {
    for (const t of SHOP_TABS) expect(isShopTab(t)).toBe(true);
    expect(isShopTab("constructor")).toBe(false);
    expect(isShopTab("toString")).toBe(false);
    expect(isShopTab("__proto__")).toBe(false);
    expect(isShopTab("")).toBe(false);
    expect(isShopTab(null)).toBe(false);
    expect(isShopTab(["orders"])).toBe(false);
  });

  it("een onbekende of ontbrekende naam geeft Producten", () => {
    expect(kiesShopTab("orders")).toBe("orders");
    expect(kiesShopTab("tools")).toBe("tools");
    expect(kiesShopTab("nep")).toBe("products");
    expect(kiesShopTab(null)).toBe("products");
    expect(kiesShopTab("constructor")).toBe("products");
  });

  it("zet het tabblad in de querystring en laat anderen staan; Producten laat ?tab= weg", () => {
    expect(zoekMetShopTab("", "orders")).toBe("tab=orders");
    expect(zoekMetShopTab("?x=1", "tools")).toBe("x=1&tab=tools");
    expect(zoekMetShopTab("tab=orders&x=1", "stats")).toBe("tab=stats&x=1");
    expect(zoekMetShopTab("tab=orders", "products")).toBe("");
    expect(zoekMetShopTab("x=1&tab=orders", "products")).toBe("x=1");
  });

  it("de twee tegels van de console openen het juiste tabblad", () => {
    const tegels = CONSOLE_GROEPEN.flatMap((g) => g.tegels);
    expect(tegels.find((t) => t.titel === "Bestellingen")?.href).toBe("/admin/shop?tab=orders");
    expect(tegels.find((t) => t.titel === "Kortingscodes en cijfers")?.href).toBe("/admin/shop?tab=tools");
    expect(tegels.find((t) => t.titel === "Producten")?.href).toBe("/admin/shop");
  });

  it("het scherm leest het tabblad bij laden, werkt het adres bij zonder scrollen en geeft niets terug uit de effect", () => {
    const bron = lees("components/admin/ShopAdmin.tsx");
    expect(bron).toContain('useEffect(() => { setTab(kiesShopTab(new URLSearchParams(window.location.search).get("tab"))); }, []);');
    expect(bron).toContain("window.history.replaceState(");
    expect(bron).toContain("onClick={() => kiesTab(key)}");
    expect(bron).not.toMatch(/\(\?<[=!]/);
    expect(bron).not.toMatch(/useEffect\(\(\) => setTab/);
  });
});