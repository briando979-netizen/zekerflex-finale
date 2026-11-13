import { afterEach, describe, expect, it, vi } from "vitest";

const alertOwner = vi.fn(async (..._a: unknown[]) => "sent" as const);
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
const heartbeat = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/ops/heartbeat", () => ({ recordCronHeartbeat: (...a: unknown[]) => heartbeat(...a) }));

import { beoordeelGeheugen, checkGeheugen, geheugenMelding, parseMeminfo } from "@/lib/ops/geheugen";

const meminfo = (beschikbaarMb: number, swapUsedPct: number) =>
  [
    "MemTotal:       16322560 kB",
    "MemFree:          100000 kB",
    `MemAvailable:   ${beschikbaarMb * 1024} kB`,
    "SwapTotal:       4194300 kB",
    `SwapFree:        ${Math.round(4194300 * (1 - swapUsedPct / 100))} kB`,
  ].join("\n");

afterEach(() => vi.clearAllMocks());

describe("geheugenbewaking", () => {
  it("leest /proc/meminfo", () => {
    expect(parseMeminfo(meminfo(7820, 100))).toEqual({ beschikbaarMb: 7820, totaalMb: 15940, wisselPercent: 100 });
  });

  it("geeft null bij een bestand zonder de nodige regels", () => {
    expect(parseMeminfo("Cached: 1 kB")).toBeNull();
    expect(parseMeminfo("")).toBeNull();
  });

  it("zonder wisselruimte is het wisselpercentage 0", () => {
    expect(parseMeminfo("MemTotal: 1024 kB\nMemAvailable: 512 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB")?.wisselPercent).toBe(0);
  });

  it("een volle wisselruimte met veel geheugen over is geen probleem (zo staat de server nu)", () => {
    expect(beoordeelGeheugen({ beschikbaarMb: 7820, totaalMb: 15940, wisselPercent: 100 }).stand).toBe("ok");
    expect(geheugenMelding({ beschikbaarMb: 7820, totaalMb: 15940, wisselPercent: 100 })).toBeNull();
  });

  it("let op bij weinig geheugen, of een volle wisselruimte met een kleine marge", () => {
    expect(beoordeelGeheugen({ beschikbaarMb: 1800, totaalMb: 15940, wisselPercent: 20 }).stand).toBe("let-op");
    expect(beoordeelGeheugen({ beschikbaarMb: 2500, totaalMb: 15940, wisselPercent: 95 }).stand).toBe("let-op");
  });

  it("kritiek als er bijna niets over is, of weinig over én de wisselruimte vol", () => {
    expect(beoordeelGeheugen({ beschikbaarMb: 800, totaalMb: 15940, wisselPercent: 10 }).stand).toBe("kritiek");
    expect(beoordeelGeheugen({ beschikbaarMb: 1500, totaalMb: 15940, wisselPercent: 97 }).stand).toBe("kritiek");
  });

  it("de melding is gewoon Nederlands en wijst naar Systeem", () => {
    const m = geheugenMelding({ beschikbaarMb: 500, totaalMb: 15940, wisselPercent: 99 })!;
    expect(m).toMatchObject({ key: "geheugen:kritiek", severity: "critical", url: "/admin/systeem" });
    expect(`${m.title} ${m.detail}`).not.toMatch(/deploy|container|swap|oom/i);
  });

  it("waarschuwt de eigenaar en schrijft een hartslag bij een lage stand", async () => {
    const g = await checkGeheugen(async () => meminfo(900, 50));
    expect(g?.beschikbaarMb).toBe(900);
    expect(alertOwner).toHaveBeenCalledTimes(1);
    expect(heartbeat).toHaveBeenCalledWith("geheugen-check", true);
  });

  it("zegt niets als alles ruim is, maar schrijft wel een hartslag", async () => {
    await checkGeheugen(async () => meminfo(7000, 100));
    expect(alertOwner).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledWith("geheugen-check", true);
  });

  it("gooit nooit als het bestand er niet is", async () => {
    expect(await checkGeheugen(async () => Promise.reject(new Error("ENOENT")))).toBeNull();
    expect(alertOwner).not.toHaveBeenCalled();
  });
});
