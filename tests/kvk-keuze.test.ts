import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enterKiest, gekozenDelen, gekozenTekst, KVK_ZOEKER_TEKSTEN_EN, KVK_ZOEKER_TEKSTEN_NL, kvkTekstenVoor, pijlRij, type ActiefBron } from "@/lib/kvk/keuze";
import { keuzeLabel } from "@/lib/kvk/formulier";

// 23 nov 2026 (eigenaar): bij het aanmelden van een bedrijf kreeg hij een echte stichting in zijn bedrijf zonder dat hij dat bewust
// koos. Een rij in het zoekveld werd actief door er met de muis overheen te gaan, en Enter koos de actieve rij: Enter terwijl de muis
// toevallig boven een rij stond, koos die rij. Nu kiest Enter alleen een rij die met de pijltjestoetsen is geselecteerd, en na elke
// keuze staat er "Gekozen: <naam> · KVK <nummer> · <plaats>" met een knop "Niet jouw bedrijf? Kies opnieuw".

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("Enter kiest alleen een rij die met de pijltjestoetsen is geselecteerd", () => {
  it("een rij met de pijltjestoetsen geselecteerd: Enter kiest hem", () => {
    expect(enterKiest({ open: true, actief: 2, bron: "toets", aantal: 5 })).toBe(2);
    expect(enterKiest({ open: true, actief: 0, bron: "toets", aantal: 1 })).toBe(0);
  });

  it("een rij die alleen onder de muis staat: Enter kiest niets (het geval van de eigenaar)", () => {
    expect(enterKiest({ open: true, actief: 1, bron: "muis", aantal: 5 })).toBeNull();
  });

  it("geen rij geselecteerd, een gesloten lijst of een rij die er niet (meer) is: Enter kiest niets", () => {
    expect(enterKiest({ open: true, actief: -1, bron: null, aantal: 5 })).toBeNull();
    expect(enterKiest({ open: true, actief: -1, bron: "toets", aantal: 5 })).toBeNull();
    expect(enterKiest({ open: true, actief: 5, bron: "toets", aantal: 5 })).toBeNull();
    expect(enterKiest({ open: true, actief: 0, bron: "toets", aantal: 0 })).toBeNull();
    expect(enterKiest({ open: false, actief: 2, bron: "toets", aantal: 5 })).toBeNull();
  });

  it("de pijltjestoetsen lopen rondom de lijst", () => {
    expect(pijlRij(-1, 3, true)).toBe(0);
    expect(pijlRij(0, 3, true)).toBe(1);
    expect(pijlRij(2, 3, true)).toBe(0);
    expect(pijlRij(-1, 3, false)).toBe(2);
    expect(pijlRij(0, 3, false)).toBe(2);
    expect(pijlRij(2, 3, false)).toBe(1);
    expect(pijlRij(0, 0, true)).toBe(-1);
  });

  it("de volgorde van het toetsenbord en de muis: de laatste invoer telt", () => {
    // zoals het veld de stand bijhoudt: een pijl zet bron "toets", beweging van de muis zet bron "muis", een nieuwe lijst wist beide
    let actief = -1;
    let bron: ActiefBron | null = null;
    const aantal = 4;
    const pijl = (omlaag: boolean) => {
      actief = pijlRij(actief, aantal, omlaag);
      bron = "toets";
    };
    const muis = (i: number) => {
      actief = i;
      bron = "muis";
    };
    const enter = () => enterKiest({ open: true, actief, bron, aantal });

    muis(2); // de muis staat toevallig boven een rij
    expect(enter()).toBeNull();
    pijl(true); // de bezoeker gebruikt het toetsenbord: nu telt de rij van de pijl
    expect(actief).toBe(3);
    expect(enter()).toBe(3);
    muis(1); // de muis beweegt weer: Enter kiest niets
    expect(enter()).toBeNull();
    pijl(false);
    expect(enter()).toBe(0);
  });
});

describe("de bevestiging na een keuze", () => {
  const acme = { name: "Acme B.V.", kvkNumber: "12345678", city: "Utrecht" };

  it('zegt "Gekozen: <naam> · KVK <nummer> · <plaats>"', () => {
    expect(gekozenTekst(acme)).toBe("Gekozen: Acme B.V. · KVK 12345678 · Utrecht");
    expect(gekozenDelen(acme)).toBe("Acme B.V. · KVK 12345678 · Utrecht");
  });

  it("laat weg wat ontbreekt: een bedrijf uit OpenStreetMap heeft geen KVK-nummer, soms geen plaats", () => {
    expect(gekozenTekst({ name: "Bakkerij Jansen", kvkNumber: null, city: "Utrecht" })).toBe("Gekozen: Bakkerij Jansen · Utrecht");
    expect(gekozenTekst({ name: "Bakkerij Jansen", kvkNumber: null, city: null })).toBe("Gekozen: Bakkerij Jansen");
    expect(gekozenTekst({ name: "  Acme  ", kvkNumber: "12345678", city: "  " })).toBe("Gekozen: Acme · KVK 12345678");
  });

  it("neemt een naam met een dollarteken letterlijk over", () => {
    expect(gekozenTekst({ name: "Cash $& Carry $1", kvkNumber: null, city: null })).toBe("Gekozen: Cash $& Carry $1");
  });

  it("is er ook in het Engels", () => {
    expect(gekozenTekst(acme, KVK_ZOEKER_TEKSTEN_EN.gekozen)).toBe("Chosen: Acme B.V. · KVK 12345678 · Utrecht");
    expect(KVK_ZOEKER_TEKSTEN_EN.kiesOpnieuw).toBe("Not your company? Choose again");
  });

  it('heeft de knop "Niet jouw bedrijf? Kies opnieuw"', () => {
    expect(KVK_ZOEKER_TEKSTEN_NL.kiesOpnieuw).toBe("Niet jouw bedrijf? Kies opnieuw");
  });

  it("het label onder de bevestiging volgt de taal en blijft in het Nederlands zoals het was", () => {
    const register = { kvkNumber: "12345678", name: "Acme", city: null, legalForm: null, street: null, houseNumber: null, postalCode: null, vatNumber: null, source: "register" as const, active: true };
    expect(keuzeLabel(register)).toEqual({ tekst: "Gevonden in het handelsregister", register: true });
    expect(keuzeLabel(register, { register: KVK_ZOEKER_TEKSTEN_EN.gevondenRegister, osm: KVK_ZOEKER_TEKSTEN_EN.gevondenOsm })).toEqual({ tekst: "Found in the trade register", register: true });
    expect(keuzeLabel({ ...register, kvkNumber: null, source: "osm" }, { register: "x", osm: "y" })).toEqual({ tekst: "y", register: false });
  });
});

describe("de teksten van het zoekveld (Nederlands en Engels)", () => {
  it("hebben in beide talen dezelfde sleutels, geen lege tekst en geen Nederlands in het Engels", () => {
    const sleutels = Object.keys(KVK_ZOEKER_TEKSTEN_NL).sort();
    expect(Object.keys(KVK_ZOEKER_TEKSTEN_EN).sort()).toEqual(sleutels);
    for (const k of sleutels as (keyof typeof KVK_ZOEKER_TEKSTEN_NL)[]) {
      expect(KVK_ZOEKER_TEKSTEN_NL[k].trim().length, `nl ${k}`).toBeGreaterThan(2);
      expect(KVK_ZOEKER_TEKSTEN_EN[k].trim().length, `en ${k}`).toBeGreaterThan(2);
      expect(KVK_ZOEKER_TEKSTEN_EN[k], k).not.toBe(KVK_ZOEKER_TEKSTEN_NL[k]);
    }
    expect(KVK_ZOEKER_TEKSTEN_NL.gekozen).toContain("{bedrijf}");
    expect(KVK_ZOEKER_TEKSTEN_EN.gekozen).toContain("{bedrijf}");
    expect(KVK_ZOEKER_TEKSTEN_NL.aantal).toContain("{n}");
    expect(KVK_ZOEKER_TEKSTEN_EN.aantal).toContain("{n}");
  });

  it("Engels alleen voor en, anders de Nederlandse standaard", () => {
    expect(kvkTekstenVoor("en")).toBe(KVK_ZOEKER_TEKSTEN_EN);
    expect(kvkTekstenVoor("nl")).toBe(KVK_ZOEKER_TEKSTEN_NL);
    expect(kvkTekstenVoor("pl")).toBe(KVK_ZOEKER_TEKSTEN_NL);
  });
});

describe("KvkZoeker (bron-controle)", () => {
  const zoeker = lees("components/kvk/KvkZoeker.tsx");

  it("Enter kiest via enterKiest en niet meer de rij die toevallig actief is", () => {
    expect(zoeker).toContain("enterKiest({ open, actief, bron: actiefBron, aantal: resultaten.length })");
    expect(zoeker).not.toContain("resultaten[actief]");
    expect(zoeker).toContain('setActiefBron("toets")');
  });

  it("een rij onder de muis wordt alleen gemarkeerd (onMouseMove, bron muis), en telt niet voor de schermlezer", () => {
    expect(zoeker).toContain("onMouseMove={");
    expect(zoeker).not.toContain("onMouseEnter");
    expect(zoeker).toContain('setActiefBron("muis")');
    expect(zoeker).toContain("aria-selected={toetsActief && i === actief}");
    expect(zoeker).toContain('toonLijst && toetsActief ? { "aria-activedescendant"');
  });

  it("na een keuze staat er wat er gekozen is, met een knop die de keuze wist, het veld leegt en onWis aanroept", () => {
    expect(zoeker).toContain("gekozenTekst(gekozen, teksten.gekozen)");
    expect(zoeker).toContain("onClick={kiesOpnieuw}");
    expect(zoeker).toContain("{teksten.kiesOpnieuw}");
    const functie = zoeker.slice(zoeker.indexOf("function kiesOpnieuw()"), zoeker.indexOf("async function kies("));
    for (const stuk of ["setGekozen(null);", 'zetTekst("");', "wisIngevuld();", "onWis?.();", "invoerRef.current?.focus();", "keuzeNummer.current += 1;"]) {
      expect(functie, stuk).toContain(stuk);
    }
    // wat het formulier van de keuze overnam, gaat er alleen uit als de bezoeker er zelf niets aan veranderde
    expect(zoeker).toContain("el.value === waarde");
  });

  it("het veld blijft zonder keuze bruikbaar als vrije tekst: Enter zonder pijl voorkomt niets en kiest niets", () => {
    const enter = zoeker.slice(zoeker.indexOf('e.key === "Enter"'), zoeker.indexOf('e.key === "Escape"'));
    expect(enter).toContain("if (gekozenRij) {");
    expect(enter.indexOf("e.preventDefault()")).toBeGreaterThan(enter.indexOf("if (gekozenRij) {"));
    expect(zoeker).toContain("zetTekst(e.target.value);");
  });

  it("geen vaste tekst in het onderdeel zelf (alles uit de teksten), en client-veilig", () => {
    expect(zoeker).not.toMatch(/Niet jouw bedrijf|Gekozen:|Kies opnieuw|Chosen:/);
    expect(zoeker).not.toMatch(/@\/lib\/(prisma|storage\/kv|mail)|from "zod"/);
    expect(zoeker).not.toMatch(/useEffect\(\(\) => (kies|haal|wis|zet)/);
  });

  it("het aanmeldformulier en het venster 'Nog een paar laatste checks' geven de teksten in de taal van de pagina mee; het aanmeldformulier wist bij onWis", () => {
    const register = lees("components/auth/RegisterForm.tsx");
    expect(register).toContain("teksten={kvkTekstenVoor(locale)}");
    expect(register).toMatch(/onWis=\{\(\) => \{\s*setKvk\(""\);\s*setKvkViaZoeker\(false\);\s*\}\}/);
    // 23 nov 2026: de onboarding heeft geen KVK-zoeker meer (de controle komt pas bij het inplannen); het venster bij het inplannen wel
    expect(lees("components/app/EmployerOnboardingWizard.tsx")).not.toContain("KvkZoeker");
    const venster = lees("components/werkgever/LaatsteChecksVenster.tsx");
    expect(venster).toContain("const zoekTeksten = kvkTekstenVoor(locale);");
    expect(venster).toContain("teksten={zoekTeksten}");
    expect(venster).toContain("const { locale } = useI18n();");
  });

  it("de werkgeversbewaker voor vaste Nederlandse zinnen telt het onderdeel niet meer (basislijn verlaagd)", () => {
    expect(lees("tests/werkgever-taal-basislijn.json")).not.toContain("components/kvk/KvkZoeker.tsx");
  });
});
