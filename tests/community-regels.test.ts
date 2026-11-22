import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRENZEN,
  WELKOM,
  accountTeNieuw,
  alGemeld,
  controleerOnderwerp,
  controleerReactie,
  fotoSoort,
  idUitPad,
  isCategorie,
  isMeldReden,
  maakSlug,
  moetVerbergen,
  onderwerpPad,
  privegegevens,
  rolVoor,
  schoneTekst,
  schoneTitel,
  sorteerOnderwerpen,
  telLinks,
  telOp,
  tekstDelen,
  tellendeMeldingen,
  uittreksel,
  wanneer,
  weergaveNaam,
  type Melding,
  type Onderwerp,
} from "@/lib/community/regels";

// De pure regels van de community (lib/community/regels.ts, 22 nov 2026): controle van invoer, links, privégegevens,
// weergavenaam, adressen, de verbergregel bij meldingen, daggrenzen en tijden. De klok staat vast (AGENTS.md: geen tijdbommen).

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T14:30:00+01:00"));
});
afterEach(() => vi.useRealTimers());

const melding = (door: string, at: string): Melding => ({ id: door, door, reden: "spam", toelichting: "", at });

describe("invoer schoonmaken en controleren", () => {
  it("haalt stuurtekens en onzichtbare tekens weg en houdt hooguit één lege regel", () => {
    expect(schoneTekst("  hallo\r\n\r\n\r\n\r\nwereld​\u0007  ")).toBe("hallo\n\nwereld");
    expect(schoneTitel("  Een\n titel   met   spaties ")).toBe("Een titel met spaties");
  });

  it("een onderwerp: titel 5-120, tekst 10-5000, hooguit 4 foto's en een bekende categorie", () => {
    const goed = { titel: "Eerste dienst", tekst: "Hoe ging jouw eerste dienst?", categorie: "vragen", fotos: 0 };
    expect(controleerOnderwerp(goed)).toBeNull();
    expect(controleerOnderwerp({ ...goed, titel: "Hoi" })).toMatch(/te kort/);
    expect(controleerOnderwerp({ ...goed, titel: "x".repeat(GRENZEN.titelMax + 1) })).toMatch(/te lang/);
    expect(controleerOnderwerp({ ...goed, tekst: "Kort" })).toMatch(/te kort/);
    expect(controleerOnderwerp({ ...goed, tekst: "x".repeat(GRENZEN.tekstMax + 1) })).toMatch(/te lang/);
    expect(controleerOnderwerp({ ...goed, fotos: 5 })).toMatch(/hooguit 4/);
    expect(controleerOnderwerp({ ...goed, categorie: "constructor" })).toMatch(/Kies/);
  });

  it("een reactie: tekst 2-3000 en hooguit 2 foto's", () => {
    expect(controleerReactie({ tekst: "Ok", fotos: 0 })).toBeNull();
    expect(controleerReactie({ tekst: "x", fotos: 0 })).toMatch(/te kort/);
    expect(controleerReactie({ tekst: "x".repeat(GRENZEN.reactieMax + 1), fotos: 0 })).toMatch(/te lang/);
    expect(controleerReactie({ tekst: "Mooi zo", fotos: 3 })).toMatch(/hooguit 2/);
  });

  it("categorie en meldreden alleen uit de vaste lijst (Object.hasOwn: geen constructor of toString)", () => {
    expect(isCategorie("tips")).toBe(true);
    expect(isCategorie("constructor")).toBe(false);
    expect(isCategorie(undefined)).toBe(false);
    expect(isMeldReden("prive")).toBe(true);
    expect(isMeldReden("toString")).toBe(false);
  });
});

describe("links", () => {
  it("telt webadressen met http(s):// of www., niet een los woord met een punt", () => {
    expect(telLinks("Kijk op https://zekerflex.com en www.voorbeeld.nl.")).toBe(2);
    expect(telLinks("Dat was echt.Goed gedaan")).toBe(0);
    expect(telLinks("javascript:alert(1) en ftp://x.nl")).toBe(0);
  });

  it("hooguit twee links per bericht, titel en tekst samen", () => {
    const tekst = "Zie https://a.nl, https://b.nl en https://c.nl voor meer";
    expect(controleerReactie({ tekst, fotos: 0 })).toMatch(/hooguit 2 links/);
    expect(controleerOnderwerp({ titel: "Kijk www.a.nl", tekst: "En https://b.nl en https://c.nl ook", categorie: "tips", fotos: 0 })).toMatch(/links/);
  });

  it("maakt platte tekst met links: de punt achter het adres hoort bij de zin, lange adressen worden ingekort", () => {
    expect(tekstDelen("Zie https://zekerflex.com/kennis. Fijn!")).toEqual([
      { soort: "tekst", tekst: "Zie " },
      { soort: "link", tekst: "https://zekerflex.com/kennis", href: "https://zekerflex.com/kennis" },
      { soort: "tekst", tekst: ". Fijn!" },
    ]);
    expect(tekstDelen("www.voorbeeld.nl")).toEqual([{ soort: "link", tekst: "www.voorbeeld.nl", href: "https://www.voorbeeld.nl/" }]);
    const lang = tekstDelen(`https://voorbeeld.nl/${"a".repeat(80)}`)[0];
    expect(lang?.soort === "link" && lang.tekst.length).toBe(58);
    // HTML blijft gewone tekst
    expect(tekstDelen("<b>vet</b>")).toEqual([{ soort: "tekst", tekst: "<b>vet</b>" }]);
  });
});

describe("privégegevens in een openbaar bericht", () => {
  it("herkent een e-mailadres, telefoonnummer of rekeningnummer; een adres van ZekerFlex mag", () => {
    expect(privegegevens("Mail me op jan.devries@gmail.com")).toBe("e-mailadres");
    expect(privegegevens("Mail support@zekerflex.com")).toBeNull();
    expect(privegegevens("Bel 06-12345678")).toBe("telefoonnummer");
    expect(privegegevens("bel 06 12 34 56 78")).toBe("telefoonnummer");
    expect(privegegevens("+31 6 12345678")).toBe("telefoonnummer");
    expect(privegegevens("Mijn rekening NL91 ABNA 0417 1643 00")).toBe("rekeningnummer");
  });

  it("geen vals alarm op datums, tijden, bedragen of een KVK-nummer", () => {
    expect(privegegevens("Van 2026-11-22 09:00 tot 17:00, € 1.250,00 per maand")).toBeNull();
    expect(privegegevens("KVK 12345678 en postcode 9636 AB")).toBeNull();
    expect(controleerReactie({ tekst: "Bel me: 0612345678", fotos: 0 })).toMatch(/telefoonnummer/);
  });
});

describe("foto's herkennen aan de eerste bytes", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const tekst = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  it("jpg, png, webp en heic; de rest niet (ook geen svg of pdf)", () => {
    expect(fotoSoort(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(fotoSoort(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(fotoSoort(bytes(...tekst("RIFF"), 0, 0, 0, 0, ...tekst("WEBP")))).toBe("webp");
    expect(fotoSoort(bytes(0, 0, 0, 0x18, ...tekst("ftypheic")))).toBe("heic");
    expect(fotoSoort(bytes(...tekst("%PDF-1.7")))).toBeNull();
    expect(fotoSoort(bytes(...tekst("<svg xmlns")))).toBeNull();
    expect(fotoSoort(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("naam en rol van de schrijver", () => {
  it("voornaam met de eerste letter van de achternaam, nooit de hele achternaam", () => {
    expect(weergaveNaam("Jan de Vries")).toBe("Jan V.");
    expect(weergaveNaam("jan van der berg")).toBe("Jan B.");
    expect(weergaveNaam("Fatima")).toBe("Fatima");
    expect(weergaveNaam("  Anne-Marie   Jansen-Bakker ")).toBe("Anne-Marie J.");
    expect(weergaveNaam("Łukasz Żółw")).toBe("Łukasz Ż.");
  });

  it("geen e-mailadres of nummer als naam", () => {
    expect(weergaveNaam("jan@example.com")).toBe("Lid van ZekerFlex");
    expect(weergaveNaam("0612345678")).toBe("Lid van ZekerFlex");
    expect(weergaveNaam("")).toBe("Lid van ZekerFlex");
    expect(weergaveNaam(null)).toBe("Lid van ZekerFlex");
  });

  it("het label: platformbeheer is het team, een bedrijfsrol Bedrijf, een flexwerker Werker", () => {
    expect(rolVoor(["PLATFORM_ADMIN", "FREELANCER"])).toBe("team");
    expect(rolVoor(["HQ_ADMIN"])).toBe("bedrijf");
    expect(rolVoor(["LOCAL_MANAGER"])).toBe("bedrijf");
    expect(rolVoor(["FREELANCER"])).toBe("werker");
    expect(rolVoor([])).toBe("lid");
  });
});

describe("adressen", () => {
  it("maakt een slug zonder accenten en tekens", () => {
    expect(maakSlug("Tips voor je eerste dienst: café & bar!")).toBe("tips-voor-je-eerste-dienst-cafe-en-bar");
    expect(maakSlug("!!!")).toBe("onderwerp");
    expect(maakSlug("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("het pad /community/<id>-<slug> en het id terug, ook zonder slug", () => {
    expect(onderwerpPad({ id: "oabc123", slug: "hallo-daar" })).toBe("/community/oabc123-hallo-daar");
    expect(idUitPad("oabc123-hallo-daar")).toBe("oabc123");
    expect(idUitPad("oabc123")).toBe("oabc123");
    expect(onderwerpPad(WELKOM)).toBe("/community/welkom-stel-je-voor");
    expect(idUitPad("welkom-stel-je-voor")).toBe("welkom");
    expect(idUitPad("../etc")).toBeNull();
    expect(idUitPad("ABC")).toBeNull();
  });
});

describe("melden en verbergen", () => {
  const basis = { status: "zichtbaar" as const, beoordeeldOp: null, meldingen: [] as Melding[] };

  it("na drie meldingen van verschillende mensen verborgen; twee keer dezelfde melder telt één keer", () => {
    const twee = { ...basis, meldingen: [melding("u:a", "2026-11-22T10:00:00Z"), melding("u:a", "2026-11-22T10:01:00Z"), melding("ip:x", "2026-11-22T10:02:00Z")] };
    expect(tellendeMeldingen(twee)).toBe(2);
    expect(moetVerbergen(twee)).toBe(false);
    const drie = { ...twee, meldingen: [...twee.meldingen, melding("u:b", "2026-11-22T10:03:00Z")] };
    expect(moetVerbergen(drie)).toBe(true);
    expect(alGemeld(drie, "u:a")).toBe(true);
    expect(alGemeld(drie, "u:c")).toBe(false);
  });

  it("na een beoordeling door beheer tellen alleen nieuwere meldingen; het welkomstonderwerp van het team verdwijnt nooit vanzelf", () => {
    const meldingen = ["u:a", "u:b", "u:c"].map((d, i) => melding(d, `2026-11-22T10:0${i}:00Z`));
    expect(moetVerbergen({ ...basis, meldingen, beoordeeldOp: "2026-11-22T11:00:00Z" })).toBe(false);
    expect(alGemeld({ meldingen, beoordeeldOp: "2026-11-22T11:00:00Z" }, "u:a")).toBe(false);
    expect(moetVerbergen({ ...basis, meldingen, team: true })).toBe(false);
    expect(moetVerbergen({ ...basis, meldingen, status: "verborgen" as const })).toBe(false);
  });
});

describe("daggrenzen en nieuwe accounts", () => {
  it("hooguit 5 onderwerpen en 40 reacties per dag; een nieuwe dag begint bij nul", () => {
    let t = telOp(undefined, "2026-11-22", "onderwerpen");
    for (let i = 1; i < GRENZEN.onderwerpenPerDag; i++) t = telOp(t ?? undefined, "2026-11-22", "onderwerpen");
    expect(t).toEqual({ dag: "2026-11-22", onderwerpen: 5, reacties: 0 });
    expect(telOp(t ?? undefined, "2026-11-22", "onderwerpen")).toBeNull();
    expect(telOp(t ?? undefined, "2026-11-22", "reacties")).toEqual({ dag: "2026-11-22", onderwerpen: 5, reacties: 1 });
    expect(telOp(t ?? undefined, "2026-11-23", "onderwerpen")).toEqual({ dag: "2026-11-23", onderwerpen: 1, reacties: 0 });
    expect(telOp({ dag: "2026-11-22", onderwerpen: 0, reacties: 40 }, "2026-11-22", "reacties")).toBeNull();
  });

  it("een account jonger dan 10 minuten kan nog niet posten", () => {
    const nu = new Date();
    expect(accountTeNieuw(new Date(nu.getTime() - 9 * 60_000), nu)).toBe(true);
    expect(accountTeNieuw(new Date(nu.getTime() - 11 * 60_000), nu)).toBe(false);
  });
});

describe("overzicht en tijd", () => {
  const o = (id: string, at: string, laatsteOp: string, extra: Partial<Onderwerp> = {}): Onderwerp => ({
    ...WELKOM,
    id,
    team: false,
    vastgepind: false,
    at,
    laatsteOp,
    ...extra,
  });

  it("vastgepind bovenaan, dan de actiefste of de nieuwste; verborgen en verwijderd niet; filter op categorie", () => {
    const lijst = [
      o("a", "2026-11-20T10:00:00Z", "2026-11-22T09:00:00Z"),
      o("b", "2026-11-21T10:00:00Z", "2026-11-21T10:00:00Z", { categorie: "tips" }),
      o("c", "2026-11-19T10:00:00Z", "2026-11-19T10:00:00Z", { vastgepind: true }),
      o("d", "2026-11-22T10:00:00Z", "2026-11-22T10:00:00Z", { status: "verborgen" }),
    ];
    expect(sorteerOnderwerpen(lijst, "actief").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(sorteerOnderwerpen(lijst, "nieuw").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(sorteerOnderwerpen(lijst, "actief", "tips").map((x) => x.id)).toEqual(["b"]);
  });

  it("een kort uittreksel op een woordgrens", () => {
    expect(uittreksel("kort")).toBe("kort");
    const u = uittreksel("woord ".repeat(60), 50);
    expect(u.endsWith("…")).toBe(true);
    expect(u.length).toBeLessThanOrEqual(51);
  });

  it("tijden in Nederlandse tijd: zojuist, minuten, vandaag, gisteren, daarna de datum", () => {
    const nu = new Date();
    expect(wanneer("2026-11-22T14:29:40+01:00", nu)).toBe("zojuist");
    expect(wanneer("2026-11-22T14:18:00+01:00", nu)).toBe("12 minuten geleden");
    expect(wanneer("2026-11-22T00:10:00+01:00", nu)).toBe("vandaag om 00:10");
    // 23:30 UTC op de 21e is in Amsterdam al de 22e
    expect(wanneer("2026-11-21T23:30:00Z", nu)).toBe("vandaag om 00:30");
    expect(wanneer("2026-11-21T09:05:00+01:00", nu)).toBe("gisteren om 09:05");
    expect(wanneer("2026-11-03T12:00:00+01:00", nu)).toBe("3 november 2026");
  });
});
