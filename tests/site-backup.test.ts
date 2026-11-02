import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Nachtelijke back-up van beheerde klantsites: het archief wordt op de server
// gemaakt (tar naar stdout) en terugzetten pakt uit naast de webroot en wisselt.
// Hier draaien die opdrachten echt, in een wegwerpmap.

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListValues: async () => [] }));

const { backupCommand, backupsToPrune, isBackupName, restoreExtractScript } = await import("@/lib/website/site-backup");
const { swapScript } = await import("@/lib/website/deploy");

const hasSh = (() => {
  try {
    execFileSync("sh", ["-c", "command -v tar"]);
    return true;
  } catch {
    return false;
  }
})();
/** Git Bash op Windows: "C:/x" → "/c/x", anders ziet tar "C:" als een andere computer. */
const shPath = (p: string) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_m, d: string) => `/${d.toLowerCase()}/`);
const sh = (script: string) => execFileSync("sh", ["-c", script]);

const base = mkdtempSync(path.join(tmpdir(), "zf-site-backup-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("bewaren", () => {
  it("herkent alleen echte back-upnamen (geen paden of trucs)", () => {
    expect(isBackupName("bakkerij.nl-20261102-013000.tar.gz")).toBe(true);
    for (const bad of ["../geheim.tar.gz", "bakkerij.nl.tar.gz", "x-20261102-013000.tar.gz.part", "/etc/passwd", "a/b-20261102-013000.tar.gz"]) {
      expect(isBackupName(bad)).toBe(false);
    }
  });

  it("houdt de nieuwste 7 en ruimt de rest op", () => {
    const names = Array.from({ length: 10 }, (_, i) => `bakkerij.nl-202611${String(i + 1).padStart(2, "0")}-013000.tar.gz`);
    const prune = backupsToPrune([...names, "bakkerij.nl-20261111-013000.tar.gz.part", "notities.txt"]);
    expect(prune).toEqual(["bakkerij.nl-20261103-013000.tar.gz", "bakkerij.nl-20261102-013000.tar.gz", "bakkerij.nl-20261101-013000.tar.gz"]);
  });
});

describe.skipIf(!hasSh)("back-up en terugzetten op een echte map", () => {
  it("maakt een archief, zet het terug en bewaart de site van daarvoor", () => {
    const parent = path.join(base, "home");
    const site = path.join(parent, "public_html");
    mkdirSync(path.join(site, "img"), { recursive: true });
    writeFileSync(path.join(site, "index.html"), "versie 1");
    writeFileSync(path.join(site, "img", "logo.svg"), "<svg/>");

    // 1. back-up: tar naar stdout, zoals over SSH
    const archive = sh(backupCommand(shPath(site)));
    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);
    const remoteTar = path.join(parent, ".zekerflex-terugzet-1.tar.gz");
    writeFileSync(remoteTar, archive);

    // 2. de site verandert daarna
    writeFileSync(path.join(site, "index.html"), "versie 2");

    // 3. terugzetten: uitpakken naast de webroot, dan wisselen
    const newDir = path.join(parent, ".zekerflex-nieuw-1");
    expect(sh(restoreExtractScript(shPath(remoteTar), shPath(newDir))).toString().trim()).toBe("ZF|EXTRACTED");
    expect(existsSync(remoteTar)).toBe(false); // alleen ons eigen tijdelijke archief is weg
    const oldDir = `${site}.zekerflex-voor-terugzetten-1`;
    expect(sh(swapScript(shPath(site), shPath(newDir), shPath(oldDir))).toString().trim()).toBe("ZF|SWAPPED");

    expect(readFileSync(path.join(site, "index.html"), "utf8")).toBe("versie 1");
    expect(readFileSync(path.join(site, "img", "logo.svg"), "utf8")).toBe("<svg/>");
    expect(readFileSync(path.join(oldDir, "index.html"), "utf8")).toBe("versie 2");
  });

  it("een kapot archief verandert niets aan de site", () => {
    const parent = path.join(base, "home2");
    const site = path.join(parent, "public_html");
    mkdirSync(site, { recursive: true });
    writeFileSync(path.join(site, "index.html"), "huidig");
    const remoteTar = path.join(parent, ".zekerflex-terugzet-2.tar.gz");
    writeFileSync(remoteTar, "geen archief");
    expect(sh(restoreExtractScript(shPath(remoteTar), shPath(path.join(parent, ".zekerflex-nieuw-2")))).toString().trim()).toBe("ZF|EXTRACTFAIL");
    expect(readFileSync(path.join(site, "index.html"), "utf8")).toBe("huidig");
  });
});
