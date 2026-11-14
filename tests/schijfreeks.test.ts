import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KNIK_PERCENT,
  REEKS_MAX_PUNTEN,
  TREND_MIN_MS,
  beoordeelSchijf,
  dagenTot,
  groeiPerDag,
  maakPunt,
  ondergrens,
  voegPuntToe,
  type SchijfPunt,
} from "@/lib/ops/schijfreeks";

const h = vi.hoisted(() => ({ meting: vi.fn(async () => null), disk: vi.fn(async () => ({ usedPercent: 50 })) }));
vi.mock("@/lib/env", () => ({ env: { INTERNAL_CRON_TOKEN: "geheim-token", CRON_SECRET: "" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock("@/lib/ops/backup", () => ({ checkBackup: async () => ({}), checkDisk: () => h.disk() }));
vi.mock("@/lib/ops/geheugen", () => ({ checkGeheugen: async () => null }));
vi.mock("@/lib/ops/schijfreeks-meting", () => ({ bewaarSchijfmeting: () => h.meting() }));

const GB = 1024 ** 3;
const UUR = 3_600_000;
const DAG = 24 * UUR;
const T0 = Date.parse("2026-11-01T00:00:00Z");
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

/** Een reeks van `n` uurpunten op een schijf van 100 GB: begint op `start` GB en groeit `perDag` GB per dag. */
function reeks(n: number, start: number, perDag: number, t0: number = T0): SchijfPunt[] {
  return Array.from({ length: n }, (_, i) => {
    const gebruikt = (start + (perDag * i) / 24) * GB;
    return { t: t0 + i * UUR, gebruikt, totaal: 100 * GB, pct: Math.round(gebruikt / (100 * GB) * 1000) / 10 };
  });
}

describe("schijfreeks: een punt maken", () => {
  it("rekent het percentage zoals df, op een decimaal, en bewaart alleen getallen", () => {
    const p = maakPunt(1000, 400, 350, 4096, T0);
    expect(p).toEqual({ t: T0, gebruikt: 600 * 4096, totaal: 1000 * 4096, pct: 63.2 });
    expect(Object.keys(p).sort()).toEqual(["gebruikt", "pct", "t", "totaal"]);
  });
});

describe("schijfreeks: punten toevoegen", () => {
  it("begint met een lege reeks en negeert kapotte waarden", () => {
    const p = reeks(1, 50, 0)[0] as SchijfPunt;
    expect(voegPuntToe(undefined, p)).toEqual([p]);
    expect(voegPuntToe(null, p)).toEqual([p]);
    expect(voegPuntToe([{ t: "x" }, 5, null, p], p)).toEqual([p]);
    expect(voegPuntToe([p], { ...p, gebruikt: Number.NaN })).toEqual([p]);
  });

  it("twee metingen binnen een half uur zijn één punt (de nieuwste wint)", () => {
    const [a] = reeks(1, 50, 0) as SchijfPunt[];
    const b = { ...(a as SchijfPunt), t: (a as SchijfPunt).t + 10 * 60_000, gebruikt: 51 * GB };
    const r = voegPuntToe([a as SchijfPunt], b);
    expect(r).toHaveLength(1);
    expect(r[0]?.gebruikt).toBe(51 * GB);
  });

  it("kapt af op 14 dagen en op 336 punten", () => {
    const lang = reeks(24 * 20, 40, 0.5);
    let r: SchijfPunt[] = [];
    for (const p of lang) r = voegPuntToe(r, p);
    expect(REEKS_MAX_PUNTEN).toBe(336);
    expect(r.length).toBeLessThanOrEqual(336);
    expect(r.length).toBeGreaterThan(330);
    const laatste = r[r.length - 1] as SchijfPunt;
    expect(laatste.t - (r[0] as SchijfPunt).t).toBeLessThanOrEqual(14 * DAG);
    // een grote reeks in één keer wordt ook afgekapt
    expect(voegPuntToe(reeks(500, 10, 0, T0), reeks(1, 10, 0, T0 + 500 * UUR)[0] as SchijfPunt).length).toBeLessThanOrEqual(336);
  });
});

describe("schijfreeks: groei en datum", () => {
  it("een lege reeks en één punt geven geen groei, geen datum en geen melding", () => {
    for (const r of [[], reeks(1, 50, 5)]) {
      expect(groeiPerDag(r)).toBeNull();
      expect(dagenTot(r, 85)).toBeNull();
      expect(beoordeelSchijf(r).melding).toBeNull();
    }
    expect(beoordeelSchijf([]).laatste).toBeNull();
  });

  it("meet de groei per dag en de dagen tot 85 en 95 procent", () => {
    const r = reeks(48, 50, 2); // 2 GB per dag, nu ongeveer 53,9 GB
    expect(groeiPerDag(r)! / GB).toBeCloseTo(2, 3);
    const laatste = r[r.length - 1] as SchijfPunt;
    const tot85 = dagenTot(r, 85)!;
    // de datum telt vanaf de ondergrens (het laagste punt van de laatste zes uur), niet vanaf een tijdelijke piek
    const bodem = r[r.length - 1 - 5] as SchijfPunt;
    expect(laatste.gebruikt).toBeGreaterThan(bodem.gebruikt);
    expect(tot85).toBe(Math.round(((85 * GB - bodem.gebruikt) / (2 * GB)) * 10) / 10);
    expect(dagenTot(r, 95)!).toBeGreaterThan(tot85);
  });

  it("een trend die vlak of dalend is geeft geen datum en geen melding", () => {
    expect(dagenTot(reeks(72, 50, 0), 85)).toBeNull();
    expect(dagenTot(reeks(72, 50, 0.001), 85)).toBeNull();
    const dalend = reeks(72, 60, -1);
    expect(groeiPerDag(dalend)).toBeLessThan(0);
    expect(dagenTot(dalend, 85)).toBeNull();
    expect(beoordeelSchijf(dalend).melding).toBeNull();
  });

  it("een te korte periode geeft nog geen groei", () => {
    const korte = reeks(5, 50, 20); // 4 uur
    expect(korte[korte.length - 1]!.t - korte[0]!.t).toBeLessThan(TREND_MIN_MS);
    expect(groeiPerDag(korte)).toBeNull();
  });

  it("een knik in de reeks (een opruiming) begint de trend opnieuw", () => {
    const voor = reeks(48, 60, 4); // stijgt naar ongeveer 68 GB
    const na = reeks(48, 40, 1, T0 + 48 * UUR); // opruiming naar 40 GB, daarna 1 GB per dag
    const r = [...voor, ...na];
    expect(groeiPerDag(r)! / GB).toBeCloseTo(1, 1);
    // de knik is meer dan KNIK_PERCENT van de schijf
    expect((voor[47]!.gebruikt - na[0]!.gebruikt) / (100 * GB) * 100).toBeGreaterThan(KNIK_PERCENT);
    // een kleine schommeling (onder de knikgrens) breekt de trend niet
    const schommel = reeks(48, 50, 2).map((p, i) => (i === 24 ? { ...p, gebruikt: p.gebruikt - 1 * GB } : p));
    expect(groeiPerDag(schommel)! / GB).toBeGreaterThan(1.5);
  });
});

describe("schijfreeks: de zaagtand van de buildcache", () => {
  /** Een vlakke bodem van 60 GB (op een schijf van 100 GB) met tijdelijke pieken van `piek` GB op de gegeven uren. */
  function zaagtand(n: number, bodem: number, piek: number, pieken: number[], perDag = 0): SchijfPunt[] {
    return reeks(n, bodem, perDag).map((p, i) => (pieken.includes(i) ? { ...p, gebruikt: p.gebruikt + piek * GB } : p));
  }

  it("een tijdelijke piek geeft geen waarschuwing (de fout van 14 nov 01:15: 59,9 GB, daarna 71,4 GB)", () => {
    // 7 uur vlak op 60 GB, dan één piek van +12 GB op het laatste punt
    const r = zaagtand(8, 60, 12, [7]);
    expect(groeiPerDag(r)).toBeNull(); // te weinig gegevens aan de ondergrens, geen getal
    expect(beoordeelSchijf(r).melding).toBeNull();
    // en met meer geschiedenis: nog steeds vlak
    const lang = zaagtand(30, 60, 12, [7, 14, 22, 29]);
    expect(Math.abs(groeiPerDag(lang)! / GB)).toBeLessThan(0.01);
    expect(dagenTot(lang, 85)).toBeNull();
    expect(beoordeelSchijf(lang).melding).toBeNull();
  });

  it("een bodem die echt stijgt, wordt wel gemeten, ook met pieken erbovenop", () => {
    // 1 GB per dag op de bodem, met dagelijks een piek van 10 GB
    const r = zaagtand(72, 60, 10, [10, 34, 58], 1);
    expect(groeiPerDag(r)! / GB).toBeGreaterThan(0.8);
    expect(groeiPerDag(r)! / GB).toBeLessThan(1.3);
  });

  it("een stijging die langer dan zes uur blijft, telt wel (het is geen piek meer)", () => {
    const hoog = reeks(30, 60, 0).map((p, i) => (i >= 12 ? { ...p, gebruikt: p.gebruikt + 12 * GB } : p));
    expect(groeiPerDag(hoog)!).toBeGreaterThan(0);
  });

  it("de afstand tot de drempel telt vanaf de ondergrens, niet vanaf de piek", () => {
    // groei van 0,2 GB per dag op de bodem; het laatste punt is een piek tot 84 procent
    const r = zaagtand(48, 60, 24, [47], 0.2);
    expect(r[47]!.gebruikt / GB).toBeGreaterThan(83);
    // vanaf de piek zou 85% over een paar uur zijn; vanaf de bodem (±60 GB) is het ver weg
    expect(dagenTot(r, 85)!).toBeGreaterThan(30);
    expect(beoordeelSchijf(r).melding).toBeNull();
  });

  it("de ondergrens bewaart een schone rechte reeks precies, en begint pas na een vol venster", () => {
    const r = reeks(48, 50, 2);
    const o = ondergrens(r);
    expect(o).toHaveLength(48 - 6);
    expect(o[0]!.t).toBe(r[6]!.t);
    expect(groeiPerDag(r)! / GB).toBeCloseTo(2, 3);
    expect(ondergrens([])).toEqual([]);
  });
});

describe("schijfreeks: waarschuwing", () => {
  it("waarschuwt als de trend 85 procent binnen 7 dagen haalt, niet daarna", () => {
    const snel = reeks(48, 75, 3); // ruim 7 dagen niet; 3 GB per dag vanaf ~77 GB: 85 over ~2,7 dagen
    expect(beoordeelSchijf(snel).dagenTot85!).toBeLessThan(7);
    expect(beoordeelSchijf(snel).melding?.toon).toBe("warn");
    const traag = reeks(48, 50, 1);
    expect(beoordeelSchijf(traag).dagenTot85!).toBeGreaterThan(7);
    expect(beoordeelSchijf(traag).melding).toBeNull();
  });

  it("waarschuwt altijd vanaf 85 procent, en kritiek vanaf 95", () => {
    const vol = reeks(3, 86, 0);
    expect(beoordeelSchijf(vol).melding?.toon).toBe("warn");
    expect(beoordeelSchijf(vol).dagenTot85).toBe(0);
    const bijna = reeks(3, 96, 0);
    expect(beoordeelSchijf(bijna).melding?.toon).toBe("crit");
    expect(beoordeelSchijf(reeks(1, 85.5, 0)).melding?.tekst).toMatch(/85,?\d?%|85\.\d%/);
  });
});

describe("schijfreeks: aangesloten", () => {
  it("de hartslag, de sleutel en het paneel staan erin; de sleutel heeft geen gebruikers-id", () => {
    expect(lees("lib/ops/heartbeat.ts")).toMatch(/job: "schijfreeks"[^\n]*maxAgeHours: 3/);
    const meting = lees("lib/ops/schijfreeks-meting.ts");
    expect(meting).toContain('K_SCHIJFREEKS = "ops:schijfreeks"');
    expect(meting).not.toMatch(/\$\{[^}]*user/i);
    expect(meting).toContain('recordCronHeartbeat("schijfreeks"');
    expect(lees("app/admin/systeem/page.tsx")).toContain("<SchijfreeksPanel />");
    // geen docker in de app: de bouwcache wordt niet gemeten
    expect(meting).not.toMatch(/docker/);
    expect(lees("lib/ops/schijfreeks.ts")).not.toMatch(/child_process|docker\.sock/);
  });

  it("de cron roept de uurlijkse schijfcontrole aan", () => {
    expect(lees("deploy/cron/entrypoint.sh")).toMatch(/15 \* \* \* \* wget [^\n]*\/api\/internal\/backup\/check\?alleen=schijf"/);
  });
});

describe("de interne route voor de schijfreeks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("weigert zonder token, ook voor ?alleen=schijf, en meet dan niets", async () => {
    const { GET } = await import("@/app/api/internal/backup/check/route");
    const res = await GET(new Request("http://app:3000/api/internal/backup/check?alleen=schijf"));
    expect(res.status).toBe(401);
    expect(h.meting).not.toHaveBeenCalled();
    const fout = await GET(new Request("http://app:3000/api/internal/backup/check?alleen=schijf", { headers: { "x-internal-token": "fout" } }));
    expect(fout.status).toBe(401);
    expect(h.meting).not.toHaveBeenCalled();
  });

  it("bewaart met het juiste token een punt", async () => {
    const { GET } = await import("@/app/api/internal/backup/check/route");
    const res = await GET(new Request("http://app:3000/api/internal/backup/check?alleen=schijf", { headers: { "x-internal-token": "geheim-token" } }));
    expect(res.status).toBe(200);
    expect(h.meting).toHaveBeenCalledTimes(1);
  });
});