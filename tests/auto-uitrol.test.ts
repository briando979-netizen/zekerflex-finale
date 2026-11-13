import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACHTERSTAND_MELDING_MS,
  LEGE_STAND,
  MIN_LIVEZETTER_VERSIE,
  MIN_VRIJ_GEHEUGEN_MB,
  RUST_MS,
  NACONTROLE_RONDGANG_MAX_MS,
  NACONTROLE_WACHT_MS,
  beoordeelNacontrole,
  beslis,
  inOllamaVenster,
  meldingen,
  registreerUitstel,
  rustVoorbij,
  slotVrij,
  uitkomstVanStatus,
  vrijGeheugenUitMeminfo,
  zietMain,
  type AutoStand,
  type Invoer,
  type NaInvoer,
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

describe("Auto-uitrol: de nacontrole (harde stop)", () => {
  const KLAAR = Date.parse("2026-11-14T10:00:00Z");
  const na = (extra: Partial<NaInvoer> = {}, minuten = 4): NaInvoer => ({
    nu: KLAAR + minuten * 60_000,
    sha: MAIN,
    sinds: new Date(KLAAR).toISOString(),
    versie: MAIN,
    gezond: true,
    liveStaat: "klaar",
    rondgang: { at: new Date(KLAAR + 3.5 * 60_000).toISOString(), totaal: 105, ok: 105, problemen: 0 },
    ...extra,
  });

  it("stopt niet bij groen: gezond, juiste VERSIE en een schone rondgang", () => {
    expect(beoordeelNacontrole(na()).uitslag).toBe("ok");
  });

  it("stopt bij een rode rondgang (kapotte pagina's of ok kleiner dan totaal)", () => {
    const r = beoordeelNacontrole(na({ rondgang: { at: new Date(KLAAR + 3.5 * 60_000).toISOString(), totaal: 105, ok: 103, problemen: 2 } }));
    expect(r.uitslag).toBe("stop");
    expect(r.reden).toMatch(/rondgang/);
    expect(beoordeelNacontrole(na({ rondgang: { at: new Date(KLAAR + 3.5 * 60_000).toISOString(), totaal: 10, ok: 9, problemen: 0 } })).uitslag).toBe("stop");
  });

  it("stopt bij een verkeerde VERSIE en bij een app die niet gezond is", () => {
    expect(beoordeelNacontrole(na({ versie: LIVE })).uitslag).toBe("stop");
    expect(beoordeelNacontrole(na({ versie: null })).uitslag).toBe("stop");
    expect(beoordeelNacontrole(na({ gezond: false })).uitslag).toBe("stop");
  });

  it("stopt als de live-zetter teruggezet of mislukt meldt, ook binnen de wachttijd", () => {
    expect(beoordeelNacontrole(na({ liveStaat: "teruggezet" }, 1)).uitslag).toBe("stop");
    expect(beoordeelNacontrole(na({ liveStaat: "mislukt" }, 1)).uitslag).toBe("stop");
  });

  it("wacht de eerste 3 minuten af", () => {
    expect(beoordeelNacontrole(na({}, NACONTROLE_WACHT_MS / 60_000 - 0.5)).uitslag).toBe("wacht");
  });

  it("stopt NIET bij ontbrekende of oude rondgang binnen 15 minuten: afwachten; daarna onbekend (geen stop)", () => {
    expect(beoordeelNacontrole(na({ rondgang: null }, 5)).uitslag).toBe("wacht");
    // een rondgang van vóór de uitrol telt niet
    expect(beoordeelNacontrole(na({ rondgang: { at: new Date(KLAAR - 3_600_000).toISOString(), totaal: 105, ok: 50, problemen: 55 } }, 5)).uitslag).toBe("wacht");
    const laat = beoordeelNacontrole(na({ rondgang: null }, NACONTROLE_RONDGANG_MAX_MS / 60_000 + 1));
    expect(laat.uitslag).toBe("onbekend");
    expect(laat.reden).toMatch(/15 minuten/);
  });

  it("een rondgang ouder dan 15 minuten telt niet als vers", () => {
    const oud = { at: new Date(KLAAR + 3.5 * 60_000).toISOString(), totaal: 105, ok: 105, problemen: 0 };
    expect(beoordeelNacontrole(na({ rondgang: oud }, 25)).uitslag).toBe("onbekend");
  });

  it("regel 0b: met een stop-reden rolt de lus nooit meer uit, ook niet bij een schone controle", () => {
    const stop = { reden: "nacontrole faalde: de app antwoordt niet", sha: MAIN, op: "2026-11-14T10:05:00Z" };
    const b = beslis(invoer({}, { stop }));
    expect(b.actie).toBe("niets");
    expect(b.reden).toMatch(/Gestopt door de nacontrole/);
    expect(beslis(invoer({ aan: true, noodrem: false }, { stop, gezienSha: "e".repeat(40) })).actie).toBe("niets");
  });

  it("de harde stop meldt zichzelf aan de eigenaar", () => {
    const stop = { reden: "nacontrole faalde: x", sha: MAIN, op: "2026-11-14T10:05:00Z" };
    expect(meldingen({ ...LEGE_STAND, gezienSha: MAIN, stop }, MAIN, NU).map((m) => m.id)).toContain("auto-uitrol-stop");
  });

  it("de uitvoering zet bij een stop de vlag uit, de noodrem met reden en logt het", () => {
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain('setFlag("auto-uitrol", { enabled: false }');
    expect(bron).toContain("zetNoodrem(true, AUTO_UITROL_DOOR, reden)");
    expect(bron).toContain('journal("error", "auto-uitrol: harde stop"');
    expect(bron).toContain("nacontrole faalde: ${na.reden}");
    // de beheerroute: een mens die aanzet, haalt de stop weg
    expect(lees("app/api/admin/bouwer/auto-uitrol/route.ts")).toContain("herstelNaStop(");
  });
});

describe("Auto-uitrol: review van poortwachter 15", () => {
  it("regel 0c: eerst de nacontrole van de vorige uitrol afronden, dan pas een nieuwe beslissing", () => {
    const nacontrole = { sha: LIVE, id: "live_1", sinds: new Date(NU - 60_000).toISOString(), rondgangGestart: null };
    const b = beslis(invoer({}, { nacontrole }));
    expect(b.actie).toBe("wacht");
    expect(b.reden).toMatch(/nacontrole van de vorige uitrol/);
  });

  it("een tijdelijk uitgestelde uitrol: hoogstens 3 pogingen met 10 minuten ertussen, daarna geweigerd", () => {
    let stand: AutoStand = { ...LEGE_STAND, gezienSha: MAIN, gezienSinds: RUSTIG };
    stand = registreerUitstel(stand, MAIN, NU, "al een andere uitrol");
    expect(stand.uitgesteld[MAIN]?.pogingen).toBe(1);
    expect(beslis(invoer({}, stand)).actie).toBe("wacht");
    expect(beslis(invoer({ nu: NU + UITSTEL_WACHT_MS + 1000 }, { ...stand })).actie).toBe("uitrollen");
    stand = registreerUitstel(stand, MAIN, NU + UITSTEL_WACHT_MS, "al een andere uitrol");
    expect(stand.uitgesteld[MAIN]?.pogingen).toBe(2);
    expect(stand.geweigerd[MAIN]).toBeUndefined();
    stand = registreerUitstel(stand, MAIN, NU + 2 * UITSTEL_WACHT_MS, "al een andere uitrol");
    expect(UITSTEL_MAX_POGINGEN).toBe(3);
    expect(stand.geweigerd[MAIN]?.reden).toMatch(/3 keer/);
    expect(stand.uitgesteld[MAIN]).toBeUndefined();
    expect(beslis(invoer({}, stand)).actie).toBe("niets");
  });

  it("het ronde-slot: vrij zonder slot, bezet binnen 10 minuten, overneembaar daarna", () => {
    expect(slotVrij(null, NU)).toBe(true);
    expect(slotVrij({ op: new Date(NU - 60_000).toISOString() }, NU)).toBe(false);
    expect(slotVrij({ op: new Date(NU - RONDE_SLOT_TTL_MS - 1000).toISOString() }, NU)).toBe(true);
    expect(slotVrij({}, NU)).toBe(true);
  });

  it("(1) de controle start met de live VERSIE als basis", () => {
    expect(lees("lib/bouwer/auto-uitrol.ts")).toContain("startControle(besluit.sha, AUTO_UITROL_DOOR, false, live?.sha)");
    expect(lees("lib/bouwer/controles.ts")).toContain('...(vanaf ? { vanaf } : {})');
  });

  it("(2) een verzoek wordt alleen geschreven als er geen ligt: ON CONFLICT DO NOTHING en de rijen tellen", () => {
    expect(lees("lib/bouwer/live.ts")).toContain("kvSetIfAbsent(K_VERZOEK, verzoek)");
    const kv = lees("lib/storage/kv.ts");
    expect(kv).toContain("skipDuplicates: true");
    expect(kv).toContain("res.count === 1");
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain("plaatsVerzoekAlsLeeg(");
    expect(bron).not.toMatch(/\bplaatsVerzoek\(/);
    expect(bron).toContain("Er lag al een verzoek van iemand anders");
  });

  it("(3) een ronde heeft een eigen KV-slot dat altijd wordt vrijgegeven", () => {
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain("kvSetIfAbsent(K_RONDE_SLOT, mijn)");
    expect(bron).toMatch(/finally \{\s*await kvDelete\(K_RONDE_SLOT\)/);
  });

  it("(4) lukt het lezen van de stand niet, dan schrijft de ronde niets", () => {
    const opslag = lees("lib/bouwer/auto-uitrol-opslag.ts");
    expect(opslag).toContain("(await kvGet<AutoStand>(K_AUTO_STAND)) ??");
    expect(opslag).not.toMatch(/kvGet<AutoStand>\(K_AUTO_STAND\)\.catch/);
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toMatch(/catch \{\s*return \{ besluit: \{ actie: "wacht", reden: "De opslag is niet te lezen: deze ronde schreef niets\."/);
  });

  it("(7) geen rondgang na 15 minuten is ook een harde stop, met reden", () => {
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain("nacontrole onbekend na 15 min:");
    expect(bron).toMatch(/na\.uitslag === "onbekend"\) \{[^}]*hardeStop/s);
  });

  it("(9) GitHub: een voorwaardelijk verzoek (ETag, 304), het leestoken alleen als Bearer, nooit gelogd, en 429 wacht netjes", () => {
    const live = lees("lib/bouwer/live.ts");
    expect(live).toContain('"If-None-Match": etag');
    expect(live).toContain('res.status === 304');
    expect(live).toContain("de GitHub-limiet is bereikt (429)");
    expect(live).toContain("Authorization: `Bearer ${t}`");
    const bron = lees("lib/bouwer/auto-uitrol.ts");
    expect(bron).toContain("githubMainSha(cache?.etag ?? null)");
    expect(bron).not.toMatch(/githubOverzicht|GITHUB_LEES_TOKEN|console\./);
    expect(bron).toContain("Main is nu niet te lezen: ${main.fout");
  });

  it("(10) de controle compileert de Python-bestanden van de uitrol, en de README vraagt geen herstart van zf-live", () => {
    const controle = lees("deploy/bouwer/werker/controle.mjs");
    expect(controle).toContain('"-m", "py_compile"');
    expect(controle).toMatch(/ok: tsc\.code === 0 && schema\.ok && python\.ok && eslint\.ok && tests\.ok/);
    expect(controle).toContain("python3 ontbreekt in de Bouwer");
    const py = lees("deploy/bouwer/zf-live.py");
    expect(py).toContain('"python": "de Python-bestanden"');
    const readme = lees("deploy/bouwer/README.md");
    expect(readme).not.toContain("sudo systemctl restart zf-live");
    expect(readme).toContain("Een herstart van `zf-live` is niet nodig");
  });
});

describe("zf-live.py laadt zichzelf alleen opnieuw als het nieuwe bestand compileert", () => {
  const py = readFileSync(path.join(process.cwd(), "deploy/bouwer/zf-live.py"), "utf8").split("\r\n").join("\n");

  it("compileert het nieuwe bestand vóór de herstart, en herstart niet bij een fout (geen execv-lus)", () => {
    expect(py).toContain("def moet_herladen(");
    expect(py).toContain("def controleer_syntax(");
    expect(py).toContain("py_compile.compile(pad, cfile=cfile, doraise=True)");
    // de enige os.execv staat in herlaad_zo_nodig, ná de syntaxcontrole en het onthouden van een mislukte hash
    expect(py.match(/os\.execv\(/g)?.length).toBe(1);
    const herlaad = py.slice(py.indexOf("def herlaad_zo_nodig"), py.indexOf("def hartslag"));
    expect(herlaad.indexOf("controleer_syntax(pad)")).toBeLessThan(herlaad.indexOf("os.execv("));
    expect(herlaad).toContain("HERLAAD_MISLUKT.update(hash=nieuw, reden=reden)");
    expect(herlaad).toMatch(/if reden:[\s\S]*?return\n/);
    expect(py).toContain("herlaad_zo_nodig()");
    expect(py).toContain("GELADEN_HASH = bestand_hash(os.path.abspath(__file__))");
  });

  it("zet de fout kort (zonder paden) in de KV en in de hartslag", () => {
    expect(py).toContain('K_HERLAAD = "bouwer:live:herlaadfout"');
    expect(py).toContain('gegevens["herlaadFout"] = HERLAAD_MISLUKT["reden"]');
    expect(py).toContain('re.sub(r"/\\S+/", ""');
    expect(lees("lib/bouwer/live.ts")).toContain("herlaadFout?: string;");
  });

  it("README: de zekere controle van zf-live.py zit in zf-live zelf (de Bouwer heeft geen python3)", () => {
    expect(lees("deploy/bouwer/README.md")).toContain("De zekere controle van `zf-live.py` zit in zf-live zelf");
  });

  // Draait alleen waar python3 met fcntl bestaat (de server of een Linux-ontwikkelmachine); de Bouwer-container heeft geen python3.
  const probe = spawnSync("python3", ["-c", "import fcntl"], { encoding: "utf8" });
  const heeftPython = !probe.error && probe.status === 0;
  it.skipIf(!heeftPython)("de beslislogica en de syntaxcontrole werken echt (met python3)", () => {
    const map = mkdtempSync(path.join(tmpdir(), "zf-live-"));
    writeFileSync(path.join(map, "goed.py"), "x = 1\n");
    writeFileSync(path.join(map, "fout.py"), "def kapot(:\n    pass\n");
    const script = [
      "import importlib.util, json, sys",
      `spec = importlib.util.spec_from_file_location("zflive", ${JSON.stringify(path.join(process.cwd(), "deploy/bouwer/zf-live.py"))})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      `goed = m.controleer_syntax(${JSON.stringify(path.join(map, "goed.py"))})`,
      `fout = m.controleer_syntax(${JSON.stringify(path.join(map, "fout.py"))})`,
      "print(json.dumps({'goed': goed, 'fout': fout, 'a': m.moet_herladen('h1','h2',None), 'b': m.moet_herladen('h1','h1',None), 'c': m.moet_herladen('h1','h2','h2'), 'd': m.moet_herladen('h1',None,None), 'e': m.moet_herladen(None,'h2','h3')}))",
    ].join("\n");
    const uit = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(uit.status, uit.stderr).toBe(0);
    const r = JSON.parse(uit.stdout.trim().split("\n").pop() ?? "{}") as Record<string, unknown>;
    expect(r.goed).toBeNull();
    expect(typeof r.fout).toBe("string");
    expect(String(r.fout)).not.toMatch(/\//);
    expect(r.a).toBe(true); // veranderd bestand: herladen
    expect(r.b).toBe(false); // ongewijzigd: niet herladen
    expect(r.c).toBe(false); // dit kapotte bestand is al afgewezen: niet nog eens
    expect(r.d).toBe(false); // niet te lezen: niet herladen
    expect(r.e).toBe(true); // een ander bestand dan het afgewezene: wel proberen
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
    expect(controle).toMatch(/ok: tsc\.code === 0 && schema\.ok && python\.ok && eslint\.ok && tests\.ok/);
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