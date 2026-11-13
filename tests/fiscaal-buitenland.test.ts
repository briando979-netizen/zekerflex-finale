import { beforeEach, describe, expect, it, vi } from "vitest";

// Eigenaar 13 nov: "de gegevens voor flexwerk en zzp zijn heel erg op Nederland ingericht; stel je hebt iets uit het
// buitenland, daar moeten we ook rekening mee houden". Op /dashboard/fiscaal ging het btw-nummer naar KVKBase, en viel die
// weg, dan werd elk nummer "niet geldig". Nu: VIES (EU-breed, gratis, zoals de onboarding), en een eerder geldig,
// ongewijzigd nummer blijft geldig als VIES even niet antwoordt. Bij het BSN: uitleg voor wie uit het buitenland komt (RNI).

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), principal: { userId: "u1", grants: [] }, vies: vi.fn() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal, requireRole: vi.fn() }));
vi.mock("@/lib/integrations/vies", () => ({ checkVies: (...a: unknown[]) => h.vies(...a) }));
vi.mock("@/lib/compliance/documents", () => ({ flagIbanChanged: vi.fn() }));
vi.mock("@/lib/fiscal/iban-bevestiging", () => ({ bevestigIbanWijziging: vi.fn() }));

import { getFiscal } from "@/lib/fiscal/store";
import { FOUTEN } from "@/lib/i18n/fouten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const route = await import("@/app/api/me/fiscal/route");
const put = (body: unknown) => (route.PUT as (r: Request) => Promise<Response>)(new Request("http://localhost/api/me/fiscal", { method: "PUT", body: JSON.stringify(body) }));
const vies = (status: "valid" | "invalid" | "malformed" | "unavailable", vatNumber = "BE0123456749") => ({ vatNumber, countryCode: vatNumber.slice(0, 2), status, name: null, address: null });

beforeEach(() => {
  h.kv.clear();
  h.vies.mockReset();
});

describe("btw-nummer op /dashboard/fiscaal", () => {
  it("een zzp'er uit België met een geldig EU-btw-nummer: geldig via VIES, en de fiscale gegevens zijn compleet", async () => {
    h.vies.mockResolvedValue(vies("valid"));
    const res = await put({ workerKind: "zzp", vatNumber: "be 0123.456.749", iban: "BE68539007547034" });
    expect(res.status).toBe(200);
    expect(h.vies).toHaveBeenCalledWith("BE0123456749");
    const f = await getFiscal("u1");
    expect(f).toMatchObject({ vatNumber: "BE0123456749", vatValid: true, vatStatus: "validated" });
    expect(f.completedAt).not.toBeNull();
  });

  it("VIES even onbereikbaar: een eerder geldig, ongewijzigd nummer blijft geldig (geen val uit de onboarding)", async () => {
    h.vies.mockResolvedValueOnce(vies("valid"));
    await put({ workerKind: "zzp", vatNumber: "BE0123456749", iban: "BE68539007547034" });
    h.vies.mockResolvedValueOnce(vies("unavailable"));
    await put({ workerKind: "zzp", vatNumber: "BE0123456749", iban: "BE68539007547034" });
    expect(await getFiscal("u1")).toMatchObject({ vatNumber: "BE0123456749", vatValid: true, vatStatus: "validated" });
  });

  it("VIES even onbereikbaar bij een NIEUW nummer: nog niet geldig, tot een volgende controle", async () => {
    h.vies.mockResolvedValueOnce(vies("valid"));
    await put({ workerKind: "zzp", vatNumber: "BE0123456749", iban: "BE68539007547034" });
    h.vies.mockResolvedValueOnce(vies("unavailable", "DE123456789"));
    await put({ workerKind: "zzp", vatNumber: "DE123456789", iban: "BE68539007547034" });
    expect(await getFiscal("u1")).toMatchObject({ vatNumber: "DE123456789", vatValid: false, vatStatus: "unvalidated" });
  });

  it("een ongeldig of verkeerd geschreven nummer is niet geldig", async () => {
    h.vies.mockResolvedValueOnce(vies("invalid"));
    await put({ workerKind: "zzp", vatNumber: "BE0123456749", iban: "BE68539007547034" });
    expect(await getFiscal("u1")).toMatchObject({ vatValid: false, vatStatus: "invalid" });
  });
});

describe("BSN voor wie uit het buitenland komt", () => {
  it("de melding noemt het RNI-loket, in alle vijf talen", () => {
    for (const sleutel of ["fiscal.bsnNodig", "fiscal.bsnFout"]) {
      const t = FOUTEN[sleutel];
      expect(t && Object.keys(t).sort(), sleutel).toEqual(["en", "nl", "pl", "ro", "uk"]);
      for (const [taal, tekst] of Object.entries(t ?? {})) expect(tekst, `${sleutel} ${taal}`).toMatch(/RNI/);
    }
  });
});

describe("het formulier zegt dat buitenlandse nummers werken", () => {
  it("bij het btw-nummer een ander EU-land, bij het IBAN elk SEPA-land, in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.fiscaalForm.btwHintLive, taal).toMatch(/BE0123456789/);
      expect(d.fiscaalForm.btwHintOptioneel, taal).toMatch(/VIES/);
      expect(d.fiscaalForm.ibanHint, taal).toMatch(/SEPA/);
    }
  });
});
