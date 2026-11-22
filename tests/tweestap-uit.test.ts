import { describe, expect, it, vi } from "vitest";

// Tweestapsverificatie staat uit (21 nov 2026, eigenaar: "haal alle tweestapsverificatie weg, hoeft niet"). Ook een account dat
// het eerder aanzette, krijgt geen codestap meer: hasTwoFactor zegt overal "nee" en de login (lib/auth/nextauth.ts) vraagt dus niets.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

import { readFileSync } from "node:fs";
import { TWEESTAP_AAN } from "@/lib/auth/tweestap-aan";
import { hasTwoFactor, twoFactorStatus } from "@/lib/auth/two-factor";

const bron = (p: string) => readFileSync(p, "utf8");

describe("tweestapsverificatie staat uit", () => {
  it("de schakelaar staat uit", () => {
    expect(TWEESTAP_AAN).toBe(false);
  });

  it("een account dat het eerder aanzette, telt niet meer als tweestaps", async () => {
    kv.set("auth-2fa:u1", { secret: "verzegeld", pending: null, enabledAt: "2026-11-01T10:00:00.000Z", recovery: ["abc"], lastCounter: 5 });
    expect(await hasTwoFactor("u1")).toBe(false);
    expect(await twoFactorStatus("u1")).toEqual({ enabled: false, enabledAt: null, recoveryLeft: 0 });
  });

  it("geen scherm biedt het meer aan: werker, bedrijf, beheer en chat-instellingen", () => {
    for (const f of ["app/dashboard/account/page.tsx", "app/werkgever/account/page.tsx", "app/admin/beveiliging/page.tsx", "components/chat/ChatSettingsPanel.tsx", "components/admin/AdminShell.tsx"]) {
      const s = bron(f);
      expect(s, f).not.toContain("TwoFactorSettings");
      expect(s, f).not.toContain("tweestapsverificatie}");
      expect(s, f).not.toContain("2FA");
    }
    // de oude pagina stuurt door naar de passkeys (links uit oude mails en de hulp komen daar nog aan)
    expect(bron("app/dashboard/account/beveiliging/page.tsx")).toContain('redirect("/dashboard/account/passkeys")');
    // de API's doen niets meer
    for (const f of ["app/api/me/2fa/route.ts", "app/api/admin/2fa/route.ts"]) expect(bron(f), f).toContain("TWEESTAP_AAN");
    // de eigenaar krijgt geen taak meer om het aan te zetten
    expect(bron("lib/admin/owner-todos.ts")).not.toContain('"admin-2fa"');
  });
});
