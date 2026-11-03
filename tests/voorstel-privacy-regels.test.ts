import { describe, expect, it } from "vitest";
import { hoortBij, komendeReservering } from "@/lib/voorstel/privacy-regels";

describe("inzage en verwijderen", () => {
  it("herkent rijen als contact of als account, hoofdletters maken niet uit", () => {
    expect(hoortBij({ email: "Rita@Example.com" }, "rita@example.com")).toBe(true);
    expect(hoortBij({ email: "ander@example.com", account: "rita@example.com" }, " RITA@example.com ")).toBe(true);
    expect(hoortBij({ email: "ander@example.com" }, "rita@example.com")).toBe(false);
    expect(hoortBij({}, "rita@example.com")).toBe(false);
  });

  it("alleen een reservering van vandaag of later die doorgaat houdt wissen tegen", () => {
    const b = (datum: string, status: string, tijd = "14:00") => ({ datum, tijd, status });
    expect(komendeReservering([b("2026-11-01", "bevestigd"), b("2026-11-05", "geannuleerd")], "2026-11-03")).toBeUndefined();
    expect(komendeReservering([b("2026-11-09", "nieuw"), b("2026-11-03", "bevestigd", "18:00")], "2026-11-03")).toEqual(b("2026-11-03", "bevestigd", "18:00"));
  });
});
