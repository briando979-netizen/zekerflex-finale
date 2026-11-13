import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De "kijken"-stand van de Auto-uitrol (lib/bouwer/auto-uitrol-regels.ts, autoModus): een droge ronde die nooit een verzoek plaatst.
const MAIN = "a".repeat(40);
const LIVE = "b".repeat(40);
const NU = Date.parse("2026-11-14T10:00:00Z");

const m = vi.hoisted(() => ({
  vlag: true as unknown,
  modus: "kijken" as unknown,
  noodrem: false,
  stand: null as Record<string, unknown> | null,
  verzoek: null as unknown,
  controles: [] as { sha: string; ok: boolean; klaar: string }[],
  plaats: vi.fn(async (_v: unknown) => ({ id: "live_1", op: "2026-11-14T10:00:00.000Z" }) as { id: string; op: string } | null),
  startControle: vi.fn(async (..._a: unknown[]) => ({ bezig: {} })),
  githubMainSha: vi.fn(async (_e: unknown) => ({ status: "nieuw" as const, sha: "a".repeat(40), etag: null })),
  setFlag: vi.fn(async (..._a: unknown[]) => undefined),
  zetNoodrem: vi.fn(async (..._a: unknown[]) => undefined),
}));

// alleen /proc/meminfo is nagemaakt (16 GB vrij); alle andere bestanden (de bron in de tests hieronder) worden echt gelezen
vi.mock("node:fs", async () => {
  const echt = await vi.importActual<typeof import("node:fs")>("node:fs");
  const readFileSync = ((pad: unknown, ...rest: unknown[]) => (pad === "/proc/meminfo" ? "MemAvailable:   16777216 kB\n" : (echt.readFileSync as (...a: unknown[]) => unknown)(pad, ...rest))) as typeof echt.readFileSync;
  return { ...echt, readFileSync, default: { ...echt, readFileSync } };
});
vi.mock("@/lib/bouwer/auto-uitrol-opslag", async () => {
  const regels = await import("@/lib/bouwer/auto-uitrol-regels");
  return {
    leesAutoStand: async () => ({ ...regels.LEGE_STAND, gezienSha: MAIN, gezienSinds: new Date(NU - 10 * 60_000).toISOString(), ...(m.stand ?? {}) }),
    bewaarAutoStand: async (s: Record<string, unknown>) => void (m.stand = s),
    leesModus: async () => m.modus,
    noodremAan: async () => m.noodrem,
    neemRondeSlot: async () => "token",
    geefRondeSlotVrij: async () => undefined,
    zetModus: async () => undefined,
    zetNoodrem: (...a: unknown[]) => m.zetNoodrem(...a),
  };
});
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => m.vlag, setFlag: (...a: unknown[]) => m.setFlag(...a) }));
vi.mock("@/lib/ops/rondgang", () => ({ draaiRondgang: async () => ({}), laatsteRondgang: async () => null }));
vi.mock("@/lib/ops/error-journal", () => ({ journal: () => undefined }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/bouwer/versie", () => ({ liveVersie: () => ({ sha: LIVE, datum: "", onderwerp: "" }) }));
vi.mock("@/lib/bouwer/live", () => ({
  agentLeeft: () => true,
  isBezig: () => false,
  githubMainSha: (e: unknown) => m.githubMainSha(e),
  githubVergelijk: async () => ({ vergelijking: "ahead", nieuweMigraties: [] as string[] }),
  leesLive: async () => ({ status: null, log: [], hartslag: { op: new Date(NU).toISOString(), host: "h", versie: 3, bezig: false }, verzoek: m.verzoek }),
  plaatsVerzoekAlsLeeg: (v: unknown) => m.plaats(v),
}));
vi.mock("@/lib/bouwer/controles", () => ({
  lijstControles: async () => ({ bezig: null, uitslagen: m.controles }),
  startControle: (...a: unknown[]) => m.startControle(...a),
}));

import { autoUitrolRonde } from "@/lib/bouwer/auto-uitrol";
import { MAX_BESLISSINGEN, autoModus, magControleStarten, magVerzoekPlaatsen, voegBeslissingToe, type Beslissing } from "@/lib/bouwer/auto-uitrol-regels";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  m.vlag = true;
  m.modus = "kijken";
  m.noodrem = false;
  m.stand = null;
  m.verzoek = null;
  m.controles = [{ sha: MAIN, ok: true, klaar: new Date(NU - 60_000).toISOString() }];
});

describe("autoModus: uit / kijken / aan", () => {
  it("is alleen kijken of aan bij een aangezette vlag en exact die modus", () => {
    expect(autoModus(true, "kijken")).toBe("kijken");
    expect(autoModus(true, "aan")).toBe("aan");
    expect(autoModus(false, "aan")).toBe("uit");
    expect(autoModus(false, "kijken")).toBe("uit");
    expect(autoModus(true, "uit")).toBe("uit");
  });

  it("een onbekende of kapotte waarde is uit: nooit aan en nooit kijken", () => {
    for (const rare of ["", "AAN", "Aan", " aan", "kijk", 1, 0, true, null, undefined, {}, ["aan"]]) {
      expect(autoModus(true, rare), String(JSON.stringify(rare))).toBe("uit");
    }
    for (const vlag of ["", "true", "AAN", 1, null, undefined, {}, [true]]) {
      expect(autoModus(vlag, "aan"), String(JSON.stringify(vlag))).toBe("uit");
      expect(autoModus(vlag, "kijken"), String(JSON.stringify(vlag))).toBe("uit");
    }
  });

  it("alleen in aan mag een verzoek geplaatst worden", () => {
    const uitrollen = { actie: "uitrollen" as const, reden: "x", sha: MAIN };
    expect(magVerzoekPlaatsen("aan", uitrollen)).toBe(true);
    expect(magVerzoekPlaatsen("kijken", uitrollen)).toBe(false);
    expect(magVerzoekPlaatsen("uit", uitrollen)).toBe(false);
    expect(magVerzoekPlaatsen("aan", { actie: "wacht", reden: "x", sha: MAIN })).toBe(false);
  });
});

describe("de lus in de kijken-stand", () => {
  it("plaatst NOOIT een verzoek, ook niet als alles groen is, en schrijft wat hij zou doen", async () => {
    const r = await autoUitrolRonde(NU);
    expect(r.modus).toBe("kijken");
    expect(r.besluit.actie).toBe("uitrollen");
    expect(m.plaats).not.toHaveBeenCalled();
    expect(m.setFlag).not.toHaveBeenCalled();
    const lijst = (m.stand?.beslissingen ?? []) as Beslissing[];
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ sha: MAIN, actie: "uitrollen", kijken: true });
    expect(lijst[0]?.reden).toMatch(/^Zou nu uitrollen: aaaaaaaaaa/);
  });

  it("in aan plaatst dezelfde ronde wel een verzoek (met auto en de besloten sha)", async () => {
    m.modus = "aan";
    const r = await autoUitrolRonde(NU);
    expect(r.modus).toBe("aan");
    expect(m.plaats).toHaveBeenCalledTimes(1);
    expect(m.plaats.mock.calls[0]?.[0]).toMatchObject({ actie: "uitrollen", auto: true, doelSha: MAIN, forceer: false, zonderControle: false, migraties: [] });
  });

  it("in uit gebeurt er niets: geen GitHub, geen controle, geen verzoek", async () => {
    for (const [vlag, modus] of [[false, "aan"], [true, "uit"], [true, null], [true, "AAN"], [true, ""], [true, 1], [true, {}], ["true", "aan"]] as [unknown, unknown][]) {
      vi.clearAllMocks();
      m.vlag = vlag;
      m.modus = modus;
      const r = await autoUitrolRonde(NU);
      expect(r.modus, JSON.stringify([vlag, modus])).toBe("uit");
      expect(m.plaats).not.toHaveBeenCalled();
      expect(m.startControle).not.toHaveBeenCalled();
      expect(m.githubMainSha).not.toHaveBeenCalled();
    }
  });

  it("de noodrem werkt ook in kijken: niets, ook niet controleren of GitHub bevragen", async () => {
    m.noodrem = true;
    m.controles = [];
    const r = await autoUitrolRonde(NU);
    expect(r.besluit.actie).toBe("niets");
    expect(m.githubMainSha).not.toHaveBeenCalled();
    expect(m.startControle).not.toHaveBeenCalled();
    expect(m.plaats).not.toHaveBeenCalled();
  });

  it("een harde-stop-reden werkt ook in kijken: niets, ook niet controleren", async () => {
    m.stand = { stop: { reden: "nacontrole faalde: x", sha: LIVE, op: "2026-11-14T09:00:00Z" } };
    m.controles = [];
    const r = await autoUitrolRonde(NU);
    expect(r.besluit.actie).toBe("niets");
    expect(r.besluit.reden).toMatch(/Gestopt door de nacontrole/);
    expect(m.startControle).not.toHaveBeenCalled();
    expect(m.plaats).not.toHaveBeenCalled();
  });

  it("start hooguit één controle per nieuwe sha, ook over meerdere rondes", async () => {
    m.controles = [];
    await autoUitrolRonde(NU);
    expect(m.startControle).toHaveBeenCalledTimes(1);
    expect(m.startControle.mock.calls[0]).toEqual([MAIN, "Auto-uitrol", false, LIVE]);
    await autoUitrolRonde(NU + 2 * 60_000);
    await autoUitrolRonde(NU + 4 * 60_000);
    await autoUitrolRonde(NU + 6 * 60 * 60_000);
    expect(m.startControle).toHaveBeenCalledTimes(1);
    // een nieuwe sha krijgt wel weer een controle
    expect(magControleStarten({ controleGestart: { sha: MAIN, op: new Date(NU).toISOString() } }, "c".repeat(40), "kijken", NU)).toBe(true);
    expect(magControleStarten({ controleGestart: { sha: MAIN, op: new Date(NU).toISOString() } }, MAIN, "kijken", NU + 99 * 60_000)).toBe(false);
  });

  it("wacht ook tijdens een handmatige uitrol of verzoek: geen controle, geen verzoek", async () => {
    m.verzoek = { id: "live_mens", actie: "terug" };
    m.controles = [];
    const r = await autoUitrolRonde(NU);
    expect(r.besluit.actie).toBe("wacht");
    expect(r.besluit.reden).toMatch(/uitrol/);
    expect(m.startControle).not.toHaveBeenCalled();
    expect(m.plaats).not.toHaveBeenCalled();
  });

  it("onthoudt een weigering of migratie niet in kijken (alleen in de lijst: Zou weigeren)", async () => {
    m.controles = [{ sha: MAIN, ok: false, klaar: new Date(NU).toISOString() }];
    const r = await autoUitrolRonde(NU);
    expect(r.besluit.actie).toBe("weiger");
    expect(Object.keys((m.stand?.geweigerd ?? {}) as object)).toHaveLength(0);
    const lijst = (m.stand?.beslissingen ?? []) as Beslissing[];
    expect(lijst[0]?.reden).toMatch(/^Zou weigeren:/);
  });

  it("dezelfde beslissing in elke ronde komt maar één keer in de lijst", async () => {
    await autoUitrolRonde(NU);
    await autoUitrolRonde(NU + 120_000);
    await autoUitrolRonde(NU + 240_000);
    expect((m.stand?.beslissingen as Beslissing[]).length).toBe(1);
  });
});

describe("de lijst met beslissingen", () => {
  const b = (n: number): Beslissing => ({ op: new Date(NU + n * 1000).toISOString(), sha: MAIN, actie: "wacht", reden: `reden ${n}`, kijken: true });

  it("wordt afgekapt op de laatste 20, nieuwste laatst", () => {
    let lijst: Beslissing[] = [];
    for (let n = 0; n < 30; n += 1) lijst = voegBeslissingToe(lijst, b(n));
    expect(MAX_BESLISSINGEN).toBe(20);
    expect(lijst).toHaveLength(20);
    expect(lijst[0]?.reden).toBe("reden 10");
    expect(lijst[19]?.reden).toBe("reden 29");
  });

  it("slaat een herhaling over en kapt een te lange bestaande lijst af", () => {
    const lijst = voegBeslissingToe([], b(1));
    expect(voegBeslissingToe(lijst, { ...b(1), op: "later" })).toHaveLength(1);
    expect(voegBeslissingToe(Array.from({ length: 25 }, (_, n) => b(n)), b(1000))).toHaveLength(20);
    expect(voegBeslissingToe(undefined, b(1))).toHaveLength(1);
  });
});

describe("de bron", () => {
  it("het plaatsen van een verzoek staat op één plek, achter magVerzoekPlaatsen", () => {
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron.match(/plaatsVerzoekAlsLeeg\(/g)?.length).toBe(1);
    const i = bron.indexOf("plaatsVerzoekAlsLeeg({");
    expect(bron.lastIndexOf("magVerzoekPlaatsen(modus, besluit)", i)).toBeGreaterThan(bron.lastIndexOf("magControleStarten(", i));
    expect(bron).not.toMatch(/plaatsVerzoek\(/);
  });

  it("Beheer heeft drie knoppen en vraagt een bevestiging voor Aan; de route eist die ook", () => {
    const paneel = lees("components/admin/bouwer/AutoUitrolPaneel.tsx");
    expect(paneel).toContain('knop("uit", "Uit")');
    expect(paneel).toContain('knop("kijken", "Kijken")');
    expect(paneel).toContain('knop("aan", "Aan")');
    expect(paneel).toContain("Weet je zeker dat de Auto-uitrol echt mag uitrollen?");
    expect(paneel).toContain("bevestigd: true");
    expect(paneel).not.toMatch(/window\.(alert|confirm)/);
    const route = lees("app/api/admin/bouwer/auto-uitrol/route.ts");
    expect(route).toContain('body.modus === "aan" && body.bevestigd !== true');
    expect(route).toContain('["PLATFORM_ADMIN"]');
  });
});