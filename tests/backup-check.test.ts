import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De nachtelijke back-up (deploy/backup/entrypoint.sh) schrijft status.json; de
// app beoordeelt die en waarschuwt de eigenaar als een nacht mislukt of uitblijft.

const alertOwner = vi.fn(async (..._a: unknown[]) => "sent" as const);
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
const recordCronRun = vi.fn();
vi.mock("@/lib/metrics", () => ({ recordCronRun: (...a: unknown[]) => recordCronRun(...a) }));

const { checkBackup, diskAlert, diskUsage, evaluateBackup, parseBackupStatus, readBackupReport } = await import("@/lib/ops/backup");

const NOW = new Date("2026-11-03T04:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const good = {
  at: hoursAgo(1.5),
  ok: true,
  file: "zekerflex-20261103-0230.dump",
  bytes: 8_448_424,
  storageFile: "storage-20261103-0230.tar.gz",
  storageBytes: 216_762,
  seconds: 3,
  restore: { ok: true, tables: 73, users: 24, liveUsers: 24 },
  kept: 1,
  error: "",
};

describe("back-up beoordelen", () => {
  it("een verse, proef-teruggezette back-up is in orde", () => {
    expect(evaluateBackup(parseBackupStatus(good), true, NOW)).toEqual({ state: "ok", reasons: [] });
  });

  it("zonder status is er nog geen back-up", () => {
    expect(evaluateBackup(null, false, NOW).state).toBe("missing");
    expect(parseBackupStatus({ ok: true })).toBeNull();
    expect(parseBackupStatus("onzin")).toBeNull();
  });

  it("een mislukte dump of proef-terugzetting is mislukt, met de reden erbij", () => {
    const failed = evaluateBackup(parseBackupStatus({ ...good, ok: false, file: "", bytes: 0, error: "pg_dump: connection refused" }), false, NOW);
    expect(failed.state).toBe("failed");
    expect(failed.reasons.join(" ")).toContain("connection refused");

    const noRestore = evaluateBackup(parseBackupStatus({ ...good, ok: false, restore: { ...good.restore, ok: false } }), true, NOW);
    expect(noRestore.state).toBe("failed");
    expect(noRestore.reasons).toContain("De proef-terugzetting is niet gelukt.");
  });

  it("een bestand dat van de schijf verdwenen is telt niet als back-up", () => {
    expect(evaluateBackup(parseBackupStatus(good), false, NOW).state).toBe("failed");
  });

  it("na 26 uur zonder nieuwe back-up is hij te oud", () => {
    expect(evaluateBackup(parseBackupStatus({ ...good, at: hoursAgo(25) }), true, NOW).state).toBe("ok");
    expect(evaluateBackup(parseBackupStatus({ ...good, at: hoursAgo(27) }), true, NOW).state).toBe("stale");
  });

  it("rekent de schijf net als df", () => {
    // 75 blokken gebruikt, 25 vrij waarvan 5 gereserveerd voor root: df zegt 75 / 95 = 79%
    const d = diskUsage(100, 25, 20, 4096);
    expect(d.usedPercent).toBe(79);
    expect(d.freeBytes).toBe(20 * 4096);
    expect(d.totalBytes).toBe(100 * 4096);
  });

  it("waarschuwt vanaf 85% vol, kritiek vanaf 95%, met een opruimtip die echt werkt", () => {
    const disk = (usedPercent: number) => ({ usedPercent, freeBytes: 11 * 1024 ** 3, totalBytes: 96 * 1024 ** 3 });
    expect(diskAlert(null)).toBeNull();
    expect(diskAlert(disk(84))).toBeNull();
    expect(diskAlert(disk(89))).toMatchObject({ key: "disk:server", severity: "warning", title: "Serverschijf 89% vol" });
    expect(diskAlert(disk(96))?.severity).toBe("critical");
    // a plain `builder prune -f` freed nothing on 3 Nov 2026; the tip must be the -a variant
    expect(diskAlert(disk(89))?.detail).toContain("builder prune -af");
    expect(diskAlert(disk(89))?.detail).toContain("11 GB vrij");
  });
});

describe("back-upmap lezen en controleren", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "zf-backup-"));
    await mkdir(path.join(dir, "db"));
  });
  afterEach(async () => {
    vi.clearAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("zonder map is er niets te controleren en geen melding", async () => {
    const report = await checkBackup(NOW, path.join(dir, "bestaat-niet"));
    expect(report.available).toBe(false);
    expect(alertOwner).not.toHaveBeenCalled();
    expect(recordCronRun).not.toHaveBeenCalled();
  });

  it("een goede back-up geeft een hartslag en geen melding", async () => {
    await writeFile(path.join(dir, "db", good.file), Buffer.alloc(2048));
    await writeFile(path.join(dir, "status.json"), JSON.stringify(good));
    const report = await checkBackup(NOW, dir);
    expect(report.state).toBe("ok");
    expect(report.files.map((f) => f.name)).toEqual([good.file]);
    expect(recordCronRun).toHaveBeenCalledWith("db-backup", true);
    expect(alertOwner.mock.calls.filter((c) => (c[0] as { key: string }).key === "backup:db")).toHaveLength(0);
  });

  it("een mislukte nacht waarschuwt de eigenaar en geeft geen hartslag", async () => {
    await writeFile(path.join(dir, "status.json"), JSON.stringify({ ...good, ok: false, file: "", bytes: 0, error: "pg_dump: disk full" }));
    const report = await checkBackup(NOW, dir);
    expect(report.state).toBe("failed");
    expect(recordCronRun).not.toHaveBeenCalled();
    expect(alertOwner).toHaveBeenCalledWith(expect.objectContaining({ key: "backup:db", severity: "critical" }));
  });

  it("een map zonder status.json is nog geen back-up", async () => {
    const report = await readBackupReport(dir, NOW);
    expect(report.available).toBe(true);
    expect(report.state).toBe("missing");
  });
});
