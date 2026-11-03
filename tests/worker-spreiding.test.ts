import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), invoiceModeFor: vi.fn() }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: vi.fn() }));

import { spreadMilestone, type ClientWork } from "@/lib/worker/milestones";

const work = (name: string, hours: number, rateCents = 2000): ClientWork => ({ tenantId: name, name, minutes: hours * 60, grossCents: hours * rateCents });

describe("spreadMilestone (Wet DBA)", () => {
  it("zegt niets onder de 60 uur", () => {
    const m = spreadMilestone([work("A", 50)], 0.7);
    expect(m.status).toBe("info");
    expect(m.progress).toBeUndefined();
  });

  it("is in orde bij een goede verdeling", () => {
    const m = spreadMilestone([work("A", 40), work("B", 35), work("C", 25)], 0.7);
    expect(m.status).toBe("ok");
    expect(m.headline).toBe("40% bij A");
    expect(m.detail).toContain("3 opdrachtgevers");
  });

  it("waarschuwt vanaf 15 procentpunt onder de grens", () => {
    expect(spreadMilestone([work("A", 60), work("B", 40)], 0.7).status).toBe("soon");
  });

  it("vraagt om actie op of boven de DBA-grens, op omzet en niet op uren", () => {
    // 50 uur × € 30 bij A tegen 50 uur × € 10 bij B → 75% van de omzet bij A
    const m = spreadMilestone([work("A", 50, 3000), work("B", 50, 1000)], 0.7);
    expect(m.status).toBe("action");
    expect(m.headline).toBe("75% bij A");
    expect(m.progress).toEqual({ value: 75, max: 100, unit: "%", label: "van je omzet bij je grootste opdrachtgever (grens 70%)" });
    expect(m.detail).toContain("Wet DBA");
  });
});
