import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Ken je een bedrijf dat mensen zoekt?": de kaart in de werker-app en de link /klus-plaatsen?via=werker. Alleen de bron "werker" en
// een totaal per maand: geen persoon, geen ref-code, geen bonus, geen gegevens van de werker in de link.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  limiet: vi.fn(async (_a: unknown) => undefined),
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => h.kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    h.kv.set(k, v);
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: h.limiet, privateRateLimitIdentifier: (s: string) => `hmac-${s.length}` }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));

import { TIP_WEG_SLEUTEL, leesVia, leesViaStap, tipLink, tipPlek, telViaStap, viaSleutel } from "@/lib/klusconcept/via";
import { leesKlusVia, telKlusVia } from "@/lib/klusconcept/via-opslag";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

beforeEach(() => {
  h.kv.clear();
  h.limiet.mockClear();
});

describe("de bron van de link", () => {
  it("alleen precies 'werker' is een bron; al het andere niet", () => {
    expect(leesVia("werker")).toBe("werker");
    expect(leesVia(" Werker ")).toBe("werker");
    expect(leesVia(["werker", "x"])).toBe("werker");
    expect(leesVia("werker-jan")).toBeNull();
    expect(leesVia("bonus")).toBeNull();
    expect(leesVia(undefined)).toBeNull();
    expect(leesVia(42)).toBeNull();
    expect(leesViaStap("bezoek")).toBe("bezoek");
    expect(leesViaStap("concept")).toBe("concept");
    expect(leesViaStap("persoon")).toBeNull();
  });

  it("de gedeelde link is altijd dezelfde en bevat niets van de werker", () => {
    expect(tipLink("https://zekerflex.com")).toBe("https://zekerflex.com/klus-plaatsen?via=werker");
    expect(tipLink("https://zekerflex.com/")).toBe("https://zekerflex.com/klus-plaatsen?via=werker");
    // geen ref-code, geen id, geen naam: alleen via=werker
    expect([...new URL(tipLink("https://zekerflex.com")).searchParams.keys()]).toEqual(["via"]);
  });
});

describe("de telling", () => {
  it("een totaal per Amsterdamse maand, zonder gebruiker in de sleutel", () => {
    expect(viaSleutel(new Date("2026-11-14T10:00:00+01:00"))).toBe("meting:klus-via:2026-11");
    // vlak voor middernacht UTC op de laatste dag is het in Amsterdam al de volgende maand
    expect(viaSleutel(new Date("2026-11-30T23:30:00Z"))).toBe("meting:klus-via:2026-12");
  });

  it("telt een stap erbij en herstelt een onvolledig object", () => {
    expect(telViaStap(null, "bezoek")).toEqual({ bezoek: 1, concept: 0 });
    expect(telViaStap({ bezoek: 4, concept: 1 }, "concept")).toEqual({ bezoek: 4, concept: 2 });
    expect(telViaStap({ bezoek: -3 }, "bezoek")).toEqual({ bezoek: 1, concept: 0 });
  });

  it("de opslag bewaart alleen de twee getallen onder de maandsleutel", async () => {
    const nu = new Date("2026-11-14T10:00:00+01:00");
    await telKlusVia("bezoek", nu);
    await telKlusVia("bezoek", nu);
    await telKlusVia("concept", nu);
    expect(h.kv.get("meting:klus-via:2026-11")).toEqual({ bezoek: 2, concept: 1 });
    expect([...h.kv.keys()]).toEqual(["meting:klus-via:2026-11"]);
    expect(await leesKlusVia(nu)).toEqual({ bezoek: 2, concept: 1 });
    expect(await leesKlusVia(new Date("2026-12-14T10:00:00+01:00"))).toEqual({ bezoek: 0, concept: 0 });
  });
});

describe("POST /api/klus-plaatsen/via", () => {
  const post = (body: unknown) => new Request("https://zekerflex.com/api/klus-plaatsen/via", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("telt een geldige bron en stap, begrensd per bezoeker", async () => {
    const { POST } = await import("@/app/api/klus-plaatsen/via/route");
    const res = await POST(post({ via: "werker", stap: "bezoek" }));
    expect(res.status).toBe(200);
    expect(h.limiet).toHaveBeenCalledTimes(1);
    expect(h.kv.size).toBe(1);
    const sleutels = [...h.kv.keys()].join(",");
    // het IP komt nergens in de opslag terecht
    expect(sleutels).not.toContain("203.0.113.9");
    expect(JSON.stringify([...h.kv.values()])).not.toContain("203.0.113.9");
  });

  it("een onbekende bron of stap wordt stil genegeerd (niets bewaard)", async () => {
    const { POST } = await import("@/app/api/klus-plaatsen/via/route");
    for (const body of [{ via: "bonus", stap: "bezoek" }, { via: "werker", stap: "persoon" }, { via: "werker" }, {}]) {
      const res = await POST(post(body));
      expect(res.status).toBe(200);
    }
    expect(h.kv.size).toBe(0);
  });
});

describe("waar de kaart komt", () => {
  it("bovenaan als er geen echte klussen zijn (leeg of alleen testklussen), anders onderaan", () => {
    expect(tipPlek([])).toBe("boven");
    expect(tipPlek([{ testklus: true }, { testklus: true }])).toBe("boven");
    expect(tipPlek([{ testklus: true }, { testklus: false }])).toBe("onder");
    expect(tipPlek([{}])).toBe("onder");
  });
});

describe("de teksten in vijf talen", () => {
  const SLEUTELS = ["titel", "uitleg", "deel", "gekopieerd", "weg", "deelTitel", "deelTekst", "mislukt"] as const;

  it("elke taal heeft alle sleutels en niets is leeg", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const s of SLEUTELS) expect(d.tipBedrijf[s].length, `${taal} ${s}`).toBeGreaterThan(0);
    }
  });

  it("de andere talen zijn echt vertaald", () => {
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      for (const s of ["titel", "uitleg", "deel", "weg"] as const) {
        expect(FREELANCER_DICTS[taal].tipBedrijf[s], `${taal} ${s}`).not.toBe(FREELANCER_DICTS.nl.tipBedrijf[s]);
      }
    }
  });

  it("geen bonus en geen geld in de tekst: er is niets te verdienen aan deze tip", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const alles = Object.values(d.tipBedrijf).join(" ");
      expect(alles, taal).not.toMatch(/€|\$|bonus|euro|korting|reward|premie/i);
    }
  });
});

describe("de kaart zelf", () => {
  const kaart = readFileSync(path.join(process.cwd(), "components", "app", "TipBedrijfKaart.tsx"), "utf8").split("\r\n").join("\n");

  it("heeft de twee meetcodes, onthoudt het wegklikken per apparaat in try/catch en deelt via de Web Share API met kopiëren als terugval", () => {
    expect(kaart).toContain('data-track="tip-bedrijf-delen"');
    expect(kaart).toContain('data-track="tip-bedrijf-weg"');
    expect(kaart).toContain("TIP_WEG_SLEUTEL");
    expect(TIP_WEG_SLEUTEL).toBe("zf:tip-bedrijf-weg");
    expect(kaart).toMatch(/try \{[\s\S]*localStorage\.getItem[\s\S]*\} catch/);
    expect(kaart).toMatch(/try \{[\s\S]*localStorage\.setItem[\s\S]*\} catch/);
    expect(kaart).toContain("navigator.share");
    expect(kaart).toContain("navigator.clipboard.writeText");
  });

  it("zet geen gegevens van de werker in de link (alleen tipLink van de oorsprong)", () => {
    expect(kaart).toContain("tipLink(window.location.origin)");
    expect(kaart).not.toMatch(/userId|principal|email|fullName|ref=|code=/);
  });

  it("importeert geen woordenboek of server-spul (de bundel van de shop blijft schoon)", () => {
    expect(kaart).not.toMatch(/dictionary-en|FREELANCER_DICTS|lib\/i18n\/server|prisma|@\/lib\/storage\/kv/);
  });

  it("een useEffect geeft niets terug behalve een opruimfunctie", () => {
    expect(kaart).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*(?!\{)/);
  });
});
