import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gesprekVoor, leesInvoer, naamVanSite, TESTKLANT, uurVoorlezen, vraagVoor, VOORBEELD, voorStem } from "@/lib/telephony/demo";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { AANBOD } from "@/lib/marketing/aanbod";

// De luisterdemo van de telefoonassistent op /aanbod/telefonie (16 nov 2026): een vast voorbeeld en een gesprek voor
// de eigen zaak (website of naam), opgebouwd met de feiten van de site en voorgelezen door twee eigen stemmen. Geen
// taalmodel: gemma3:4b verzon dingen namens de zaak (zie lib/telephony/demo.ts).

const { piperSpreek, fetchPage } = vi.hoisted(() => ({ piperSpreek: vi.fn(), fetchPage: vi.fn() }));
vi.mock("@/lib/ai/piper", () => ({ piperSpreek, STANDAARD_PIPER_STEM: "alloy" }));
vi.mock("@/lib/website-check/fetch", async (orig) => {
  const echt = await orig<typeof import("@/lib/website-check/fetch")>();
  return { ...echt, fetchPage };
});

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const omEnOm = (g: readonly { wie: string }[]) => g[0]?.wie === "assistent" && g[g.length - 1]?.wie === "assistent" && g.every((r, i) => i === 0 || r.wie !== g[i - 1]?.wie);

describe("invoer en naam", () => {
  it("een domein is een website, een naam blijft een naam", () => {
    expect(leesInvoer("bakkerijjansen.nl")).toEqual({ soort: "website", url: "https://bakkerijjansen.nl" });
    expect(leesInvoer("http://www.jansen.nl/contact")).toEqual({ soort: "website", url: "http://www.jansen.nl/contact" });
    expect(leesInvoer("Bakkerij Jansen")).toEqual({ soort: "naam", naam: "Bakkerij Jansen" });
    expect(leesInvoer(" a ")).toBeNull();
  });

  it("de naam van de site: og:site_name, anders het deel van de titel dat op het domein lijkt, anders het domein", () => {
    expect(naamVanSite("Home | Iets", "Bakkerij Jansen", "x.nl")).toBe("Bakkerij Jansen");
    expect(naamVanSite("Home | Bakkerij Jansen", null, "www.bakkerijjansen.nl")).toBe("Bakkerij Jansen");
    expect(naamVanSite("Vers brood elke dag - Bakkerij Jansen", null, "bakkerijjansen.nl")).toBe("Bakkerij Jansen");
    expect(naamVanSite(null, null, "www.kapsalonlotte.nl")).toBe("Kapsalonlotte");
  });

  it("openingstijden om voor te lezen", () => {
    expect(uurVoorlezen("Maandag t/m vrijdag", "09:00 – 17:00")).toBe("maandag tot en met vrijdag van 9 tot 17 uur");
    expect(uurVoorlezen("Zaterdag", "08:30 – 12:30")).toBe("zaterdag van 8 uur 30 tot 12 uur 30");
    expect(uurVoorlezen("Zondag", "Gesloten")).toBe("zondag gesloten");
    expect(voorStem("Ma t/m vr **open** & bereikbaar")).toBe("Ma tot en met vr open en bereikbaar");
  });
});

describe("het gesprek", () => {
  it("de vraag van de testklant past bij de soort zaak (naam of omschrijving), anders een algemene", () => {
    expect(vraagVoor({ naam: "Kapsalon Lotte" })).toContain("haar te laten knippen");
    expect(vraagVoor({ naam: "De Vries", omschrijving: "APK, onderhoud en reparatie van alle merken" })).toContain("APK");
    expect(vraagVoor({ naam: "Bakkerij Jansen", omschrijving: "Vers brood in Haarlem" })).toContain("taart");
    expect(vraagVoor({ naam: "Trattoria Roma" })).toContain("tafel reserveren");
    expect(vraagVoor({ naam: "Jansen & Zn" })).toContain("jullie diensten");
  });

  it("de assistent neemt op met de naam, zet de vraag door als terugbelverzoek en verzint niets", () => {
    const g = gesprekVoor({ naam: "Garage De Vries", omschrijving: "APK en onderhoud" });
    expect(omEnOm(g)).toBe(true);
    expect(g[0]?.tekst).toContain("digitale assistent van Garage De Vries");
    expect(g.some((r) => r.wie === "assistent" && r.tekst.includes("terugbelverzoek"))).toBe(true);
    expect(g.some((r) => r.wie === "klant" && r.tekst.includes(TESTKLANT))).toBe(true);
    // geen openingstijden op de site: de assistent noemt er ook geen
    expect(g.some((r) => /open/i.test(r.tekst) && /uur/.test(r.tekst))).toBe(false);
  });

  it("met openingstijden van de site noemt de assistent precies die", () => {
    const g = gesprekVoor({ naam: "X", openingstijden: ["maandag tot en met vrijdag van 8 tot 17 uur", "zaterdag van 9 tot 12 uur"] });
    expect(omEnOm(g)).toBe(true);
    expect(g.some((r) => r.tekst === "Wij zijn open maandag tot en met vrijdag van 8 tot 17 uur en zaterdag van 9 tot 12 uur.")).toBe(true);
  });

  it("het vaste voorbeeld: om en om, de testklant heet zoals de stem (een man)", () => {
    expect(omEnOm(VOORBEELD)).toBe(true);
    expect(TESTKLANT).toBe("Daan");
    expect(JSON.stringify(VOORBEELD)).not.toContain("Sanne");
  });
});

describe("de server", () => {
  beforeEach(() => {
    piperSpreek.mockReset();
    fetchPage.mockReset();
  });

  it("een website: naam en openingstijden van de site, twee stemmen", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    fetchPage.mockResolvedValue({
      status: 200,
      finalUrl: "https://www.bakkerijjansen.nl/",
      headers: {},
      body: '<html><head><title>Home | Bakkerij Jansen</title><meta name="description" content="Vers brood in Utrecht"></head><body><h1>Bakkerij Jansen</h1><p>Maandag t/m vrijdag 08:00 - 18:00</p><p>Zaterdag 08:00 - 16:00</p></body></html>',
    });
    piperSpreek.mockImplementation(async (_t: string, o: { stem: string }) => ({ audio: Buffer.from(o.stem), mime: "audio/mpeg" }));
    const g = await maakDemo("bakkerijjansen.nl");
    expect(g.zaak).toBe("Bakkerij Jansen");
    expect(g.regels[1]?.tekst).toContain("taart");
    expect(g.regels.some((r) => r.tekst.includes("maandag tot en met vrijdag van 8 tot 18 uur en zaterdag van 8 tot 16 uur"))).toBe(true);
    expect(g.regels.map((r) => Buffer.from(r.geluid?.data ?? "", "base64").toString())).toEqual(g.regels.map((r) => (r.wie === "assistent" ? "nl-vrouw" : "nl-man")));
  });

  it("alleen een naam en geen stem: geen site opgehaald, het gesprek als tekst", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    piperSpreek.mockResolvedValue(null);
    const g = await maakDemo("Kapsalon Lotte");
    expect(g.regels[0]?.tekst).toContain("Kapsalon Lotte");
    expect(g.regels.every((r) => r.geluid === null)).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("een site die niet te lezen is: de naam uit het domein", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    fetchPage.mockRejectedValue(new Error("weg"));
    piperSpreek.mockResolvedValue(null);
    expect((await maakDemo("www.garagedevries.nl")).zaak).toBe("Garagedevries");
  });

  it("een adres in het eigen netwerk wordt niet opgehaald", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    await expect(maakDemo("localhost.internal")).rejects.toThrow();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe("de route en de pagina", () => {
  it("openbaar onder /api/demo, met eigen herkomst, limieten en een botveld", () => {
    expect(isPublicApiRoute("/api/demo/telefoon")).toBe(true);
    const route = lees("app/api/demo/telefoon/route.ts");
    expect(route).toContain("zelfdeHerkomst(request.headers, request.url)");
    expect(route).toContain('name: "telefoon-demo", identifier: ip, limit: 5');
    expect(route).toContain('name: "telefoon-demo-dag", identifier: "alle"');
    expect(route).toContain("b.data.extra?.trim()");
  });

  it("de telefoniepagina toont de demo, eerlijk: voorbeeld, eigen stem, niets bewaard, komt binnenkort", () => {
    expect(AANBOD.find((a) => a.slug === "telefonie")?.luisterdemo).toBe(true);
    expect(lees("components/marketing/aanbod/AanbodStandaard.tsx")).toContain("{a.luisterdemo && <TelefonieDemo />}");
    const demo = lees("components/marketing/aanbod/TelefonieDemo.tsx");
    expect(demo).toContain("We bewaren niets van wat je invult.");
    expect(demo).toContain("voorgelezen door onze eigen computerstem");
    expect(demo).toContain("De assistent noemt alleen wat op je website staat");
    expect(demo).toContain("komt binnenkort");
  });

  it("de tweede stem staat in de stemmenlijst van Piper", () => {
    // \r?: een checkout op Windows heeft CRLF (b0, 16 nov)
    expect(lees("deploy/piper/config/voice_to_speaker.yaml")).toMatch(/\r?\n {2}nl-man:\r?\n {4}model: voices\/nl_BE-rdh-medium\.onnx/);
  });
});
