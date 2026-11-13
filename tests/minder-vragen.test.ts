import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 13 nov 2026, eigenaar: "er zijn nog veel te veel vragen". /dashboard/fiscaal hoort niet meer bij de aanmelding: btw en
// KOR staan in GegevensMist, de KVK uit de woonstap gaat mee naar de fiscale gegevens, en aanmelden heeft één
// wachtwoordveld. De route voegt alleen meegestuurde sleutels samen, zodat een oudere stand niets stil terugzet.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), principal: { userId: "w1", roles: ["FREELANCER"], fullName: "Test Werker" } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal, requireRole: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// de btw gaat via VIES (lib/integrations/vies, 13 nov): hier altijd geldig, met het opgeschoonde nummer terug
vi.mock("@/lib/integrations/vies", () => ({ checkVies: vi.fn(async (n: string) => ({ status: "valid", vatNumber: n })) }));
vi.mock("@/lib/compliance/documents", () => ({ flagIbanChanged: vi.fn() }));
vi.mock("@/lib/fiscal/iban-bevestiging", () => ({ bevestigIbanWijziging: vi.fn() }));

import { EMPTY_FISCAL, fiscaalIngevuld, getFiscal } from "@/lib/fiscal/store";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { AUTH_DICTS } from "@/lib/i18n/auth";

const route = await import("@/app/api/me/fiscal/route");
const put = (body: unknown) => (route.PUT as (r: Request) => Promise<Response>)(new Request("http://localhost/api/me/fiscal", { method: "PUT", body: JSON.stringify(body) }));
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

beforeEach(() => h.kv.clear());

describe("PUT /api/me/fiscal: een sleutel die ontbreekt, blijft zoals hij was", () => {
  it("de loonheffingskorting blijft staan als het btw-veld vanuit GegevensMist wordt opgeslagen (aan en uit)", async () => {
    for (const lhk of [true, false]) {
      // uitdrukkelijk gekozen (merk gezet): zonder dat merk geldt de korting niet (lib/fiscal/store.ts, normaliseerFiscal)
      h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", loonheffingskorting: lhk, loonheffingskortingGekozen: true, korApplies: true, iban: "NL91ABNA0417164300" });
      const res = await put({ workerKind: "flexwerker", vatRequested: true });
      expect(res.status).toBe(200);
      const f = await getFiscal("w1");
      expect(f.loonheffingskorting).toBe(lhk);
      // ook de KOR en het rekeningnummer blijven
      expect(f.korApplies).toBe(true);
      expect(f.iban).toBe("NL91ABNA0417164300");
      expect(f.vatRequested).toBe(true);
    }
  });

  it("een zzp'er met KVK en 'btw aangevraagd' is daarna fiscaal ingevuld", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "zzp" });
    const res = await put({ workerKind: "zzp", vatRequested: true, kvkNumber: "12345678" });
    expect(res.status).toBe(200);
    const f = await getFiscal("w1");
    expect(f.kvkNumber).toBe("12345678");
    expect(fiscaalIngevuld(f)).toBe(true);
  });

  it("wat wel wordt meegestuurd (zoals FiscalForm doet), wordt gewoon opgeslagen", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker", korApplies: true, vatRequested: true, loonheffingskorting: false });
    const res = await put({ workerKind: "flexwerker", korApplies: false, vatRequested: false, loonheffingskorting: true, vatNumber: "NL123456789B01" });
    expect(res.status).toBe(200);
    const f = await getFiscal("w1");
    expect(f).toMatchObject({ korApplies: false, vatRequested: false, loonheffingskorting: true, vatNumber: "NL123456789B01", vatValid: true });
  });

  it("de antwoorden van de route bevatten de stand van de server (GegevensMist neemt die over)", async () => {
    h.kv.set("fiscal:w1", { ...EMPTY_FISCAL, workerKind: "flexwerker" });
    const d = (await (await put({ workerKind: "flexwerker", vatNumber: "nl 123456789 b01" })).json()) as { vatNumber: string };
    expect(d.vatNumber).toBe("NL123456789B01");
  });
});

describe("minder vragen bij de aanmelding", () => {
  const mist = bron("components/app/GegevensMist.tsx");
  it("GegevensMist stuurt alleen btw, KOR en KVK mee (geen loonheffingskorting of andere vlaggen)", () => {
    expect(mist).toContain('const body: Record<string, unknown> = { workerKind: soort, vatRequested: aangevraagd };');
    expect(mist).toContain('JSON.stringify({ workerKind: "uitzendkracht", bsn: bsn.trim() })');
    expect(mist).toContain('JSON.stringify({ workerKind: "uitzendkracht", bsnVoorstelOk: true })');
    expect(mist).not.toMatch(/loonheffingskorting/);
    expect(mist).toContain("<BtwVeld soort={soort}");
  });

  it("de KVK uit de woonstap gaat naar de fiscale gegevens als daar nog niets staat", () => {
    const v = bron("lib/onboarding/verify.ts");
    expect(v).toContain("if (f && !f.kvkNumber) await setFiscal(input.userId, { kvkNumber: cleanKvk }).catch(() => undefined);");
  });

  it("aanmelden: één wachtwoordveld met tonen/verbergen (aria-pressed), sterktemeting en lek-controle blijven", () => {
    const r = bron("components/auth/RegisterForm.tsx");
    expect(r).not.toContain('name="passwordConfirm"');
    expect(r).toContain("aria-pressed={showPw}");
    expect(r).toContain("!(pwInfo?.breached ?? false)");
    expect(r).toContain("((pwInfo?.score ?? 0) >= 2 || pwCheckUnavailable)");
    // wachtwoord herstellen en de team-uitnodiging houden het tweede veld
    expect(bron("components/app/TeamInviteAccept.tsx")).toContain('name="passwordConfirm"');
  });

  it("teksten in vijf talen; uitzendNote verwijst niet meer naar een BSN-veld bij 'Uitzenden'", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["opslaan", "bezig", "korAanvragen"] as const) expect(d.gegevensMist.btw[k].length, `${taal} ${k}`).toBeGreaterThan(3);
    }
    for (const [taal, d] of Object.entries(AUTH_DICTS)) expect(d.onb.uitzendNote, taal).not.toMatch(/“Uitzenden”|“Agency work”/);
    expect(AUTH_DICTS.nl.onb.uitzendNote).toMatch(/verderop op deze pagina/);
    // het rekeningnummer hoort niet bij de onboarding (pas nodig bij het uitbetalen; tests/thuisbasis-plek.test.ts)
    for (const [taal, d] of Object.entries(AUTH_DICTS)) expect(d.onb.uitzendNote, taal).not.toMatch(/rekeningnummer|bank account|numer konta|contul bancar|рахунок|IBAN/i);
  });
});
