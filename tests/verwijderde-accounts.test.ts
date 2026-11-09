import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

const { isVertrekreden, vertrekredenLabel, VERTREKREDENEN } = await import("@/lib/privacy/vertrekredenen");
const { dagenTussen, doorVan, duurNl } = await import("@/lib/admin/insights/verwijderd");

describe("vertrekredenen", () => {
  it("alleen een waarde uit de vaste lijst telt", () => {
    expect(isVertrekreden("te-weinig-klussen")).toBe(true);
    expect(isVertrekreden("mijn naam is Jan")).toBe(false);
    expect(isVertrekreden("")).toBe(false);
    expect(isVertrekreden(null)).toBe(false);
  });
  it("elke reden heeft een unieke sleutel en een Nederlands label", () => {
    const ids = VERTREKREDENEN.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(vertrekredenLabel("privacy")).toBe("Zorgen over mijn privacy");
    expect(vertrekredenLabel("bestaat-niet")).toBeNull();
  });
  it("het formulier heeft geen vrij tekstveld voor de reden", () => {
    const form = readFileSync(join(__dirname, "..", "components/auth/ConfirmAccountDeletionForm.tsx"), "utf8");
    expect(form).toContain('<select name="reden"');
    expect(form).not.toMatch(/<textarea/);
  });
});

describe("verwijderde accounts", () => {
  it("wie verwijderde het: zelf, beheer of automatisch", () => {
    expect(doorVan("u1", null, "Account u1 geanonimiseerd (AVG art. 17) — zelf verwijderd via publieke aanvraag")).toBe("zelf");
    expect(doorVan("u1", "u1", "Account u1 geanonimiseerd")).toBe("zelf");
    expect(doorVan("u1", "admin", "Account u1 geanonimiseerd — verwijderd via admin door x")).toBe("beheer");
    expect(doorVan("u1", null, "Account u1 geanonimiseerd (bewaartermijn verstreken)")).toBe("systeem");
  });
  it("hoe lang iemand lid was, in gewoon Nederlands", () => {
    const van = new Date("2026-01-01T12:00:00+01:00");
    expect(dagenTussen(van, new Date("2026-01-11T12:00:00+01:00"))).toBe(10);
    expect(dagenTussen(van, null)).toBeNull();
    expect(duurNl(null)).toBe("Onbekend");
    expect(duurNl(0)).toBe("Minder dan een dag");
    expect(duurNl(1)).toBe("1 dag");
    expect(duurNl(12)).toBe("12 dagen");
    expect(duurNl(95)).toBe("3 maanden");
    expect(duurNl(800)).toBe("2 jaar");
  });
});
