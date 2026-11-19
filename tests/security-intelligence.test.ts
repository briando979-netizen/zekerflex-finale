import { describe, expect, it } from "vitest";
import { telSignalen, tijdlijn, type Signaal } from "@/lib/security/intelligence-regels";

// Pure regels van ZekerFlex Security Intelligence. Vaste tijden met zone, zodat de test geen tijdbom is.

const NU = Date.parse("2026-11-19T12:00:00Z");
const s = (id: string, at: string, action: string, over: Partial<Signaal> = {}): Signaal => ({
  id,
  at,
  category: action.startsWith("auth.login.failed") ? "AUTH" : "SECURITY",
  action,
  severity: "info",
  summary: `gebeurtenis ${id}`,
  ...over,
});

describe("telSignalen", () => {
  it("telt mislukte logins en slots alleen binnen 24 uur", () => {
    const t = telSignalen(
      [
        s("a", "2026-11-19T11:00:00Z", "auth.login.failed"),
        s("b", "2026-11-18T13:00:00Z", "auth.login.failed"),
        s("c", "2026-11-17T13:00:00Z", "auth.login.failed"), // ouder dan 24 uur
        s("d", "2026-11-19T10:00:00Z", "auth.login.locked", { severity: "warning" }),
        s("e", "2026-11-16T10:00:00Z", "auth.login.locked", { severity: "warning" }), // oud slot telt niet als slot, wel als actie
      ],
      NU,
    );
    expect(t.mislukt24u).toBe(2);
    expect(t.slot24u).toBe(1);
    expect(t.beveiliging).toBe(2);
    expect(t.ernstig).toBe(2);
  });

  it("een mislukte login telt niet als beveiligingsactie", () => {
    const t = telSignalen([s("a", "2026-11-19T11:00:00Z", "auth.login.failed")], NU);
    expect(t.beveiliging).toBe(0);
  });

  it("een onleesbare tijd telt niet in de 24-uurscijfers", () => {
    const t = telSignalen([s("a", "rommel", "auth.login.failed")], NU);
    expect(t.mislukt24u).toBe(0);
  });
});

describe("tijdlijn", () => {
  it("vat mislukte logins samen per uur en houdt de rest los, nieuwste eerst", () => {
    const uit = tijdlijn([
      s("a", "2026-11-19T11:05:00Z", "auth.login.failed"),
      s("b", "2026-11-19T11:40:00Z", "auth.login.failed"),
      s("c", "2026-11-19T09:10:00Z", "auth.login.failed"),
      s("d", "2026-11-19T11:50:00Z", "auth.2fa.disabled", { severity: "warning", summary: "Tweestaps uitgezet" }),
    ]);
    expect(uit.map((r) => r.tekst)).toEqual(["Tweestaps uitgezet", "2 mislukte inlogpogingen in dit uur", "1 mislukte inlogpoging"]);
    expect(uit[0]?.ernstig).toBe(true);
  });

  it("veel mislukte logins in één uur is ernstig", () => {
    const veel = Array.from({ length: 20 }, (_, i) => s(`x${i}`, `2026-11-19T11:${String(i).padStart(2, "0")}:00Z`, "auth.login.failed"));
    expect(tijdlijn(veel)[0]?.ernstig).toBe(true);
  });
});
