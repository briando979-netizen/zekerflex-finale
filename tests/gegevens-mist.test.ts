import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Gegevens" is de stap waar nieuwe werkers vastliepen (12 nov 2026: 19 van de 20 nieuwe aanmeldingen; van de 16 uitzendkrachten
// die daar stilstonden ontbrak bij allen het BSN, en dat veld stond niet op de pagina waar de stap naartoe wijst). Nu laat de
// verificatiepagina per onderdeel zien wat er mist, en het BSN kan daar meteen.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), principal: { userId: "w1", roles: ["FREELANCER"], fullName: "Test Werker" } }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal, requireRole: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/integrations/kvkbase", () => ({ validateVat: vi.fn() }));
vi.mock("@/lib/compliance/documents", () => ({ flagIbanChanged: vi.fn() }));
vi.mock("@/lib/fiscal/iban-bevestiging", () => ({ bevestigIbanWijziging: vi.fn() }));

import { gegevensMist, voorEersteKlus, type GegevensStand } from "@/lib/onboarding/gegevens-mist";
import { fiscaalIngevuld, getFiscal, EMPTY_FISCAL } from "@/lib/fiscal/store";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const route = await import("@/app/api/me/fiscal/route");
const put = (body: unknown) => (route.PUT as (r: Request) => Promise<Response>)(new Request("http://localhost/api/me/fiscal", { method: "PUT", body: JSON.stringify(body) }));

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

beforeEach(() => h.kv.clear());

describe("gegevensMist: wat er nog mist", () => {
  const stand = (over: Partial<GegevensStand> = {}): GegevensStand => ({ soort: "uitzendkracht", fiscaalIngevuld: false, contractGetekend: false, bedrijfOk: false, postcodeOk: false, ...over });

  it("een uitzendkracht mist bij de aanmelding alleen de postcode; BSN en overeenkomst komen vóór de eerste klus (13 nov)", () => {
    expect(gegevensMist(stand())).toEqual(["postcode"]);
    expect(gegevensMist(stand({ postcodeOk: true }))).toEqual([]);
    expect(voorEersteKlus(stand())).toEqual(["bsn", "contract"]);
  });

  it("vóór de eerste klus alleen wat echt mist: BSN ja en overeenkomst nee, of allebei klaar", () => {
    expect(voorEersteKlus(stand({ fiscaalIngevuld: true }))).toEqual(["contract"]);
    expect(voorEersteKlus(stand({ contractGetekend: true }))).toEqual(["bsn"]);
    expect(voorEersteKlus(stand({ fiscaalIngevuld: true, contractGetekend: true }))).toEqual([]);
  });

  it("reageren eist het BSN en de overeenkomst nog steeds, met een eigen reden (lib/fiscal/eligibility.ts)", () => {
    const elig = bron("lib/fiscal/eligibility.ts");
    expect(elig).toContain("Boolean(fiscal.bsnHash)");
    expect(elig).toContain('sleutel: "elig.uitzendGegevens"');
    expect(elig).toContain('sleutel: "elig.contract"');
  });

  it("een zzp'er of flexwerker mist bij de aanmelding alleen de postcode; btw/KVK/KOR komt vóór de eerste klus (13 nov)", () => {
    for (const soort of ["zzp", "flexwerker"] as const) {
      expect(gegevensMist(stand({ soort }))).toEqual(["postcode"]);
      expect(gegevensMist(stand({ soort, postcodeOk: true }))).toEqual([]);
      expect(voorEersteKlus(stand({ soort, postcodeOk: true }))).toEqual(["btw"]);
      expect(voorEersteKlus(stand({ soort, fiscaalIngevuld: true, postcodeOk: true }))).toEqual(["btw"]);
      expect(voorEersteKlus(stand({ soort, fiscaalIngevuld: true, bedrijfOk: true }))).toEqual([]);
    }
    // een uitzendkracht heeft geen btw/KVK, wel het BSN en de overeenkomst
    expect(voorEersteKlus(stand({ soort: "uitzendkracht" }))).toEqual(["bsn", "contract"]);
  });

  it("zonder gekozen soort valt er niets op te noemen behalve de postcode (de soort is een eerdere stap)", () => {
    expect(gegevensMist(stand({ soort: null }))).toEqual(["postcode"]);
  });

  it("de lijst is leeg precies wanneer de poort 'gegevens ingevuld' zegt (zelfde regel als werker-poort-server.ts)", () => {
    for (const soort of ["zzp", "flexwerker", "uitzendkracht", null] as const) {
      for (const fiscaal of [false, true]) {
        for (const contract of [false, true]) {
          for (const bedrijf of [false, true]) {
            for (const postcode of [false, true]) {
              const s: GegevensStand = { soort, fiscaalIngevuld: fiscaal, contractGetekend: contract, bedrijfOk: bedrijf, postcodeOk: postcode };
              // sinds 13 nov voor iedereen alleen de postcode (KVK/btw/KOR en BSN/overeenkomst vóór de eerste klus)
              const poort = postcode;
              // zonder soort is fiscaalIngevuld nooit waar (isComplete), dat is hier een eerdere stap
              if (soort === null) continue;
              expect(gegevensMist(s).length === 0, JSON.stringify(s)).toBe(poort);
            }
          }
        }
      }
    }
  });
});

describe("het BSN invullen op de verificatiepagina (PUT /api/me/fiscal)", () => {
  it("een BSN alleen: opgeslagen (versleuteld), de poort-regel 'fiscaal ingevuld' is dan waar, en de loonheffingskorting blijft zoals ze was", async () => {
    const res = await put({ workerKind: "uitzendkracht", bsn: "123456782", loonheffingskorting: false });
    expect(res.status).toBe(200);
    const f = await getFiscal("w1");
    expect(f.bsnLast4).toBe("6782");
    expect(f.bsnHash).toBeTruthy();
    expect(JSON.stringify(f)).not.toContain("123456782");
    expect(f.loonheffingskorting).toBe(false);
    expect(fiscaalIngevuld(f)).toBe(true);
  });

  it("een BSN dat niet klopt (elfproef) wordt geweigerd met een duidelijke melding en er wordt niets bewaard", async () => {
    const res = await put({ workerKind: "uitzendkracht", bsn: "123456789", loonheffingskorting: true });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/BSN/);
    expect((await getFiscal("w1")).bsnHash).toBeNull();
  });

  it("zonder BSN en zonder BSN op bestand mislukt het, met de reden", async () => {
    const res = await put({ workerKind: "uitzendkracht", loonheffingskorting: true });
    expect(res.status).toBe(422);
    expect(EMPTY_FISCAL.bsnHash).toBeNull();
  });
});

describe("de pagina en de vijf talen", () => {
  it("de verificatiepagina toont de lijst bovenaan en heeft een anker bij de overeenkomst", () => {
    const pagina = bron("app/dashboard/verificatie/page.tsx");
    expect(pagina).toContain("<GegevensMist");
    expect(pagina).toContain("mist={mist}");
    expect(pagina.indexOf("<GegevensMist")).toBeLessThan(pagina.indexOf("<OnboardingForm"));
    expect(pagina).toContain('id="uitzendovereenkomst"');
    expect(pagina).toContain("gegevensMist({");
  });

  it("het BSN-veld stuurt alleen het BSN (de route laat de loonheffingskorting staan) en ververst de pagina; foutmeldingen hebben role=alert", () => {
    const veld = bron("components/app/GegevensMist.tsx");
    // sinds 13 nov voegt de route alleen meegestuurde sleutels samen: een oudere stand hier zet de keuze niet terug
    expect(veld).not.toMatch(/loonheffingskorting/);
    expect(veld).toContain("/api/me/fiscal");
    expect(veld).toContain("router.refresh()");
    expect(veld).toContain('role="alert"');
    expect(veld).toContain('htmlFor="gegevens-bsn"');
  });

  it("elke taal heeft alle teksten, met dezelfde plaatshouders en echt vertaald", () => {
    const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");
    const blad = (w: unknown, pad: string, uit: Map<string, string>): void => {
      if (typeof w === "string") uit.set(pad, w);
      else if (w && typeof w === "object") for (const [k, v] of Object.entries(w)) blad(v, pad ? `${pad}.${k}` : k, uit);
    };
    const per = new Map<string, Map<string, string>>();
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const m = new Map<string, string>();
      blad(FREELANCER_DICTS[taal].gegevensMist, "", m);
      per.set(taal, m);
    }
    const nl = per.get("nl")!;
    expect(nl.size).toBeGreaterThan(15);
    for (const [taal, m] of per) {
      expect([...m.keys()].sort(), taal).toEqual([...nl.keys()].sort());
      for (const [pad, x] of nl) {
        const v = m.get(pad) ?? "";
        expect(v.length, `${taal} ${pad}`).toBeGreaterThan(0);
        expect(plaats(v), `${taal} ${pad}`).toBe(plaats(x));
        if (taal !== "nl" && x.length > 14) expect(v, `${taal} ${pad}`).not.toBe(x);
      }
    }
  });
});
