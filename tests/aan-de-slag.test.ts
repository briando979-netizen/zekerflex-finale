import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { horecaTabs } from "@/lib/horeca/tabs";
import {
  AAN_DE_SLAG_KAART,
  AAN_DE_SLAG_STAPPEN,
  horecaStappen,
  rijschoolStappen,
  tabVanHref,
  webshopStappen,
  websiteStappen,
  type AanDeSlagSleutel,
} from "@/lib/onboarding/aan-de-slag";
import { berekenVoortgang } from "@/lib/onboarding/voortgang";
import { isRijschoolTab } from "@/lib/rijschool/tabs";
import { beoordeelTekst } from "@/lib/social/veilig";

const pagina = (href: string) => existsSync(join(process.cwd(), "app", ...(href.split("?")[0] ?? "").split("/").filter(Boolean), "page.tsx"));

const alle = () => [
  ...websiteStappen({ paginas: 1, logo: false, contactKlaar: false, online: false, eigenDomein: false }),
  ...webshopStappen({ actieveProducten: 0, verzendingBetalenKlaar: false, bedrijfsgegevensKlaar: false, wettelijkePaginas: false, online: false, eigenDomein: false }),
  ...horecaStappen({ menuItems: 0, adresEnTelefoon: false, modules: ["bestellen"], tafels: 0, apparaten: 0, online: false }),
  ...rijschoolStappen({ pakketten: 0, werktijden: false, voertuigen: 0, kvkEnAdres: false, werkgebied: false, online: false }),
];

describe("Aan de slag: één lijst per dashboard", () => {
  it("elke sleutel wordt gebruikt en heeft een titel en uitleg in gewoon Nederlands zonder verkeerde beloftes", () => {
    expect(alle().map((s) => s.key).sort()).toEqual((Object.keys(AAN_DE_SLAG_STAPPEN) as AanDeSlagSleutel[]).sort());
    for (const [sleutel, t] of Object.entries(AAN_DE_SLAG_STAPPEN)) {
      expect(t.title.length, sleutel).toBeGreaterThan(8);
      expect(t.why.length, sleutel).toBeGreaterThan(30);
      expect(beoordeelTekst(`${t.title} ${t.why}`).veilig, sleutel).toBe(true);
    }
    for (const k of Object.values(AAN_DE_SLAG_KAART)) expect(k.title.startsWith("Aan de slag")).toBe(true);
  });

  it("elke stap verwijst naar een bestaand scherm en een bestaand tabblad", () => {
    for (const s of alle()) {
      expect(pagina(s.href), `${s.key}: ${s.href}`).toBe(true);
      const t = tabVanHref(s.href);
      if (s.href.startsWith("/werkgever/rijschool")) expect(isRijschoolTab(t), `${s.key}: ${t}`).toBe(true);
      if (s.href.startsWith("/werkgever/horeca")) expect(horecaTabs(["bestellen", "reserveren"]).some((x) => x.id === t), `${s.key}: ${t}`).toBe(true);
    }
    expect(tabVanHref("/studio/website/bouwer")).toBeNull();
    expect(tabVanHref("/werkgever/horeca?tab=menukaart")).toBe("menukaart");
  });

  it("website: dezelfde vijf stappen en voorwaarden als het studio-overzicht (pagina's meer dan één, logo, contact, online, domein)", () => {
    const s = websiteStappen({ paginas: 2, logo: true, contactKlaar: false, online: false, eigenDomein: false });
    expect(s.map((x) => [x.key, x.done])).toEqual([
      ["website-paginas", true],
      ["website-logo", true],
      ["website-contact", false],
      ["website-online", false],
      ["website-domein", false],
    ]);
    expect(websiteStappen({ paginas: 1, online: true }).find((x) => x.key === "website-paginas")?.done).toBe(false);
    // eigen domein onbekend (nog aan het laden): geen stap
    expect(websiteStappen({ paginas: 3, logo: true, contactKlaar: true, online: true, eigenDomein: null }).map((x) => x.key)).not.toContain("website-domein");
  });

  it("webshop: zes stappen zoals het studio-overzicht; wettelijke pagina's tellen pas bij een online winkel", () => {
    const basis = { actieveProducten: 3, verzendingBetalenKlaar: true, bedrijfsgegevensKlaar: true, wettelijkePaginas: true, eigenDomein: false } as const;
    expect(webshopStappen({ ...basis, online: false }).map((x) => [x.key, x.done])).toEqual([
      ["webshop-product", true],
      ["webshop-verzending", true],
      ["webshop-bedrijf", true],
      ["webshop-wettelijk", false],
      ["webshop-online", false],
      ["webshop-domein", false],
    ]);
    expect(webshopStappen({ ...basis, online: true }).find((x) => x.key === "webshop-wettelijk")?.done).toBe(true);
    expect(webshopStappen({ ...basis, actieveProducten: 0, online: false })[0]?.done).toBe(false);
  });

  it("horeca: tafels zijn klaar als de module bestellen uit staat (zoals het live-tabblad); modules en schermen eigen stappen", () => {
    const zonder = horecaStappen({ menuItems: 5, adresEnTelefoon: true, modules: ["reserveren"], tafels: 0, apparaten: 0, online: false });
    expect(zonder.find((x) => x.key === "horeca-tafels")?.done).toBe(true);
    const met = horecaStappen({ menuItems: 5, adresEnTelefoon: true, modules: ["bestellen"], tafels: 0, apparaten: 0, online: false });
    expect(met.find((x) => x.key === "horeca-tafels")?.done).toBe(false);
    expect(met.map((x) => x.key)).toEqual(["horeca-menukaart", "horeca-gegevens", "horeca-modules", "horeca-tafels", "horeca-scherm", "horeca-online"]);
    expect(horecaStappen({ menuItems: 0, modules: [], online: false }).find((x) => x.key === "horeca-modules")?.done).toBe(false);
  });

  it("rijschool: zes stappen zoals het overzicht van het beheer", () => {
    const s = rijschoolStappen({ pakketten: 2, werktijden: true, voertuigen: 0, kvkEnAdres: true, werkgebied: false, online: false });
    expect(s.map((x) => [x.key, x.done])).toEqual([
      ["rijschool-pakketten", true],
      ["rijschool-werktijden", true],
      ["rijschool-auto", false],
      ["rijschool-gegevens", true],
      ["rijschool-werkgebied", false],
      ["rijschool-online", false],
    ]);
  });

  it("een scherm dat maar een deel kent (het startscherm) krijgt alleen de stappen die het kan afvinken", () => {
    expect(horecaStappen({ menuItems: 2, modules: ["bestellen"], tafels: 0, online: true }).map((x) => x.key)).toEqual(["horeca-menukaart", "horeca-modules", "horeca-tafels", "horeca-online"]);
    expect(rijschoolStappen({ online: true }).map((x) => x.key)).toEqual(["rijschool-online"]);
    expect(webshopStappen({ actieveProducten: 0, online: false }).map((x) => x.key)).toEqual(["webshop-product", "webshop-online"]);
  });

  it("past in de gedeelde voortgangskaart: optionele stappen tellen niet mee", () => {
    const v = berekenVoortgang(websiteStappen({ paginas: 2, logo: true, contactKlaar: true, online: true, eigenDomein: false }));
    expect(v).toMatchObject({ klaar: true, done: 4, total: 4 });
    expect(v.open.map((s) => s.key)).toEqual(["website-domein"]);
  });
});
