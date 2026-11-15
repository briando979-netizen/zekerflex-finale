import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// De uitgang van de ZekerFlex VPN (15 nov 2026): een exit node op de server, zodat je op vreemde wifi via ZekerFlex
// internet op gaat. Hij mag nooit bij de interne diensten (Postgres en Redis zonder wachtwoord staan op internal).

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), "utf8").split("\r\n").join("\n");

function dienst(compose: string, naam: string): string {
  const start = compose.indexOf(`\n  ${naam}:\n`);
  if (start < 0) return "";
  const rest = compose.slice(start + 1);
  const eind = rest.slice(1).search(/\n  [a-z][\w-]*:\n/);
  return eind < 0 ? rest : rest.slice(0, eind + 1);
}

describe("de uitgang van de VPN", () => {
  const compose = lees("docker-compose.vps.yml");
  const blok = dienst(compose, "vpn-uitgang");

  it("een vastgezette Tailscale op een eigen netwerk, nooit op internal, met een geheugengrens", () => {
    expect(blok).toMatch(/image: tailscale\/tailscale:v\d+\.\d+\.\d+/);
    expect(blok).toContain("networks: [vpn-uitgang]");
    expect(blok).not.toMatch(/internal/);
    expect(blok).toMatch(/mem_limit: \d+m/);
    expect(blok).toContain("--advertise-exit-node");
    expect(blok).toContain("--login-server=https://vpn.zekerflex.com");
    // zonder nftables zet Tailscale op deze host geen NAT-regels en gaat er niets naar internet (15 nov gemeten)
    expect(blok).toContain("TS_DEBUG_FIREWALL_MODE: nftables");
    // geen sleutel in compose of in .env.production: aanmelden gaat eenmalig met aanmelden.sh
    expect(blok).not.toMatch(/TS_AUTHKEY/);
    expect(blok).not.toMatch(/ports:/);
  });

  it("de uitrol start hem, en het netwerk heeft geen andere diensten", () => {
    expect(lees("deploy/scripts/vps-update.sh")).toMatch(/up -d [^\n]*\bvpn-uitgang\b/);
    const anderen = compose.split("\n").filter((r) => /networks: \[[^\]]*\bvpn-uitgang\b/.test(r));
    expect(anderen).toHaveLength(1);
  });

  it("de VPN-regels: eigen apparaten onder elkaar, en internet via de uitgang; nooit iedereen naar alles", () => {
    const regels = lees("deploy/netwerk/headscale/policy.json");
    expect(regels).toContain('"dst": ["autogroup:self:*"]');
    expect(regels).toContain('"dst": ["autogroup:internet:*"]');
    expect(regels).not.toMatch(/"dst": \["\*(:\*)?"\]/);
  });

  it("het aanmeldscript drukt de toegangscode nooit af", () => {
    const script = lees("deploy/netwerk/uitgang/aanmelden.sh");
    expect(script).toContain("unset SLEUTEL");
    expect(script).not.toMatch(/echo[^\n]*\$SLEUTEL/);
    expect(script).toContain("headscale policy check");
  });
});
