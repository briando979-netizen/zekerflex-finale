import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De TURN-relay (deploy/coturn/entrypoint.sh) draait op de server zelf, met het
// host-netwerk. Een fout hier maakt een open doorgeefluik naar de database of
// Redis. Het script wordt hier echt uitgevoerd (droog: het toont het commando).

const SCRIPT = path.join(process.cwd(), "deploy", "coturn", "entrypoint.sh").replace(/\\/g, "/");
const hasSh = (() => {
  try {
    execFileSync("sh", ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
})();
const SECRET = "dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LW9mLTQ0LWNoYXJzLQ==";
const run = (env: Record<string, string>) => execFileSync("sh", [SCRIPT], { encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", TURN_DRY_RUN: "1", ...env } });

describe.skipIf(!hasSh)("TURN-relay op de server", () => {
  it("blijft uit zonder sleutel of met een te korte sleutel", () => {
    expect(run({})).toContain("TURN staat uit");
    expect(run({ TURN_SHARED_SECRET: "x".repeat(31), TURN_RELAY_IPS: "37.97.226.24" })).toContain("TURN staat uit");
  });

  it("start met de sleutel op het publieke adres, en toont de sleutel nooit", () => {
    const cmd = run({ TURN_SHARED_SECRET: SECRET, TURN_RELAY_IPS: "37.97.226.24 2a01:7c8::1" });
    expect(cmd).toMatch(/^turnserver /);
    expect(cmd).not.toContain(SECRET);
    expect(cmd).toContain("--static-auth-secret=***");
    for (const flag of ["--use-auth-secret", "--lt-cred-mech", "--relay-ip=37.97.226.24", "--listening-ip=37.97.226.24", "--relay-ip=2a01:7c8::1", "--min-port=49160", "--max-port=49260"]) {
      expect(cmd).toContain(flag);
    }
  });

  it("stuurt alleen UDP door, en nooit naar interne of gereserveerde adressen", () => {
    const cmd = run({ TURN_SHARED_SECRET: SECRET, TURN_RELAY_IPS: "37.97.226.24" });
    for (const flag of ["--no-tcp-relay", "--no-multicast-peers", "--no-cli"]) expect(cmd).toContain(flag);
    const denied = [...cmd.matchAll(/--denied-peer-ip=(\S+)/g)].map((m) => m[1]);
    expect(denied).toEqual(
      expect.arrayContaining([
        "10.0.0.0-10.255.255.255", // privé
        "172.16.0.0-172.31.255.255", // docker: database, Redis, de app
        "192.168.0.0-192.168.255.255",
        "127.0.0.0-127.255.255.255", // de server zelf
        "169.254.0.0-169.254.255.255", // metadata van de hoster
        "100.64.0.0-100.127.255.255", // CGNAT
        "::1",
        "::ffff:0.0.0.0-::ffff:255.255.255.255", // IPv4 verpakt in IPv6
        "64:ff9b::-64:ff9b::ffff:ffff", // NAT64
        "fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
        "fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      ]),
    );
  });

  it("laat geen bereik bij het nul-adres beginnen (dan weigert coturn alle IPv4 of alle IPv6)", () => {
    // coturn 4.6.3 slaat bij een ondergrens 0.0.0.0 of :: de controle over en
    // rekent elk adres van de andere familie mee: "::-::1" blokkeerde 1.1.1.1.
    const cmd = run({ TURN_SHARED_SECRET: SECRET, TURN_RELAY_IPS: "37.97.226.24" });
    const lows = [...cmd.matchAll(/--denied-peer-ip=([^\s-]+)/g)].map((m) => m[1]);
    expect(lows.length).toBeGreaterThan(10);
    expect(lows.filter((low) => /^(0\.0\.0\.0|::|0:0:0:0:0:0:0:0)$/.test(low!))).toEqual([]);
  });

  it("heeft hetzelfde relaybereik als de firewallregel bij installatie", () => {
    const install = readFileSync(path.join(process.cwd(), "deploy", "scripts", "deploy-vps.sh"), "utf8");
    expect(install).toContain("ufw allow 49160:49260/udp");
    expect(install).toContain("ufw allow 3478/udp");
  });
});
