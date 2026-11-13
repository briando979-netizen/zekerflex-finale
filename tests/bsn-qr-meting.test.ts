import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
}));

import { bsnQrDuurKlasse, bsnQrSleutel, telBsnQr } from "@/lib/kyc/id-soort-meting";

// 13 nov 2026: of het BSN-voorstel uit de QR lukte en hoe lang het lezen duurde, als totaal per maand. Het lezen loopt na het
// antwoord van de scan; met deze telling (en de klikken) zien we of een werker die meteen doorklikt het voorstel mist.

describe("telling BSN uit de QR", () => {
  it("duurklassen: onder 2 s, tot en met 5 s, daarboven", () => {
    expect(bsnQrDuurKlasse(0)).toBe("onder_2s");
    expect(bsnQrDuurKlasse(1999)).toBe("onder_2s");
    expect(bsnQrDuurKlasse(2000)).toBe("tot_5s");
    expect(bsnQrDuurKlasse(5000)).toBe("tot_5s");
    expect(bsnQrDuurKlasse(5001)).toBe("boven_5s");
  });

  it("telt per Amsterdamse maand, alleen totalen: geen userId, geen nummer", async () => {
    const nu = new Date("2026-11-30T23:30:00Z"); // in Amsterdam al 1 december
    await telBsnQr(true, 1200, nu);
    await telBsnQr(false, 6000, nu);
    expect(bsnQrSleutel(nu)).toBe("meting:bsn-qr:2026-12");
    expect(h.kv.get("meting:bsn-qr:2026-12")).toEqual({ gelezen: 1, niet_gelezen: 1, onder_2s: 1, tot_5s: 0, boven_5s: 1 });
    expect([...h.kv.keys()]).toEqual(["meting:bsn-qr:2026-12"]);
  });

  it("verify.ts telt na het lezen en vóór het bewaren, en een storing in de telling houdt niets tegen", () => {
    const s = readFileSync(path.join(process.cwd(), "lib/onboarding/verify.ts"), "utf8");
    expect(s).toContain("await telBsnQr(voorstel !== null, Date.now() - begon).catch(() => undefined);");
    expect(s.indexOf("telBsnQr(")).toBeLessThan(s.indexOf("await bewaarBsnVoorstel(user.id, voorstel);"));
  });
});
