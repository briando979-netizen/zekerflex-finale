import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACHTERSTAND_MELDING_MS,
  LEGE_STAND,
  MIN_LIVEZETTER_VERSIE,
  MIN_VRIJ_GEHEUGEN_MB,
  RUST_MS,
  beslis,
  inOllamaVenster,
  meldingen,
  rustVoorbij,
  uitkomstVanStatus,
  vrijGeheugenUitMeminfo,
  zietMain,
  type AutoStand,
  type Invoer,
} from "@/lib/bouwer/auto-uitrol-regels";
import { autoUitrolTodos } from "@/lib/admin/todo-auto-uitrol";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const MAIN = "a".repeat(40);
const LIVE = "b".repeat(40);
// 14 nov 2026 10:00 UTC: buiten het venster van het eigen model
const NU = Date.parse("2026-11-14T10:00:00Z");
const RUSTIG = new Date(NU - RUST_MS - 1000).toISOString();

function invoer(extra: Partial<Invoer> = {}, stand: Partial<AutoStand> = {}): Invoer {
  return {
    nu: NU,
    aan: true,
    noodrem: false,
    liveSha: LIVE,
    mainSha: MAIN,
    stand: { ...LEGE_STAND, gezienSha: MAIN, gezienSinds: RUSTIG, ...stand },
    controle: "schoon",
    nieuweMigraties: [],
    uitrolBezig: false,
    livezetter: { leeft: true, versie: MIN_LIVEZETTER_VERSIE },
    vrijGeheugenMb: MIN_VRIJ_GEHEUGEN_MB + 1000,
    ...extra,
  };
}

describe("Auto-uitrol: beslisregels", () => {
  it("rolt uit bij een schone controle, geen migratie, rust, een vrije server en genoeg geheugen", () => {
    const b = beslis(invoer());
    expect(b.actie).toBe("uitrollen");
    expect(b.sha).toBe(MAIN);
  });

  it("noodrem en schakelaar uit gaan voor alles", () => {
    expect(beslis(invoer({ noodrem: true })).actie).toBe("niets");
    expect(beslis(invoer({ aan: false })).actie).toBe("niets");
    expect(beslis(invoer({ noodrem: true, aan: false })).reden).toMatch(/noodrem/);
  });

  it("doet niets als live al main is, en wacht als main niet te lezen is", () => {
    expect(beslis(invoer({ liveSha: MAIN })).actie).toBe("niets");
    expect(beslis(invoer({ mainSha: null })).actie).toBe("wacht");
  });

  it("rolt NOOIT uit op een rode controle: weigert die sha", () => {
    const b = beslis(invoer({ controle: "faalt" }));
    expect(b.actie).toBe("weiger");
    expect(b.sha).toBe(MAIN);
  });

  it("een eerder geweigerde sha wordt nooit opnieuw geprobeerd, een nieuwe wel", () => {
    const stand = { geweigerd: { [MAIN]: { reden: "controle faalt", op: "2026-11-14T09:00:00Z" } } };
    expect(beslis(invoer({}, stand)).actie).toBe("niets");
    const nieuw = "c".repeat(40);
    const b = beslis(invoer({ mainSha: nieuw }, { ...stand, gezienSha: nieuw, gezienSinds: RUSTIG }));
    expect(b.actie).toBe("uitrollen");
  });

  it("rolt NOOIT uit met een wachtende migratie, en meldt het", () => {
    expect(beslis(invoer({ nieuweMigraties: ["20261114_x"] })).actie).toBe("migratie-wacht");
    expect(beslis(invoer({}, { migratieWacht: { sha: MAIN, migraties: ["x"], op: "2026-11-14T09:00:00Z" } })).actie).toBe("niets");
    // niet te zien of er migraties zijn: niet uitrollen
    expect(beslis(invoer({ nieuweMigraties: null })).actie).toBe("wacht");
  });

  it("wacht de rustperiode af en begint opnieuw bij een nieuwe push", () => {
    const net = new Date(NU - 60_000).toISOString();
    expect(beslis(invoer({}, { gezienSinds: net })).actie).toBe("wacht");
    expect(rustVoorbij(net, NU)).toBe(false);
    expect(rustVoorbij(RUSTIG, NU)).toBe(true);
    expect(rustVoorbij(null, NU)).toBe(false);
    const stand = zietMain({ ...LEGE_STAND, gezienSha: MAIN, gezienSinds: RUSTIG }, "d".repeat(40), NU);
    expect(stand.gezienSha).toBe("d".repeat(40));
    expect(stand.gezienSinds).toBe(new Date(NU).toISOString());
    expect(zietMain(stand, "d".repeat(40), NU + 5000).gezienSinds).toBe(new Date(NU).toISOString());
    expect(beslis(invoer({ mainSha: "d".repeat(40) }, stand)).actie).toBe("wacht");
  });

  it("start de controle als die er nog niet is, en wacht als hij loopt", () => {
    expect(beslis(invoer({ controle: "onbekend" })).actie).toBe("controleer");
    expect(beslis(invoer({ controle: "bezig" })).actie).toBe("wacht");
  });

  it("wacht als de live-zetter stil, te oud of bezig is, of er een verzoek klaarligt", () => {
    expect(beslis(invoer({ livezetter: null })).actie).toBe("wacht");
    expect(beslis(invoer({ livezetter: { leeft: false, versie: 3 } })).actie).toBe("wacht");
    expect(beslis(invoer({ livezetter: { leeft: true, versie: MIN_LIVEZETTER_VERSIE - 1 } })).reden).toMatch(/te oud/);
    expect(beslis(invoer({ uitrolBezig: true })).actie).toBe("wacht");
  });

  it("wacht in het venster van het eigen model (11:50 tot 12:40 UTC) en bij te weinig of onbekend geheugen", () => {
    expect(inOllamaVenster(Date.parse("2026-11-14T11:49:00Z"))).toBe(false);
    expect(inOllamaVenster(Date.parse("2026-11-14T11:50:00Z"))).toBe(true);
    expect(inOllamaVenster(Date.parse("2026-11-14T12:39:00Z"))).toBe(true);
    expect(inOllamaVenster(Date.parse("2026-11-14T12:40:00Z"))).toBe(false);
    const binnen = Date.parse("2026-11-14T12:00:00Z");
    expect(beslis(invoer({ nu: binnen }, { gezienSinds: new Date(binnen - RUST_MS - 1000).toISOString() })).actie).toBe("wacht");
    expect(beslis(invoer({ vrijGeheugenMb: MIN_VRIJ_GEHEUGEN_MB - 1 })).actie).toBe("wacht");
    expect(beslis(invoer({ vrijGeheugenMb: null })).actie).toBe("wacht");
    expect(beslis(invoer({ vrijGeheugenMb: MIN_VRIJ_GEHEUGEN_MB })).actie).toBe("uitrollen");
  });

  it("de volgorde: een rode controle gaat voor een wachtende migratie, en niets rolt uit zolang een regel hem tegenhoudt", () => {
    expect(beslis(invoer({ controle: "faalt", nieuweMigraties: ["x"] })).actie).toBe("weiger");
    for (const extra of [{ controle: "faalt" as const }, { nieuweMigraties: ["x"] }, { aan: false }, { noodrem: true }, { uitrolBezig: true }, { vrijGeheugenMb: 100 }]) {
      expect(beslis(invoer(extra)).actie).not.toBe("uitrollen");
    }
  });
});

describe("Auto-uitrol: hulpjes", () => {
  it("leest het vrije geheugen uit /proc/meminfo", () => {
    expect(vrijGeheugenUitMeminfo("MemTotal:  16000000 kB\nMemAvailable:    8388608 kB\n")).toBe(8192);
    expect(vrijGeheugenUitMeminfo("MemTotal: 1 kB")).toBeNull();
  });

  it("vertaalt de status van de live-zetter naar een uitkomst", () => {
    const s = (staat: string, bericht = "") => ({ id: "live_1", staat, bericht });
    expect(uitkomstVanStatus(s("klaar"), "live_1")).toBe("klaar");
    expect(uitkomstVanStatus(s("wacht-op-akkoord"), "live_1")).toBe("migratie");
    expect(uitkomstVanStatus(s("mislukt", "Niet live gezet: de controle faalt"), "live_1")).toBe("geweigerd");
    expect(uitkomstVanStatus(s("teruggezet"), "live_1")).toBe("geweigerd");
    expect(uitkomstVanStatus(s("mislukt", "AUTO_VERSCHOVEN: main is verder gegaan"), "live_1")).toBe("tijdelijk");
    expect(uitkomstVanStatus(s("mislukt", "Er loopt al een andere uitrol op de server"), "live_1")).toBe("tijdelijk");
    expect(uitkomstVanStatus(s("bezig"), "live_1")).toBe("bezig");
    expect(uitkomstVanStatus({ id: "anders", staat: "klaar", bericht: "" }, "live_1")).toBe("bezig");
    expect(uitkomstVanStatus(null, "live_1")).toBe("bezig");
  });

  it("meldt een geweigerde versie, een wachtende migratie en een achterstand van meer dan 30 minuten", () => {
    const geweigerd = meldingen({ ...LEGE_STAND, gezienSha: MAIN, geweigerd: { [MAIN]: { reden: "controle faalt", op: "x" } } }, LIVE, NU);
    expect(geweigerd.map((m) => m.id)).toEqual(["auto-uitrol-geweigerd"]);
    const migratie = meldingen({ ...LEGE_STAND, gezienSha: MAIN, migratieWacht: { sha: MAIN, migraties: ["m1"], op: "x" } }, LIVE, NU);
    expect(migratie.map((m) => m.id)).toEqual(["auto-uitrol-migratie"]);
    const oud = new Date(NU - ACHTERSTAND_MELDING_MS - 1000).toISOString();
    const achter = meldingen({ ...LEGE_STAND, gezienSha: MAIN, achterSinds: oud, laatsteBeslissing: { op: oud, actie: "wacht", reden: "Te weinig vrij geheugen" } }, LIVE, NU);
    expect(achter.map((m) => m.id)).toEqual(["auto-uitrol-achter"]);
    expect(achter[0]?.tekst).toContain("Te weinig vrij geheugen");
    // recent, of al live, of uitgeschakeld: geen melding
    expect(meldingen({ ...LEGE_STAND, gezienSha: MAIN, achterSinds: new Date(NU - 60_000).toISOString() }, LIVE, NU)).toEqual([]);
    expect(meldingen({ ...LEGE_STAND, gezienSha: MAIN, geweigerd: { [MAIN]: { reden: "x", op: "x" } } }, MAIN, NU)).toEqual([]);
    expect(meldingen({ ...LEGE_STAND, gezienSha: MAIN, achterSinds: oud }, LIVE, NU, false)).toEqual([]);
  });

  it("de meldingen worden taken voor de eigenaar", () => {
    const todos = autoUitrolTodos([{ id: "auto-uitrol-achter", titel: "Live loopt achter", tekst: "reden" }]);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ id: "auto-uitrol-achter", done: false, auto: true });
    expect(autoUitrolTodos(undefined)).toEqual([]);
  });
});

describe("Auto-uitrol: aangesloten op de server", () => {
  it("de vlag staat standaard uit en de lus is ingepland met een hartslag", () => {
    const vlaggen = lees("lib/flags/index.ts");
    expect(vlaggen).toMatch(/key: "auto-uitrol"[^\n]*default: false/);
    expect(lees("deploy/cron/entrypoint.sh")).toMatch(/\*\/2 \* \* \* \* wget [^\n]*\/api\/internal\/auto-uitrol"/);
    expect(lees("lib/ops/heartbeat.ts")).toContain('job: "auto-uitrol"');
    expect(lees("app/api/internal/auto-uitrol/route.ts")).toContain('recordCronHeartbeat("auto-uitrol"');
  });

  it("de lus zet nooit forceer, zonder controle of migraties in het verzoek", () => {
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain("forceer: false, zonderControle: false, auto: true, doelSha:");
    expect(bron).toContain("migraties: []");
    expect(bron).not.toMatch(/forceer: true|zonderControle: true|destructiefAkkoord: true/);
  });

  it("de live-zetter kent de auto-verzoeken: versie 3, geen forceren, geen uitrol zonder uitslag, schema in de controle", () => {
    const py = lees("deploy/bouwer/zf-live.py");
    expect(py).toMatch(/^VERSIE = 3/m);
    expect(py).toContain('self.v["forceer"] = False');
    expect(py).toContain('self.v["zonderControle"] = False');
    expect(py).toContain("AUTO_VERSCHOVEN");
    expect(py).toContain("AUTO_GEEN_CONTROLE");
    expect(py).toContain('"schema": "het databaseschema"');
    const controle = lees("deploy/bouwer/werker/controle.mjs");
    expect(controle).toContain('["prisma", "validate"]');
    expect(controle).toMatch(/ok: tsc\.code === 0 && schema\.ok && eslint\.ok && tests\.ok/);
  });

  it("de beheerroutes zijn strikt voor platformbeheer en de schakelaar werkt via de vlag", () => {
    const route = lees("app/api/admin/bouwer/auto-uitrol/route.ts");
    expect(route).toContain('["PLATFORM_ADMIN"]');
    expect(route).toContain('setFlag("auto-uitrol"');
    expect(lees("components/admin/bouwer/LiveZetten.tsx")).toContain("<AutoUitrolPaneel />");
  });

  it("GitHub Actions blijft uit: geen workflow in .github/workflows", () => {
    let aanwezig: string[] = [];
    try {
      aanwezig = readFileSyncDir(".github/workflows");
    } catch {
      aanwezig = [];
    }
    expect(aanwezig).toEqual([]);
  });
});

import { readdirSync } from "node:fs";
function readFileSyncDir(rel: string): string[] {
  return readdirSync(path.join(process.cwd(), rel)).filter((n) => /\.ya?ml$/.test(n));
}