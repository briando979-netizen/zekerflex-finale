import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// De versleutelde back-up naar de pc (13 nov 2026, deploy/backup/OPHALEN.md). Het vaste commando op de server
// (deploy/backup/ophalen.sh, achter één ssh-sleutel met restrict,command=) mag alleen de nieuwste volledige .enc-set
// noemen, één .enc-bestand geven en een markering zetten. Het pc-script (deploy/scripts/backup-naar-pc.sh) haalt via
// een tijdelijke map op, controleert grootte en sha256, en bewaart N sets. Hier draaien beide echt, met een nep-ssh.

const WRAPPER = path.resolve("deploy/backup/ophalen.sh");
const PC = path.resolve("deploy/scripts/backup-naar-pc.sh");
const kan = process.platform !== "win32" && spawnSync("bash", ["-c", "command -v sha256sum && command -v stat && command -v df"]).status === 0;

let tmp = "";
let dir = "";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
// binaire inhoud met nul-bytes, \r\n en 0xff: zo valt beschadiging onderweg op
const inhoud = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => [0, 13, 10, 255, i % 256][i % 5] ?? 0));

function zet(sub: string, naam: string, b: Buffer) {
  mkdirSync(path.join(dir, sub), { recursive: true });
  writeFileSync(path.join(dir, sub, naam), b);
}
function nacht(ts: string, opts: { enc?: boolean; storageEnc?: boolean } = {}) {
  zet("db", `zekerflex-${ts}.dump`, inhoud(100));
  zet("storage", `storage-${ts}.tar.gz`, inhoud(50));
  zet("forgejo", `forgejo-${ts}.tar.gz`, inhoud(30));
  if (opts.enc === false) return;
  zet("db", `zekerflex-${ts}.dump.enc`, inhoud(1000 + Number(ts.slice(6, 8))));
  if (opts.storageEnc !== false) zet("storage", `storage-${ts}.tar.gz.enc`, inhoud(700));
  zet("forgejo", `forgejo-${ts}.tar.gz.enc`, inhoud(300));
}
const status = (ts: string, ok: boolean) =>
  writeFileSync(path.join(dir, "status.json"), `{"at":"2026-11-13T02:30:42Z","ok":${ok},"file":"zekerflex-${ts}.dump","bytes":1,"restore":{"ok":true,"tables":1,"users":1,"liveUsers":1}}\n`);

function vraag(verzoek: string) {
  const r = spawnSync("bash", [WRAPPER], { env: { PATH: process.env.PATH ?? "", HOME: tmp, ZF_BACKUP_DIR: dir, SSH_ORIGINAL_COMMAND: verzoek } as unknown as NodeJS.ProcessEnv });
  return { code: r.status, uit: r.stdout, fout: r.stderr.toString() };
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "zf-ophalen-"));
  dir = path.join(tmp, "backups");
  mkdirSync(path.join(dir, "ophaal"), { recursive: true });
  nacht("20261112-0230");
  nacht("20261113-0230");
  // de nacht die nog bezig is: de dump is al versleuteld, de uploads nog niet
  nacht("20261114-0230", { storageEnc: false });
  // een nacht zonder wachtwoordzin (geen .enc)
  nacht("20261110-0230", { enc: false });
  status("20261113-0230", true);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe.skipIf(!kan)("het vaste ophaalcommando op de server", () => {
  it("lijst: de nieuwste volledige set met grootte en sha256; een halve set telt niet", () => {
    const r = vraag("lijst");
    expect(r.code).toBe(0);
    const ts = "20261113-0230";
    const db = inhoud(1013);
    expect(r.uit.toString().trim().split("\n")).toEqual([
      `set ${ts}`,
      `zekerflex-${ts}.dump.enc ${db.length} ${sha(db)}`,
      `storage-${ts}.tar.gz.enc 700 ${sha(inhoud(700))}`,
      `forgejo-${ts}.tar.gz.enc 300 ${sha(inhoud(300))}`,
    ]);
  });

  it("lijst: de nacht die status.json mislukt noemt, slaat hij over", () => {
    status("20261113-0230", false);
    expect(vraag("lijst").uit.toString().split("\n")[0]).toBe("set 20261112-0230");
  });

  it("lijst zonder .enc (geen wachtwoordzin): een fout, geen platte bestanden", () => {
    rmSync(dir, { recursive: true });
    mkdirSync(dir);
    nacht("20261110-0230", { enc: false });
    const r = vraag("lijst");
    expect(r.code).toBe(2);
    expect(r.uit.length).toBe(0);
    expect(r.fout).toContain("BACKUP_PASSPHRASE");
  });

  it("haal: precies de bytes van het .enc-bestand", () => {
    const r = vraag("haal storage-20261113-0230.tar.gz.enc");
    expect(r.code).toBe(0);
    expect(Buffer.compare(r.uit, inhoud(700))).toBe(0);
  });

  it("haal weigert paden, platte dumps, extra woorden, meerdere regels en onbekende verzoeken", () => {
    for (const v of [
      "haal ../status.json",
      "haal zekerflex-20261113-0230.dump",
      "haal /etc/passwd",
      "haal db/zekerflex-20261113-0230.dump.enc",
      "haal zekerflex-20261113-0230.dump.enc extra",
      "haal zekerflex-20261113-0230.dump.enc;cat /etc/passwd",
      "haal zekerflex-20261113-0230.dump.enc\nlijst",
      "lijst nu",
      "cat /etc/passwd",
      "scp -f zekerflex-20261113-0230.dump.enc",
      "internal-sftp",
      "",
    ]) {
      const r = vraag(v);
      expect(r.code, v).toBe(2);
      expect(r.uit.length, v).toBe(0);
    }
  });

  it("haal volgt geen symbolische koppeling", () => {
    symlinkSync(path.join(dir, "status.json"), path.join(dir, "db", "zekerflex-20261111-0230.dump.enc"));
    const r = vraag("haal zekerflex-20261111-0230.dump.enc");
    expect(r.code).toBe(2);
    expect(r.uit.length).toBe(0);
  });

  it("klaar: zet de markering voor Beheer; alleen voor een bestaande set en met een markeermap", () => {
    expect(vraag("klaar 20261113-0230").code).toBe(0);
    const m = JSON.parse(readFileSync(path.join(dir, "ophaal", "laatst.json"), "utf8")) as { at: string; set: string };
    expect(m.set).toBe("20261113-0230");
    expect(Number.isNaN(Date.parse(m.at))).toBe(false);
    expect(vraag("klaar 20261113-0230/../x").code).toBe(2);
    expect(vraag("klaar 20260101-0000").code).toBe(2);
    rmSync(path.join(dir, "ophaal"), { recursive: true });
    expect(vraag("klaar 20261113-0230").code).toBe(2);
  });
});

describe("BACKUP_KEEP_ENC: de .enc-kopieën met een eigen termijn (13 nov)", () => {
  const script = readFileSync("deploy/backup/entrypoint.sh", "utf8");
  it("elke soort .enc wordt met KEEP_ENC opgeruimd, de originelen met KEEP; standaard gelijk aan BACKUP_KEEP", () => {
    for (const [map, patroon] of [["db", "*.dump"], ["storage", "*.tar.gz"], ["forgejo", "*.tar.gz"]] as const) {
      expect(script).toContain(`prune "$DIR/${map}" "${patroon}.enc" "$KEEP_ENC"`);
      expect(script).toMatch(new RegExp(`prune "\\$DIR/${map}" "\\${patroon}"\\n`));
    }
    expect(script).toContain('KEEP_ENC="${BACKUP_KEEP_ENC:-$KEEP}"');
    expect(readFileSync("docker-compose.vps.yml", "utf8")).toMatch(/BACKUP_KEEP_ENC: \$\{BACKUP_KEEP_ENC:-14\}/);
  });
});

describe.skipIf(!kan)("het ophaalscript op de pc (met een nep-ssh)", () => {
  let pc = "";
  let nep = "";
  beforeEach(() => {
    pc = path.join(tmp, "pc");
    nep = path.join(tmp, "ssh-nep");
    // neemt de ssh-opties van het pc-script aan en start het vaste commando zoals sshd met command= dat doet
    writeFileSync(
      nep,
      [
        "#!/usr/bin/env bash",
        'while [ $# -gt 0 ]; do case "$1" in -n) shift ;; -i|-o) shift 2 ;; *) break ;; esac; done',
        "shift",
        'export SSH_ORIGINAL_COMMAND="$*"',
        'if [ -n "${NEP_KAPOT:-}" ] && [ "$1" = haal ]; then bash "$WRAPPER"; printf x; exit 0; fi',
        'exec bash "$WRAPPER"',
        "",
      ].join("\n"),
    );
    chmodSync(nep, 0o755);
  });
  const draai = (extra: Record<string, string> = {}) =>
    spawnSync("bash", [PC], {
      env: { PATH: process.env.PATH ?? "", HOME: tmp, WRAPPER, ZF_BACKUP_DIR: dir, ZF_OPHAAL_SSH: nep, ZF_OPHAAL_HOST: "nep@server", ZF_OPHAAL_SLEUTEL: "/dev/null", ZF_OPHAAL_DOEL: pc, ...extra } as unknown as NodeJS.ProcessEnv,
    });
  const log = () => readFileSync(path.join(pc, "ophalen.log"), "utf8");

  it("haalt de nieuwste set op, controleert hem, zet de markering en schrijft één regel", () => {
    expect(draai().status).toBe(0);
    const ts = "20261113-0230";
    expect(readdirSync(path.join(pc, ts)).sort()).toEqual([`forgejo-${ts}.tar.gz.enc`, `storage-${ts}.tar.gz.enc`, `zekerflex-${ts}.dump.enc`]);
    expect(Buffer.compare(readFileSync(path.join(pc, ts, `zekerflex-${ts}.dump.enc`)), inhoud(1013))).toBe(0);
    expect(log()).toMatch(/ok: 20261113-0230, 3 bestanden/);
    expect((JSON.parse(readFileSync(path.join(dir, "ophaal", "laatst.json"), "utf8")) as { set: string }).set).toBe(ts);
    // een tweede keer: al binnen, niets opnieuw
    expect(draai().status).toBe(0);
    expect(log()).toMatch(/al binnen: 20261113-0230/);
  });

  it("een beschadigd bestand: niets hernoemd, de tijdelijke map weg, een FOUT-regel", () => {
    expect(draai({ NEP_KAPOT: "1" }).status).toBe(1);
    expect(existsSync(path.join(pc, "20261113-0230"))).toBe(false);
    expect(readdirSync(pc).filter((n) => n.startsWith(".bezig-"))).toEqual([]);
    expect(log()).toMatch(/FOUT: zekerflex-20261113-0230\.dump\.enc: grootte klopt niet/);
    expect(existsSync(path.join(dir, "ophaal", "laatst.json"))).toBe(false);
  });

  it("bewaart alleen de nieuwste sets, andere mappen blijven", () => {
    for (const oud of ["20261101-0230", "20261102-0230", "20261103-0230", "eigen-map"]) mkdirSync(path.join(pc, oud), { recursive: true });
    expect(draai({ ZF_OPHAAL_BEWAAR: "2" }).status).toBe(0);
    expect(readdirSync(pc).filter((n) => !n.startsWith(".") && n !== "ophalen.log").sort()).toEqual(["20261103-0230", "20261113-0230", "eigen-map"]);
  });

  it("geen set op de server: een FOUT-regel, geen map", () => {
    rmSync(path.join(dir, "db"), { recursive: true });
    expect(draai().status).toBe(1);
    expect(log()).toMatch(/FOUT: geen lijst van de server/);
  });
});
