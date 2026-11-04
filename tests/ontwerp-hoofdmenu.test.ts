import { describe, expect, it } from "vitest";
import { NAV } from "@/lib/marketing/site-nav";
import { bouwNav, isStandaardHoofdmenu, normalizeHoofdmenu, standaardHoofdmenu } from "@/lib/ontwerp/hoofdmenu";

describe("hoofdmenu uit de Site-ontwerper", () => {
  it("zonder eigen versie toont de site exact het standaardmenu", () => {
    expect(bouwNav(null)).toBe(NAV);
    expect(bouwNav(undefined)).toBe(NAV);
    expect(bouwNav(standaardHoofdmenu())).toEqual(NAV);
    expect(isStandaardHoofdmenu(standaardHoofdmenu())).toBe(true);
  });

  it("hernoemt, verbergt, verplaatst en zet eigen links onder de vaste submenulinks", () => {
    const m = standaardHoofdmenu();
    const [aanbod, hoe, prijzen, ...rest] = m.knoppen;
    if (!aanbod || !hoe || !prijzen) throw new Error("standaardmenu te kort");
    const nav = bouwNav({
      knoppen: [
        { ...prijzen, label: "Tarieven", extra: [{ title: "Rekentool", desc: "", href: "/rekentools" }] },
        aanbod,
        { ...hoe, verborgen: true },
        ...rest,
      ],
    });
    expect(nav.map((n) => n.key)).toEqual(["prijzen", "aanbod", "shop", "over", "kennis"]);
    const p = nav[0];
    expect(p?.label).toBe("Tarieven");
    expect(p?.href).toBe("/prijzen");
    const items = p?.menu?.bedrijven.items ?? [];
    expect(items.at(-1)).toEqual({ title: "Rekentool", desc: "", href: "/rekentools" });
    expect(items.length).toBe((NAV.find((n) => n.key === "prijzen")?.menu?.bedrijven.items.length ?? 0) + 1);
  });

  it("eigen knop: met adres en submenu, hooguit twee, onveilige adressen vallen weg", () => {
    const m = normalizeHoofdmenu({
      knoppen: [
        { key: "eigen-a", label: "Vacatures", href: "/p/vacatures", extra: [{ title: "Stage", href: "/p/stage" }, { title: "Kwaad", href: "javascript:alert(1)" }] },
        { key: "eigen-b", label: "Blog", href: "https://blog.zekerflex.com" },
        { key: "eigen-c", label: "Te veel", href: "/p/x" },
        { key: "eigen-d", label: "Geen adres", href: "javascript:alert(1)" },
        { key: "onbekend", label: "Weg" },
        { key: "eigen-a", label: "Dubbel", href: "/p/dubbel" },
      ],
    });
    const keys = m.knoppen.map((k) => k.key);
    expect(keys.slice(0, 2)).toEqual(["eigen-a", "eigen-b"]);
    // de standaardknoppen die ontbraken komen achteraan terug
    expect(keys.slice(2)).toEqual(NAV.map((n) => n.key));
    expect(m.knoppen[0]?.extra).toEqual([{ title: "Stage", desc: "", href: "/p/stage" }]);

    const nav = bouwNav(m);
    const vac = nav[0];
    expect(vac?.href).toBe("/p/vacatures");
    expect(vac?.match).toBe("/p/vacatures");
    expect(vac?.menu?.werknemers.items).toEqual([{ title: "Stage", desc: "", href: "/p/stage" }]);
    // een link naar buiten licht nooit op als actieve pagina
    expect(nav[1]?.match).toBe("#");
    expect(nav[1]?.menu).toBeUndefined();
  });

  it("een standaardknop zonder naam krijgt zijn standaardnaam terug", () => {
    const m = normalizeHoofdmenu({ knoppen: [{ key: "shop", label: "   " }] });
    expect(m.knoppen.find((k) => k.key === "shop")?.label).toBe("Shop");
    expect(isStandaardHoofdmenu(m)).toBe(false); // andere volgorde dan de standaard
  });
});
