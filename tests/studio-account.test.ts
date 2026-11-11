import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_ONDERDELEN, initialen, isAccountPad, studioAccountAdres } from "@/lib/studio/account";

// Eigenaar 11 nov: "bouw de hele webshop account dashboard af, apart; ik wil niet dat die in één
// dashboard van een werkgever is die zich alleen bezighoudt met freelancen en klussen uitzetten".
// Het account (bedrijf, facturen, team, mail, mijn account) staat in de studio zelf.

const m = vi.hoisted(() => ({ soort: "webshop" as string, redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => null),
  hasRole: (p: { grants: { role: string }[] }, ...rollen: string[]) => p.grants.some((g) => rollen.includes(g.role)),
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: vi.fn(async () => ({ tenantIds: ["t1"] })) }));
vi.mock("@/lib/werkgever/werkruimte-server", () => ({ werkruimteVan: vi.fn(async () => ({ soort: m.soort })) }));

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const beheerder = { userId: "u1", email: "a@b.test", fullName: "Jan de Vries", grants: [{ role: "HQ_ADMIN", organizationId: "t1" }] };

describe("de accountschermen van de studio", () => {
  it("elk onderdeel heeft een eigen pagina in de webshop en in de website", () => {
    for (const soort of ["webshop", "website"] as const) {
      for (const o of ACCOUNT_ONDERDELEN) {
        expect(existsSync(path.join(process.cwd(), "app/studio", soort, o.pad, "page.tsx")), `${soort}/${o.pad}`).toBe(true);
        expect(studioAccountAdres(soort, o.pad)).toBe(`/studio/${soort}/${o.pad}`);
      }
    }
  });

  it("herkent een accountadres (die werken ook zonder eigen site)", () => {
    expect(isAccountPad("/studio/webshop/bedrijf")).toBe(true);
    expect(isAccountPad("/studio/website/account")).toBe(true);
    expect(isAccountPad("/studio/webshop/facturen/123")).toBe(true);
    for (const nee of ["/studio/webshop", "/studio/webshop/producten", "/studio/webshop/accountx", "/werkgever/bedrijf", "/studio/winkel/team"]) expect(isAccountPad(nee), nee).toBe(false);
  });

  it("initialen voor de accountknop", () => {
    expect(initialen("Jan de Vries")).toBe("JV");
    expect(initialen("  shalomi ")).toBe("S");
    expect(initialen("")).toBe("?");
  });

  it("de studio linkt nergens meer naar het werkgeversdashboard; uitloggen kan in de studio zelf", () => {
    const shell = lees("components/studio/StudioShell.tsx");
    expect(shell).not.toMatch(/href[=:]\s*["`{]*\/werkgever/);
    expect(shell).toMatch(/<form action=\{logoutAction\}/);
    expect(lees("app/studio/webshop/verkopen/page.tsx")).not.toMatch(/href="\/werkgever"/);
    const schermen = lees("components/studio/account/Schermen.tsx");
    // geen personeelsonderdelen in het account van een webshop of website
    expect(schermen).not.toMatch(/import .*(FastPaySettings|VolumeCard)|\/werkgever\/(diensten|uren|planner)/);
  });

  it("de accountpagina's van /werkgever sturen naar de studio als die open is", () => {
    for (const pad of ["account", "bedrijf", "facturen", "team", "mail", "instellingen"]) {
      expect(lees(`app/werkgever/${pad}/page.tsx`), pad).toMatch(/await naarStudioAccount\(principal, "(account|bedrijf|facturen|team|mail)"\)/);
    }
  });
});

describe("naarStudioAccount", () => {
  beforeEach(() => {
    m.redirect.mockClear();
  });

  it("dashboard webshop of website open: naar hetzelfde onderdeel in de studio", async () => {
    const { naarStudioAccount } = await import("@/lib/studio/account-server");
    m.soort = "webshop";
    await expect(naarStudioAccount(beheerder as never, "facturen")).rejects.toThrow("NEXT_REDIRECT /studio/webshop/facturen");
    m.soort = "website";
    await expect(naarStudioAccount(beheerder as never, "account")).rejects.toThrow("NEXT_REDIRECT /studio/website/account");
  });

  it("het dashboard personeel, rijschool of horeca: gewoon de werkgeverspagina", async () => {
    const { naarStudioAccount } = await import("@/lib/studio/account-server");
    for (const soort of ["personeel", "rijschool", "horeca"]) {
      m.soort = soort;
      await expect(naarStudioAccount(beheerder as never, "facturen")).resolves.toBeUndefined();
    }
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("een collega zonder beheerrol mag de studio niet in en blijft dus hier", async () => {
    const { naarStudioAccount } = await import("@/lib/studio/account-server");
    m.soort = "webshop";
    await expect(naarStudioAccount({ ...beheerder, grants: [{ role: "LOCAL_MANAGER", organizationId: "t1" }] } as never, "team")).resolves.toBeUndefined();
    expect(m.redirect).not.toHaveBeenCalled();
  });
});
