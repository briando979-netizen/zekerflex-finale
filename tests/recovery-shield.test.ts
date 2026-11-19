import { describe, expect, it } from "vitest";
import type { BackupReport } from "@/lib/ops/backup";
import { herstelStand } from "@/lib/ops/herstel-regels";

// Pure regels van ZekerFlex Recovery Shield: één oordeel uit het back-uprapport.

function rapport(over: Partial<BackupReport> = {}): BackupReport {
  return {
    available: true,
    state: "ok",
    reasons: [],
    status: {
      at: "2026-11-19T02:30:00Z",
      ok: true,
      file: "zekerflex-20261119-0230.dump",
      bytes: 1000,
      storageFile: "storage-20261119-0230.tar.gz",
      storageBytes: 1000,
      seconds: 40,
      restore: { ok: true, tables: 180, users: 100, liveUsers: 100 },
      kept: 14,
      error: "",
      encrypted: true,
      offsite: { configured: true, target: "scp", ok: true, error: "" },
    },
    files: [],
    disk: null,
    waarschuwing: null,
    ophaal: { state: "ok", reasons: [], status: { at: "2026-11-19T06:00:00Z", set: "20261119-0230" } },
    verificatie: { state: "ok", reasons: [], status: null, history: [] },
    ...over,
  };
}

describe("herstelStand", () => {
  it("alles in orde is sterk, zes van zes", () => {
    const s = herstelStand(rapport());
    expect(s.niveau).toBe("sterk");
    expect(s.goed).toBe(6);
    expect(s.totaal).toBe(6);
  });

  it("zonder kopie op de eigen pc is het redelijk en zegt hij waarom", () => {
    const s = herstelStand(rapport({ ophaal: { state: "uit", reasons: [], status: null } }));
    expect(s.niveau).toBe("redelijk");
    const onwisbaar = s.controles.find((c) => c.id === "onwisbaar");
    expect(onwisbaar?.uitslag).toBe("let-op");
    expect(onwisbaar?.uitleg).toContain("inbreekt");
  });

  it("een mislukte back-up of kopie buiten de server is kwetsbaar", () => {
    expect(herstelStand(rapport({ state: "failed", reasons: ["De back-up is mislukt."] })).niveau).toBe("kwetsbaar");
    const basis = rapport().status!;
    const s = herstelStand(rapport({ status: { ...basis, offsite: { configured: true, target: "scp", ok: false, error: "x" } } }));
    expect(s.niveau).toBe("kwetsbaar");
    expect(s.controles.find((c) => c.id === "buiten")?.uitslag).toBe("probleem");
  });

  it("geen kopie buiten de server ingesteld is een waarschuwing, geen probleem", () => {
    const basis = rapport().status!;
    const s = herstelStand(rapport({ status: { ...basis, offsite: { configured: false, target: "", ok: false, error: "" } } }));
    expect(s.controles.find((c) => c.id === "buiten")?.uitslag).toBe("let-op");
    expect(s.niveau).toBe("redelijk");
  });

  it("een te oude hersteltest is let-op, een mislukte is een probleem", () => {
    expect(herstelStand(rapport({ verificatie: { state: "stale", reasons: [], status: null, history: [] } })).controles.find((c) => c.id === "hersteltest")?.uitslag).toBe("let-op");
    expect(herstelStand(rapport({ verificatie: { state: "failed", reasons: [], status: null, history: [] } })).niveau).toBe("kwetsbaar");
  });

  it("zonder back-updienst is het onbekend", () => {
    const s = herstelStand(rapport({ available: false }));
    expect(s.niveau).toBe("onbekend");
    expect(s.controles).toEqual([]);
  });
});
