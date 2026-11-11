import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { horecaTabs } from "@/lib/horeca/tabs";
import {
  AAN_DE_SLAG_KAART,
  AAN_DE_SLAG_STAPPEN,
  horecaStappen,
  rijschoolStappen,
  webshopStappen,
  websiteStappen,
  type AanDeSlagSleutel,
} from "@/lib/onboarding/aan-de-slag";
import { berekenVoortgang } from "@/lib/onboarding/voortgang";
import { isRijschoolTab } from "@/lib/rijschool/tabs";
import { beoordeelTekst } from "@/lib/social/veilig";

const pagina = (href: string) => {
  const pad = href.split("?")[0] ?? href;
  return existsSync(join(process.cwd(), "app", ...pad.split("/").filter(Boolean), "page.tsx"));
};
const tab = (href: string) => new URLSearchParams(href.split("?")[1] ?? "").get("tab");

const alle = () => [
  ...websiteStappen({ aangemaakt: false, online: false, eigenDomein: false, bezoekers7d: 0 }),
  ...webshopStappen({ aangemaakt: false, producten: 0, online: false, betalenKlaar: false, verzendingKlaar: false }),
  ...horecaStappen({ menuItems: 0, tafels: 0, modules: ["bestellen", "reserveren"], online: false }),
  ...rijschoolStappen({ leerlingenActief: 0, lessenKomendeWeek: 0, online: false, instructeurs: 0, pakketten: 0 }),
];

describe("Aan de slag per product", () => {
  it("elke stap heeft een titel en uitleg in gewoon Nederlands, en elke sleutel is gebruikt", () => {
    const gebruikt = new Set<AanDeSlagSleutel>(alle().map((s) => s.key));
    expect([...gebruikt].sort()).toEqual((Object.keys(AAN_DE_SLAG_STAPPEN) as AanDeSlagSleutel[]).sort());
    for (const [sleutel, t] of Object.entries(AAN_DE_SLAG_STAPPEN)) {
      expect(t.title.length, sleutel).toBeGreaterThan(8);
      expect(t.why.length, sleutel).toBeGreaterThan(30);
      expect(beoordeelTekst(`${t.title} ${t.why}`).veilig, sleutel).toBe(true);
    }
    for (const k of Object.values(AAN_DE_SLAG_KAART)) expect(k.title.startsWith("Aan de slag")).toBe(true);
  });

  it("elke stap verwijst naar een bestaand scherm (en een bestaand tabblad)", () => {
    for (const s of alle()) {
      expect(pagina(s.href), `${s.key}: ${s.href}`).toBe(true);
      const t = tab(s.href);
      if (s.href.startsWith("/werkgever/rijschool")) expect(isRijschoolTab(t), `${s.key}: ${t}`).toBe(true);
      if (s.href.startsWith("/werkgever/horeca")) expect(horecaTabs(["bestellen", "reserveren"]).some((x) => x.id === t), `${s.key}: ${t}`).toBe(true);
    }
  });

  it("website: ontwerp gekozen en online telt, het eigen domein en de eerste bezoekers zijn tips", () => {
    const v = berekenVoortgang(websiteStappen({ aangemaakt: true, online: false, eigenDomein: false, bezoekers7d: 0 }));
    expect(v).toMatchObject({ done: 1, total: 2, klaar: false });
    expect(v.volgende?.key).toBe("website-online");
    const klaar = berekenVoortgang(websiteStappen({ aangemaakt: true, online: true, eigenDomein: false, bezoekers7d: 0 }));
    expect(klaar.klaar).toBe(true);
    expect(klaar.open.map((s) => s.key)).toEqual(["website-domein", "website-bezoek"]);
  });

  it("een stap waarvan het feit onbekend is verschijnt niet (liever geen stap dan een eeuwig open stap)", () => {
    const keys = webshopStappen({ aangemaakt: true, producten: 2, online: false }).map((s) => s.key);
    expect(keys).toEqual(["webshop-ontwerp", "webshop-producten", "webshop-online"]);
    expect(rijschoolStappen({ leerlingenActief: 0, lessenKomendeWeek: 0, online: false }).map((s) => s.key)).toEqual(["rijschool-leerlingen", "rijschool-agenda", "rijschool-online"]);
    expect(websiteStappen({ aangemaakt: true, online: true }).map((s) => s.key)).toEqual(["website-ontwerp", "website-online"]);
  });

  it("webshop: eerst producten, dan betalen en verzending, en pas dan online", () => {
    const keys = webshopStappen({ aangemaakt: true, producten: 0, online: false, betalenKlaar: false, verzendingKlaar: false }).map((s) => s.key);
    expect(keys).toEqual(["webshop-ontwerp", "webshop-producten", "webshop-betalen", "webshop-verzending", "webshop-online"]);
    const v = berekenVoortgang(webshopStappen({ aangemaakt: true, producten: 3, online: false, betalenKlaar: true, verzendingKlaar: false }));
    expect(v.volgende?.key).toBe("webshop-verzending");
    expect(v.pct).toBe(60);
  });

  it("horeca: tafels en QR alleen als de module bestellen aan staat; modules is een tip", () => {
    expect(horecaStappen({ menuItems: 4, tafels: 0, modules: ["reserveren"], online: true }).map((s) => s.key)).toEqual(["horeca-menukaart", "horeca-modules", "horeca-online"]);
    const met = horecaStappen({ menuItems: 4, tafels: 0, modules: ["bestellen"], online: true });
    expect(met.map((s) => s.key)).toEqual(["horeca-menukaart", "horeca-tafels", "horeca-modules", "horeca-online"]);
    expect(berekenVoortgang(met).volgende?.key).toBe("horeca-tafels");
    expect(horecaStappen({ menuItems: 0, tafels: 0, modules: [], online: false }).find((s) => s.key === "horeca-modules")?.optioneel).toBe(true);
  });

  it("rijschool: volgorde van instructeurs tot online, en alles klaar = klaar", () => {
    const klaar = berekenVoortgang(rijschoolStappen({ leerlingenActief: 5, lessenKomendeWeek: 12, online: true, instructeurs: 2, pakketten: 3 }));
    expect(klaar).toMatchObject({ klaar: true, pct: 100 });
    expect(klaar.open).toEqual([]);
    const begin = berekenVoortgang(rijschoolStappen({ leerlingenActief: 0, lessenKomendeWeek: 0, online: false, instructeurs: 0, pakketten: 0 }));
    expect(begin.volgende?.key).toBe("rijschool-team");
    expect(begin.total).toBe(5);
  });
});
