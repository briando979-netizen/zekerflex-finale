import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Live zetten op de server van de klant: de scripts die over SSH draaien worden
// hier echt uitgevoerd in een wegwerpmap. Bewijs: er gaat nooit iets verloren,
// de oude site staat er na de wissel nog, en terugzetten is één wissel.

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListValues: async () => [] }));

const { inspectScript, parseInspect, q, remotePath, rollbackScript, swapScript, validateWebroot } = await import("@/lib/website/deploy");

const hasSh = (() => {
  try {
    execFileSync("sh", ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
})();
const sh = (script: string) => execFileSync("sh", ["-c", script], { encoding: "utf8" });
const posix = (p: string) => p.replace(/\\/g, "/");

const base = mkdtempSync(path.join(tmpdir(), "zf-deploy-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("map van de website", () => {
  it("accepteert gewone webroots en weigert gevaarlijke", () => {
    expect(validateWebroot("~/public_html")).toBe("~/public_html");
    expect(validateWebroot("/var/www/bakkerij/")).toBe("/var/www/bakkerij");
    expect(validateWebroot("~/domains/bakkerij.nl/public_html")).toBe("~/domains/bakkerij.nl/public_html");
    for (const bad of ["/", "/var", "~", "~/", "public_html", "/var/www/../../etc", "~/x; rm -rf ~", "/var/www/$(id)", "~/`id`", "/var/www/a b"]) {
      expect(validateWebroot(bad)).toBeNull();
    }
    expect(remotePath("~/public_html", "/home/bakkerij")).toBe("/home/bakkerij/public_html");
    expect(remotePath("/var/www/x", "/home/bakkerij")).toBe("/var/www/x");
  });

  it.skipIf(!hasSh)("citeert zo dat de shell niets uitvoert", () => {
    for (const nasty of ["it's", "$(echo gehackt)", "`echo gehackt`", "a b;c", "\\n"]) {
      expect(sh(`printf %s ${q(nasty)}`)).toBe(nasty);
    }
  });
});

describe.skipIf(!hasSh)("op een echte map", () => {
  const site = posix(path.join(base, "domains", "public_html"));
  const parent = posix(path.dirname(site));

  it("de controle vindt de map en weigert de thuismap", () => {
    mkdirSync(site, { recursive: true });
    writeFileSync(path.join(site, "index.php"), "oud");
    const r = parseInspect(sh(inspectScript(site)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files).toBe(1);
    expect(parseInspect(sh(inspectScript(posix(homedir()))))).toMatchObject({ ok: false });
    expect(parseInspect(sh(inspectScript(`${site}-bestaat-niet`)))).toMatchObject({ ok: false, reason: "Die map bestaat niet op de server." });
  });

  it("wisselt de nieuwe site erin en bewaart de oude compleet; terugzetten is één wissel", () => {
    const newDir = `${parent}/.zekerflex-nieuw-1`;
    const oldDir = `${site}.zekerflex-oud-1`;
    mkdirSync(newDir, { recursive: true });
    writeFileSync(path.join(newDir, "index.html"), "nieuw");

    expect(sh(swapScript(site, newDir, oldDir)).trim()).toBe("ZF|SWAPPED");
    expect(readFileSync(path.join(site, "index.html"), "utf8")).toBe("nieuw");
    expect(readFileSync(path.join(oldDir, "index.php"), "utf8")).toBe("oud");
    expect(existsSync(newDir)).toBe(false);

    const aside = `${parent}/.zekerflex-teruggedraaid-1`;
    expect(sh(rollbackScript(site, oldDir, aside)).trim()).toBe("ZF|ROLLEDBACK");
    expect(readFileSync(path.join(site, "index.php"), "utf8")).toBe("oud");
    expect(readFileSync(path.join(aside, "index.html"), "utf8")).toBe("nieuw");
  });

  it("raakt niets aan als de bewaarmap al bestaat of de nieuwe map ontbreekt", () => {
    const newDir = `${parent}/.zekerflex-nieuw-2`;
    const oldDir = `${site}.zekerflex-oud-2`;
    mkdirSync(newDir, { recursive: true });
    mkdirSync(oldDir, { recursive: true });
    expect(sh(swapScript(site, newDir, oldDir)).trim()).toBe("ZF|OLDEXISTS");
    expect(sh(swapScript(site, `${parent}/.bestaat-niet`, `${site}.zekerflex-oud-3`)).trim()).toBe("ZF|NONEW");
    expect(readFileSync(path.join(site, "index.php"), "utf8")).toBe("oud");
  });

  it("terugzetten zonder bewaarde oude site verandert niets", () => {
    expect(sh(rollbackScript(site, `${site}.weg`, `${parent}/.opzij`)).trim()).toBe("ZF|NOOLD");
    expect(readFileSync(path.join(site, "index.php"), "utf8")).toBe("oud");
  });
});
