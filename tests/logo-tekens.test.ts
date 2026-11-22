import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leesLetterMaten, maakMeter, schatMeter } from "@/lib/advertentie/letter-maat";
import { VOLUIT_TOT, logoBoom2, merkwoord } from "@/lib/logo/ontwerp2";
import { RijVol, maakRij } from "@/lib/advertentie/render-rij";
import { BRANCHES, LOGO_AANTAL, SFEER_SJABLONEN, SFEREN, SJABLONEN, VARIANT_IDS, logoAantal, logoBesluit, logoVrij, type Logo, type LogoNr } from "@/lib/logo/regels";
import { logosVan, sjablonenVan } from "@/lib/logo/sjablonen";
import { heeftTeken, tekenNamen, tekenVerhouding } from "@/lib/logo/tekens";
import { BRANCHE_TEKENS, SFEER_TEKENS, TREFWOORDEN, kiesTekens, past, tekensUitTekst } from "@/lib/logo/tekens/trefwoorden";

// Logo maker versie 2: negen logo's per aanvraag, per sfeer een eigen set, met tekens uit een open bibliotheek die bij de
// woorden van het bedrijf passen. De watermerkbeslissing blijft even streng (zie ook tests/logo-maker.test.ts).

const ROOT = join(__dirname, "..");
const basis = { naam: "Urban Wolf", branche: "kleding", kleur: "rood", sfeer: "streetwear" } as const;

describe("de tekens (lib/logo/tekens)", () => {
  it("staan in de repo, met licentie en bron, en zijn niet te groot", () => {
    const map = join(ROOT, "lib", "logo", "tekens");
    expect(tekenNamen().length).toBeGreaterThanOrEqual(300);
    expect(statSync(join(map, "phosphor-fill.json")).size).toBeLessThan(300_000);
    expect(readFileSync(join(map, "LICENSE-phosphor.txt"), "utf8")).toMatch(/^MIT License/);
    const leesmij = readFileSync(join(map, "README.md"), "utf8");
    expect(leesmij).toContain("phosphor-icons/core");
    expect(leesmij).toContain("MIT");
    for (const naam of ["bicycle", "crown", "lightning", "mountains", "bread", "scissors"]) {
      expect(heeftTeken(naam), naam).toBe(true);
      expect(tekenVerhouding(naam)).toBeGreaterThan(0.3);
    }
    expect(heeftTeken("constructor")).toBe(false);
  });

  it("elke naam in de trefwoorden, per soort bedrijf en per sfeer bestaat", () => {
    const namen = [...TREFWOORDEN.map(([teken]) => teken), ...Object.values(BRANCHE_TEKENS).flat(), ...Object.values(SFEER_TEKENS).flat(), "star-four", "sparkle", "hexagon"];
    expect(namen.filter((n) => !heeftTeken(n))).toEqual([]);
    for (const b of BRANCHES) expect(Object.hasOwn(BRANCHE_TEKENS, b.id), b.id).toBe(true);
    for (const s of SFEREN) expect((SFEER_TEKENS[s.id] ?? []).length, s.id).toBe(3);
  });

  it("vindt het teken bij de woorden van het bedrijf, Nederlands en Engels", () => {
    const eerste = (naam: string, slogan?: string) => tekensUitTekst(naam, slogan)[0];
    expect(eerste("Fietsenmaker Van Dijk")).toBe("bicycle");
    expect(eerste("Bakkerij De Korenbloem")).toBe("bread");
    expect(eerste("Kapsalon Noor")).toBe("scissors");
    expect(eerste("Schildersbedrijf Jansen")).toBe("paint-roller");
    expect(eerste("Royal Kings")).toBe("crown");
    expect(eerste("Noordkaap", "Outdoor gear")).toBe("compass-rose");
    expect(eerste("Thunder Gym")).toBe("lightning");
    expect(eerste("Koffiebar Zuid")).toBe("coffee");
    expect(eerste("Hondenuitlaatservice Max")).toBe("dog");
    expect(eerste("Studio Lente")).toBe("aperture");
    // korte stammen moeten het hele woord zijn: geen ei bij "eigen", geen schild bij "schilder", geen vis bij "visie"
    expect(tekensUitTekst("Eigen Visie")).not.toContain("egg");
    expect(tekensUitTekst("Eigen Visie")).not.toContain("fish");
    expect(tekensUitTekst("Schildersbedrijf")).not.toContain("shield-star");
    expect(tekensUitTekst("Xqz")).toEqual([]);
  });

  it("zonder treffer volgt het teken de soort bedrijf en dan de sfeer; een kledingmerk krijgt het teken van zijn sfeer", () => {
    expect(kiesTekens({ naam: "Xqz", branche: "bouw", sfeer: "strak" })).toEqual({ tekens: ["hammer", "buildings", "hard-hat"], eigen: false, eigenAantal: 0 });
    expect(kiesTekens({ naam: "Xqz", branche: "kleding", sfeer: "gothic" })).toEqual({ tekens: ["crown", "sword", "skull"], eigen: false, eigenAantal: 0 });
    expect(kiesTekens({ naam: "Xqz", branche: "anders", sfeer: "luxe" }).tekens[0]).toBe("sparkle");
    const fiets = kiesTekens({ naam: "Fietsenmaker Van Dijk", branche: "techniek", sfeer: "strak" });
    expect(fiets.eigen).toBe(true);
    expect(fiets.tekens[0]).toBe("bicycle");
    expect(new Set(fiets.tekens).size).toBe(3);
  });

  it("geen scherm van de browser bereikt de tekengegevens of de lettertypecode, ook niet via een omweg", () => {
    // alle bronbestanden met hun (niet type-only) imports
    const alle: string[] = [];
    const loop = (map: string) => {
      for (const naam of readdirSync(map)) {
        const pad = join(map, naam);
        if (statSync(pad).isDirectory()) {
          if (naam !== "node_modules" && !naam.startsWith(".")) loop(pad);
        } else if (/\.(ts|tsx)$/.test(naam) && !naam.endsWith(".d.ts")) alle.push(pad);
      }
    };
    for (const m of ["app", "components", "lib"]) loop(join(ROOT, m));
    const bestaat = new Set(alle);
    const los = (basis: string): string | undefined => [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts"), join(basis, "index.tsx")].find((p) => bestaat.has(p) || (p.endsWith(".json") && existsSync(p)));
    const importsVan = (bestand: string): string[] => {
      const bron = readFileSync(bestand, "utf8");
      const uit: string[] = [];
      for (const m of bron.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;"]*?from\s+"([^"]+)"|import\(\s*"([^"]+)"\s*\)|(?:^|\n)\s*import\s+"([^"]+)"/g)) {
        const doel = m[1] ?? m[2] ?? m[3] ?? "";
        const basis = doel.startsWith("@/") ? join(ROOT, doel.slice(2)) : doel.startsWith(".") ? join(bestand, "..", doel) : "";
        const gevonden = basis ? los(basis) : undefined;
        if (gevonden) uit.push(gevonden);
      }
      return uit;
    };
    const verboden = new Set(
      [["lib", "logo", "tekens", "index.ts"], ["lib", "logo", "tekens", "phosphor-fill.json"], ["lib", "logo", "tekens", "trefwoorden.ts"], ["lib", "logo", "sjablonen.ts"], ["lib", "logo", "ontwerp.ts"], ["lib", "logo", "ontwerp2.ts"], ["lib", "logo", "vormen.ts"], ["lib", "advertentie", "ontwerp.ts"], ["lib", "advertentie", "beeld.ts"], ["lib", "advertentie", "letter-maat.ts"]].map((p) => join(ROOT, ...p)),
    );
    const graaf = new Map(alle.map((b) => [b, importsVan(b)]));
    const bereikt = (start: string): string | null => {
      const gezien = new Set([start]);
      const rij = [start];
      while (rij.length) {
        const nu = rij.pop()!;
        for (const volgende of graaf.get(nu) ?? (verboden.has(nu) ? [] : [])) {
          if (verboden.has(volgende)) return `${nu} → ${volgende}`;
          if (!gezien.has(volgende)) {
            gezien.add(volgende);
            rij.push(volgende);
          }
        }
      }
      return null;
    };
    const schermen = alle.filter((b) => /^\s*["']use client["']/.test(readFileSync(b, "utf8").slice(0, 300)));
    expect(schermen.length).toBeGreaterThan(50);
    const lek = schermen.map((b) => bereikt(b)).filter(Boolean);
    expect(lek).toEqual([]);
    // en de bestanden die het scherm wél laadt, noemen de verboden bestanden niet
    // (components/marketing/studio/Mockups.tsx is op 22 nov 2026 weggehaald)
    for (const p of [["lib", "logo", "regels.ts"], ["lib", "advertentie", "regels.ts"]]) expect(importsVan(join(ROOT, ...p)).filter((i) => verboden.has(i)), p.join("/")).toEqual([]);
  });
});

describe("negen logo's per aanvraag", () => {
  it("elke sfeer heeft negen verschillende sjablonen die bestaan", () => {
    for (const s of SFEREN) {
      const lijst = SFEER_SJABLONEN[s.id];
      expect(lijst.length, s.id).toBe(LOGO_AANTAL);
      expect(new Set(lijst).size, s.id).toBe(LOGO_AANTAL);
      for (const id of lijst) expect(Object.hasOwn(SJABLONEN, id), id).toBe(true);
    }
  });

  it("het negende is altijd het beeldmerk; met een eigen teken is het achtste het embleem", () => {
    expect(sjablonenVan({ naam: "Xqz", branche: "anders", sfeer: "sport" })[8]).toBe("teken");
    expect(sjablonenVan({ naam: "Xqz", branche: "anders", sfeer: "sport" })).not.toContain("embleem");
    const fiets = sjablonenVan({ naam: "Fietsenmaker Van Dijk", branche: "techniek", sfeer: "sport" });
    expect(fiets[7]).toBe("embleem");
    expect(new Set(fiets).size).toBe(9);
    expect(logosVan({ versie: 2, invoer: basis }).map((l) => l.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // een aanvraag van vóór versie 2 houdt zijn zes logo's
    expect(logosVan({ invoer: basis }).length).toBe(6);
    expect(logoAantal({})).toBe(6);
    expect(logoAantal({ versie: 2 })).toBe(9);
  });

  it("een korte naam is het merkwoord, een lange wordt een afkorting", () => {
    expect(merkwoord("NOVA")).toBe("NOVA");
    expect(merkwoord("Royal Kings")).toBe("Royal Kings");
    expect(merkwoord("Schildersbedrijf Van der Westhuizen")).toBe("SW");
    // tot 24 tekens voluit (boven de twaalf in twee regels): geen vel vol tweeletterlogo's
    expect(merkwoord("Kapsalon Noor")).toBe("Kapsalon Noor");
    expect(merkwoord("Fietsenmaker Van Dijk")).toBe("Fietsenmaker Van Dijk");
    expect(merkwoord("Bakkerij De Korenbloem")).toBe("Bakkerij De Korenbloem");
    expect(merkwoord("Jansen & Zonen Installatietechniek")).toBe("JZI");
    expect(merkwoord("Arbeidsongeschiktheidsverzekering")).toBe("A");
    expect(VOLUIT_TOT).toBe(24);
  });

  it("vaste vormen staan alleen in de sferen waar ze thuishoren, niet bij een ambachtsbedrijf", () => {
    const mag: Record<string, string[]> = { berg: ["outdoor"], berg2: ["outdoor"], bol: ["techno", "streetwear"], vleugels: ["sport", "gothic"] };
    for (const s of SFEREN) for (const [vorm, sferen] of Object.entries(mag)) if (!sferen.includes(s.id)) expect(SFEER_SJABLONEN[s.id], `${vorm} in ${s.id}`).not.toContain(vorm);
    // een schildersbedrijf (sfeer stoer, soort bouw): geen bergtop, en het tweede teken is niet de hamer van de bouw
    const schilder = { naam: "Schildersbedrijf Kwast", branche: "bouw", sfeer: "stoer" } as const;
    expect(sjablonenVan(schilder).some((id) => id === "berg" || id === "berg2")).toBe(false);
    expect(kiesTekens(schilder)).toMatchObject({ tekens: ["paint-roller", "hammer", "buildings"], eigen: true, eigenAantal: 1 });
    const naast = JSON.stringify(logoBoom2((sjablonenVan(schilder).indexOf("bliksem") + 1) as LogoNr, { ...schilder, kleur: "blauw" }, { soort: "thema", thema: "donker" }, 300, false, schatMeter).boom);
    const pad = (naam: string) => (JSON.parse(readFileSync(join(ROOT, "lib", "logo", "tekens", "phosphor-fill.json"), "utf8")) as Record<string, { d: string }>)[naam]!.d.slice(0, 40);
    expect(naast).toContain(pad("paint-roller"));
    expect(naast).not.toContain(pad("hammer"));
    // twee tekens uit de eigen woorden: dan mag het tweede wel
    expect(kiesTekens({ naam: "Bakkerij Koffiehuis", branche: "anders", sfeer: "strak" }).eigenAantal).toBe(2);
  });

  it("hooguit drie van de negen logo's zijn een monogram", () => {
    const monogram = ["strepen", "kroon", "vleugels", "lauwer", "cirkel"];
    for (const s of SFEREN) expect(SFEER_SJABLONEN[s.id].filter((id) => monogram.includes(id)).length, s.id).toBeLessThanOrEqual(3);
  });

  it("het vierkante icoon toont het teken bij een logo met een teken, anders de letters", () => {
    const fiets = { naam: "Fietsenmaker Van Dijk", branche: "techniek", kleur: "groen", sfeer: "sport" } as const;
    const set = sjablonenVan(fiets);
    const icoon = (nr: number) => JSON.stringify(logoBoom2(nr as LogoNr, fiets, { soort: "variant", variant: "icoon" }, 256, false, schatMeter).boom);
    expect(icoon(set.indexOf("teken") + 1)).toContain('"type":"path"');
    expect(icoon(set.indexOf("embleem") + 1)).toContain("viewBox");
    expect(icoon(set.indexOf("strepen") + 1)).toContain('"FD"');
    expect(icoon(set.indexOf("strepen") + 1)).not.toContain("viewBox");
  });

  it("elk logo van elke sfeer geeft een boom, op elke ondergrond en met een lange, korte en vreemde naam", () => {
    for (const s of SFEREN) {
      for (const naam of ["Jo", "Urban Wolf", "Schildersbedrijf Van der Westhuizen & Zonen", "Café Zoë 24/7"]) {
        for (let nr = 1; nr <= 9; nr++) {
          expect(() => logoBoom2(nr as LogoNr, { naam, slogan: "Sinds jaar en dag", branche: "bouw", kleur: "blauw", sfeer: s.id }, { soort: "thema", thema: "donker" }, 200, true, schatMeter), `${s.id} ${nr} ${naam}`).not.toThrow();
        }
      }
    }
    for (const v of VARIANT_IDS) expect(() => logoBoom2(3, basis, { soort: "variant", variant: v }, 200, false, schatMeter)).not.toThrow();
    const stijl = (og: Parameters<typeof logoBoom2>[2]) => (logoBoom2(1, basis, og, 200, false, schatMeter).boom.props as { style: { background?: string } }).style.background;
    expect(stijl({ soort: "thema", thema: "donker" })).toBe("#0B0B0C");
    expect(stijl({ soort: "thema", thema: "licht" })).toBe("#FFFFFF");
    expect(stijl({ soort: "variant", variant: "kleur-wit" })).toBe("#FFFFFF");
    for (const v of ["kleur", "wit", "zwart"] as const) expect(stijl({ soort: "variant", variant: v }), v).toBeUndefined();
    expect(logoBoom2(1, basis, { soort: "variant", variant: "icoon" }, 256, false, schatMeter)).toMatchObject({ breedte: 256, hoogte: 256 });
    expect(JSON.stringify(logoBoom2(1, basis, { soort: "thema", thema: "donker" }, 200, true, schatMeter).boom)).toContain("VOORBEELD");
  });
});

describe("het voorbeeld van versie 2: ondergrond kiezen verandert niets aan de bescherming", () => {
  const rij = (status: Logo["status"], gekozen?: LogoNr): Pick<Logo, "status" | "aanvraag" | "versie"> => ({ versie: 2, status, ...(gekozen ? { aanvraag: { logo: gekozen, naam: "Test", email: "test@voorbeeld.test", op: "2026-11-19T10:00:00.000Z" } } : {}) });

  it("niet vrijgegeven: klein en met watermerk op elke ondergrond, wat er ook gevraagd wordt", () => {
    for (const thema of ["donker", "licht", "kleur", undefined] as const) {
      for (const variant of VARIANT_IDS) {
        for (let nr = 1; nr <= 9; nr++) {
          expect(logoBesluit({ logo: rij("aangevraagd", 3), nr: nr as LogoNr, beheerder: false, variant, thema })).toEqual({ watermerk: true, thema: thema ?? "donker", variant: "kleur-wit", breedte: 400, hoogte: 300 });
        }
      }
    }
  });

  it("vrijgegeven: alleen het gekozen logo is schoon; de andere acht houden hun watermerk", () => {
    const vrij = rij("vrijgegeven", 8);
    expect(logoBesluit({ logo: vrij, nr: 8, beheerder: false, variant: "wit", thema: "licht" })).toEqual({ watermerk: false, thema: null, variant: "wit", breedte: 2400, hoogte: 1800 });
    for (const nr of [1, 2, 3, 4, 5, 6, 7, 9] as LogoNr[]) expect(logoBesluit({ logo: vrij, nr, beheerder: false, variant: "kleur" }).watermerk, String(nr)).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => logoVrij(vrij, n as LogoNr))).toEqual([8]);
  });

  it("de route weigert een nummer buiten de set van de aanvraag en houdt het geheugen per ondergrond apart", () => {
    const route = readFileSync(join(ROOT, "app", "api", "logo-maker", "[id]", "beeld", "route.ts"), "utf8");
    expect(route).toContain("nr > logoAantal(logo)");
    expect(route).toContain("`logo:${id}:${nr}:${besluit.thema ?? \"v1\"}`");
    expect(readFileSync(join(ROOT, "lib", "logo", "store.ts"), "utf8")).toContain("aanvraag.logo > logoAantal(logo)");
  });
});

describe("de breedte van tekst uit het lettertype", () => {
  it("leest de maten uit een TTF en meet een woord", () => {
    const map = join(ROOT, "public", "fonts", "advertentie");
    expect(existsSync(join(map, "Kanit-BlackItalic.ttf"))).toBe(true);
    const kanit = leesLetterMaten(readFileSync(join(map, "Kanit-BlackItalic.ttf")));
    const meet = maakMeter({ Kanit: kanit });
    const w = meet("Kanit", "NOVA");
    expect(w).toBeGreaterThan(2);
    expect(w).toBeLessThan(3.6);
    expect(meet("Kanit", "II")).toBeLessThan(meet("Kanit", "WW"));
    // een teken dat het lettertype niet heeft en een onbekend lettertype tellen als een gemiddelde letter
    expect(meet("Kanit", "\u{4E2D}")).toBe(0.6);
    expect(meet("Bestaat niet", "ab")).toBe(1.2);
    expect(kanit.tekens.has(0x41)).toBe(true);
  });
});

describe("trefwoorden: liever geen teken dan een fout teken", () => {
  // gemeten missers (19 nov 2026): de naam en de tekens die er NIET bij mogen komen
  const MISSERS: [naam: string, fout: string[], slogan?: string][] = [
    ["Van den Berg Bouw", ["tree-evergreen", "mountains"]],
    ["Utrechtse Klusservice", ["scales"]],
    ["Klusbedrijf Utrecht", ["scales"]],
    ["Barbier Barendrecht", ["bird", "scales"]],
    ["Haarlem Bouw", ["scissors"]],
    ["Helmond Sport", ["hard-hat"]],
    ["Gelderse Bouw", ["coins"]],
    ["Opleidingscentrum Zuid", ["pipe"]],
    ["Begeleiding en Coaching", ["pipe"]],
    ["Interieur Design", ["globe-hemisphere-west"]],
    ["Wintersport Shop", ["globe-hemisphere-west"]],
    ["Versteeg Bouw", ["carrot"]],
    ["Personal Trainer Jan", ["newspaper"]],
    ["Ramen en Deuren Jansen", ["bowl-food"]],
    ["Kunststof Kozijnen", ["paint-brush"]],
    ["Modern Wonen", ["t-shirt"]],
    ["Videoproductie Zuid", ["factory"]],
    ["Kantoorruimte Utrecht", ["rocket-launch"]],
    ["Bootcamp Rotterdam", ["sailboat"]],
    ["Brillen Jansen", ["diamond"]],
    ["Bowlingcentrum Oost", ["bowl-food"]],
    ["Preventie Advies", ["balloon"]],
    ["Dakdekker Jansen", ["hand-heart"], "Wij zorgen voor een dicht dak"],
  ];

  it("geen van de gemeten missers geeft nog het foute teken", () => {
    for (const [naam, fout, slogan] of MISSERS) {
      const gevonden = tekensUitTekst(naam, slogan);
      for (const f of fout) expect(gevonden, `${naam} → ${gevonden.join(", ")}`).not.toContain(f);
    }
  });

  it("waar een goed teken voor de hand ligt, komt dat teken", () => {
    const goed: [string, string[]][] = [
      ["Van den Berg Bouw", ["hammer", "buildings", "hard-hat"]],
      ["Haarlem Bouw", ["hammer", "buildings", "hard-hat"]],
      ["Gelderse Bouw", ["hammer", "buildings", "hard-hat"]],
      ["Versteeg Bouw", ["hammer", "buildings", "hard-hat"]],
      ["Utrechtse Klusservice", ["hammer"]],
      ["Klusbedrijf Utrecht", ["hammer"]],
      ["Barbier Barendrecht", ["scissors"]],
      ["Kapsalon Noor", ["scissors"]],
      ["Fietsenmaker Van Dijk", ["bicycle"]],
      ["Brillen Jansen", ["eyeglasses"]],
      ["Wintersport Shop", ["person-simple-ski"]],
      ["Bootcamp Rotterdam", ["barbell"]],
      ["Dakdekker Jansen", ["house-line"]],
      ["Kunststof Kozijnen", ["door"]],
    ];
    for (const [naam, verwacht] of goed) expect(verwacht, `${naam} → ${tekensUitTekst(naam).join(", ")}`).toContain(tekensUitTekst(naam)[0]);
  });

  it("tien gewone gevallen blijven goed", () => {
    const eerste: [string, string][] = [
      ["Bakkerij Zonnekorst", "bread"],
      ["Banketbakker Smit", "bread"],
      ["Bloemist Roos", "flower-tulip"],
      ["Autogarage Pieters", "car-profile"],
      ["Schildersbedrijf Kwast", "paint-roller"],
      ["Hoveniersbedrijf Groen", "plant"],
      ["Tandartspraktijk Wit", "tooth"],
      ["Koffiebar Zwart", "coffee"],
      ["Loodgieter Druppel", "drop"],
      ["Royal Kings", "crown"],
      ["Thunder Gym", "lightning"],
      ["Rijschool Voorrang", "car-profile"],
    ];
    for (const [naam, teken] of eerste) expect(tekensUitTekst(naam)[0], naam).toBe(teken);
  });

  it("een stam is standaard een heel woord; ruimer alleen met *, + of een samenstelling", () => {
    expect(past("recht", "recht")).toBe(true);
    expect(past("utrecht", "recht")).toBe(false);
    expect(past("fietsenmaker", "fiets*")).toBe(true);
    expect(past("woningbouw", "*bouw")).toBe(true);
    expect(past("bouw", "*bouw")).toBe(false);
    expect(past("bloemen", "bloem+")).toBe(true);
    expect(past("bloemkool", "bloem+")).toBe(false);
    expect(past("zorgen", "zorg")).toBe(false);
    // plaatsnamen en het naamdeel na "van den" tellen niet
    expect(tekensUitTekst("Bergen")).toEqual([]);
    expect(tekensUitTekst("Ter Horst en Van der Molen")).toEqual([]);
    expect(tekensUitTekst("Bakker Jan")[0]).toBe("bread");
    // een advertentie kijkt alleen naar de bedrijfsnaam
    expect(readFileSync(join(ROOT, "lib", "advertentie", "beeld.ts"), "utf8")).toContain("tekensUitTekst(ad.invoer.bedrijf)[0]");
  });
});

describe("renderkosten: een wachtrij en een grens op nieuwe beelden", () => {
  const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("laat hooguit twee renders tegelijk lopen en geeft de plek door aan wie wacht", async () => {
    const rij = maakRij(2, 2000);
    let bezig = 0;
    let meest = 0;
    const taak = (n: number) =>
      rij(async () => {
        bezig++;
        meest = Math.max(meest, bezig);
        await wacht(20);
        bezig--;
        return n;
      });
    expect(await Promise.all([1, 2, 3, 4, 5, 6, 7].map(taak))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(meest).toBe(2);
    expect(bezig).toBe(0);
    // daarna is de rij weer vrij, ook na een taak die mislukt
    await expect(rij(() => Promise.reject(new Error("stuk")))).rejects.toThrow("stuk");
    expect(await rij(() => Promise.resolve("ok"))).toBe("ok");
  });

  it("wie te lang wacht krijgt RijVol, en blokkeert de rij daarna niet", async () => {
    const rij = maakRij(1, 30);
    const lang = rij(() => wacht(120).then(() => "klaar"));
    await expect(rij(() => Promise.resolve("te laat"))).rejects.toBeInstanceOf(RijVol);
    expect(await lang).toBe("klaar");
    expect(await rij(() => Promise.resolve("weer vrij"))).toBe("weer vrij");
  });

  it("de beeldroutes tellen alleen missers van het geheugen en geven bij drukte een 503, nooit een 403", () => {
    for (const [pad, soort] of [[["app", "api", "advertentie", "[id]", "beeld", "route.ts"], "advertentie"], [["app", "api", "logo-maker", "[id]", "beeld", "route.ts"], "logo"]] as const) {
      const route = readFileSync(join(ROOT, ...pad), "utf8");
      // de teller staat IN de functie die alleen bij een misser draait
      expect(route, soort).toMatch(new RegExp(`watermerkBeeld\\([^\\n]*async \\(\\) => \\{[\\s\\S]{0,160}await telRender\\("${soort}", ip\\);`));
      expect(route, soort).toContain("beeldFout(err)");
      expect(route, soort).not.toMatch(/AppError\.forbidden|status: 403/);
    }
    const antwoord = readFileSync(join(ROOT, "lib", "advertentie", "beeld-antwoord.ts"), "utf8");
    expect(antwoord).toContain("status: 503");
    expect(antwoord).toContain('"Retry-After"');
    expect(antwoord).toContain("limit: RENDER_PER_IP");
    expect(readFileSync(join(ROOT, "lib", "advertentie", "beeld.ts"), "utf8")).toContain("renderRij(() => new ImageResponse(");
  });
});