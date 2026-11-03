import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: vi.fn() }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: vi.fn() }));

import { workerMissed } from "@/lib/profile/card";

describe("workerMissed", () => {
  it("telt alleen zelf afzeggen en niet opkomen tegen de werker", () => {
    expect(workerMissed("Afgezegd door flexwerker: ziek")).toBe(true);
    expect(workerMissed("Afgezegd door flexwerker (buiten de opzegtermijn): auto kapot")).toBe(true);
    expect(workerMissed("Niet opgekomen (no-show, automatisch gedetecteerd)")).toBe(true);
    expect(workerMissed("Geannuleerd door opdrachtgever: te weinig werk")).toBe(false);
    expect(workerMissed("Vervangen via ZekerFlex (vrije vervanging)")).toBe(false);
    expect(workerMissed(null)).toBe(false);
  });
});
