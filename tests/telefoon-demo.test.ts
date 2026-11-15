import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leesGesprek, leesInvoer, naamVanSite, reserveGesprek, uurVoorlezen, VOORBEELD, voorStem } from "@/lib/telephony/demo";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { AANBOD } from "@/lib/marketing/aanbod";

// De luisterdemo van de telefoonassistent op /aanbod/telefonie (16 nov 2026): een vast voorbeeld en een gesprek voor
// de eigen zaak (website of naam), geschreven door ons model en voorgelezen door twee eigen stemmen.

const { chatJson, piperSpreek, fetchPage } = vi.hoisted(() => ({ chatJson: vi.fn(), piperSpreek: vi.fn(), fetchPage: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({ chatJson, fastModel: () => "snel" }));
vi.mock("@/lib/ai/piper", () => ({ piperSpreek, STANDAARD_PIPER_STEM: "alloy" }));
vi.mock("@/lib/website-check/fetch", async (orig) => {
  const echt = await orig<typeof import("@/lib/website-check/fetch")>();
  return { ...echt, fetchPage };
});

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

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
  it("het vaste voorbeeld en het reservegesprek: de assistent begint en eindigt, om en om", () => {
    for (const g of [VOORBEELD, reserveGesprek({ naam: "Bakkerij Jansen" }), reserveGesprek({ naam: "Bakkerij Jansen", openingstijden: ["maandag van 9 tot 17 uur"] })]) {
      expect(g[0]?.wie).toBe("assistent");
      expect(g[g.length - 1]?.wie).toBe("assistent");
      expect(g.every((r, i) => i === 0 || r.wie !== g[i - 1]?.wie)).toBe(true);
    }
    expect(reserveGesprek({ naam: "Bakkerij Jansen" })[0]?.tekst).toContain("Bakkerij Jansen");
    expect(reserveGesprek({ naam: "X", openingstijden: ["maandag van 9 tot 17 uur"] })[2]?.tekst).toContain("maandag van 9 tot 17 uur");
  });

  it("het antwoord van het model soepel gelezen: andere sleutels, een object als tekst, geen nummers of links", () => {
    const g = leesGesprek({
      gesprek: [
        { spreker: "Assistent", tekst: "Goedendag, u spreekt met de digitale assistent van Jansen." },
        { rol: "klant", text: { tekst: "Hebben jullie spelt?" } },
        { wie: "assistent", tekst: "Bel ons op 06 12345678." },
        { wie: "assistent", tekst: "Dat weet ik niet zeker; zal ik een terugbelverzoek klaarzetten?" },
        { wie: "klant", tekst: "Graag." },
        { wie: "onbekend", tekst: "weg" },
      ],
    });
    expect(g?.map((r) => r.wie)).toEqual(["assistent", "klant", "assistent", "klant"]);
    expect(g?.[1]?.tekst).toBe("Hebben jullie spelt?");
    expect(JSON.stringify(g)).not.toContain("12345678");
  });

  it("onbruikbaar = null (dan het reservegesprek): te kort, alleen één spreker, of de klant begint", () => {
    expect(leesGesprek(null)).toBeNull();
    expect(leesGesprek({ regels: [{ wie: "assistent", tekst: "Hallo" }] })).toBeNull();
    expect(leesGesprek([{ wie: "klant", tekst: "a b" }, { wie: "assistent", tekst: "c d" }, { wie: "klant", tekst: "e f" }, { wie: "assistent", tekst: "g h" }])).toBeNull();
  });

  it("hooguit 10 regels en elke regel ingekort op een zin", () => {
    const lang = Array.from({ length: 14 }, (_, i) => ({ wie: i % 2 ? "klant" : "assistent", tekst: `${"Dit is een zin. ".repeat(30)}` }));
    const g = leesGesprek({ regels: lang });
    expect(g).toHaveLength(10);
    expect(g?.every((r) => r.tekst.length <= 240 && r.tekst.endsWith("."))).toBe(true);
  });
});

describe("de server", () => {
  beforeEach(() => {
    chatJson.mockReset();
    piperSpreek.mockReset();
    fetchPage.mockReset();
  });

  it("een website: naam en openingstijden van de site, het gesprek van het model, twee stemmen", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    fetchPage.mockResolvedValue({
      status: 200,
      finalUrl: "https://www.bakkerijjansen.nl/",
      headers: {},
      body: '<html><head><title>Home | Bakkerij Jansen</title><meta name="description" content="Vers brood in Utrecht"></head><body><h1>Bakkerij Jansen</h1><p>Maandag t/m vrijdag 08:00 - 18:00</p><p>Zaterdag 08:00 - 16:00</p></body></html>',
    });
    chatJson.mockResolvedValue({
      regels: [
        { wie: "assistent", tekst: "Goedendag, u spreekt met de digitale assistent van Bakkerij Jansen." },
        { wie: "klant", tekst: "Zijn jullie zaterdag open?" },
        { wie: "assistent", tekst: "Ja, op zaterdag van 8 tot 16 uur." },
        { wie: "klant", tekst: "Dank u wel." },
        { wie: "assistent", tekst: "Graag gedaan, fijne dag!" },
      ],
    });
    piperSpreek.mockImplementation(async (_t: string, o: { stem: string }) => ({ audio: Buffer.from(o.stem), mime: "audio/mpeg" }));
    const g = await maakDemo("bakkerijjansen.nl");
    expect(g.zaak).toBe("Bakkerij Jansen");
    expect(g.door).toBe("ai");
    const feiten = (chatJson.mock.calls[0]?.[0] as { messages: { content: string }[] }).messages[1]?.content ?? "";
    expect(feiten).toContain("Vers brood in Utrecht");
    expect(feiten).toContain("maandag tot en met vrijdag van 8 tot 18 uur");
    expect(g.regels.map((r) => Buffer.from(r.geluid?.data ?? "", "base64").toString())).toEqual(["nl-vrouw", "nl-man", "nl-vrouw", "nl-man", "nl-vrouw"]);
  });

  it("het model valt weg en de stem ook: het reservegesprek, als tekst", async () => {
    const { maakDemo } = await import("@/lib/telephony/demo-server");
    chatJson.mockRejectedValue(new Error("time-out"));
    piperSpreek.mockResolvedValue(null);
    const g = await maakDemo("Kapsalon Lotte");
    expect(g.door).toBe("vast");
    expect(g.regels[0]?.tekst).toContain("Kapsalon Lotte");
    expect(g.regels.every((r) => r.geluid === null)).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
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
    expect(demo).toContain("komt binnenkort");
  });

  it("de tweede stem staat in de stemmenlijst van Piper", () => {
    expect(lees("deploy/piper/config/voice_to_speaker.yaml")).toMatch(/\n {2}nl-man:\n {4}model: voices\/nl_BE-rdh-medium\.onnx/);
  });
});
